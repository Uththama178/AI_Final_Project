"""Context-aware MCQ generator supporting Hugging Face T5 and rule-based fallback."""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Local path kept for reference / future offline use
FINE_TUNED_MODEL_PATH = "saved_models/learnify_t5"

# Hugging Face model used for MCQ generation
HF_MCQ_MODEL_ID = "Uththama/flan-t5-mcq-model"

_hf_tokenizer = None
_hf_model = None
_hf_load_failed = False

# Optional MCQ quality guardrails (never hard-fail the generator if import fails)
_filter_valid_mcqs: Optional[Callable[..., list]] = None
_raw_generation_looks_garbage: Optional[Callable[..., bool]] = None
try:
    from rag_core.mcq_validator import (  # type: ignore
        filter_valid_mcqs as _filter_valid_mcqs,
        raw_generation_looks_garbage as _raw_generation_looks_garbage,
    )
except Exception:
    try:
        from .mcq_validator import (  # type: ignore
            filter_valid_mcqs as _filter_valid_mcqs,
            raw_generation_looks_garbage as _raw_generation_looks_garbage,
        )
    except Exception:
        logger.warning(
            "mcq_validator could not be imported; T5 outputs will use legacy parse-only checks."
        )
        _filter_valid_mcqs = None
        _raw_generation_looks_garbage = None


def generate_mcqs_from_context(context: str, num_questions: int = 5) -> list[dict[str, Any]]:
    """
    Generate structured MCQs based on the provided context chunks.

    Tries the Hugging Face Flan-T5 MCQ model first.
    On any failure, falls back to the rule-based generator.

    Args:
        context: Text chunks retrieved from the vector store.
        num_questions: Target number of MCQs to generate (default: 5).

    Returns:
        A list of dictionaries with keys: question, options, correct_answer, explanation.
    """
    if not context or not context.strip():
        logger.warning("Empty context provided to generator. Returning default response.")
        return _get_fallback_questions()

    try:
        mcqs = _generate_with_hf_t5_model(context, num_questions)
        if _filter_valid_mcqs is not None and mcqs:
            try:
                mcqs = _filter_valid_mcqs(mcqs)
            except Exception:
                logger.exception("MCQ validator filter failed; keeping pre-filter HF results.")

        if mcqs and len(mcqs) >= num_questions:
            logger.info(
                "Generated %d MCQ(s) via Hugging Face model %s",
                len(mcqs),
                HF_MCQ_MODEL_ID,
            )
            return mcqs[:num_questions]

        if mcqs:
            # Partial HF success after validation — fill the rest with rule-based items
            logger.warning(
                "Only %d valid HF MCQ(s); topping up with rule-based generator.",
                len(mcqs),
            )
            rule_mcqs = _generate_rule_based_mcqs(context, num_questions)
            merged = list(mcqs)
            for item in rule_mcqs:
                if len(merged) >= num_questions:
                    break
                merged.append(item)
            return merged[:num_questions] if merged else _get_fallback_questions()

        logger.warning("HF model returned no usable MCQs; falling back to rule-based generator.")
        return _generate_rule_based_mcqs(context, num_questions)
    except Exception:
        logger.exception(
            "HF MCQ generation failed for model %s; falling back to rule-based generator.",
            HF_MCQ_MODEL_ID,
        )
        try:
            return _generate_rule_based_mcqs(context, num_questions)
        except Exception:
            logger.exception("Rule-based MCQ generation also failed; returning static fallback.")
            return _get_fallback_questions()


def _load_hf_mcq_model() -> tuple[Any, Any]:
    """Lazy-load and cache the Hugging Face T5 tokenizer + model."""
    global _hf_tokenizer, _hf_model, _hf_load_failed

    if _hf_load_failed:
        raise RuntimeError("Hugging Face MCQ model previously failed to load.")

    if _hf_tokenizer is not None and _hf_model is not None:
        return _hf_tokenizer, _hf_model

    from transformers import T5ForConditionalGeneration, T5Tokenizer
    import torch

    logger.info("Loading Hugging Face MCQ model: %s", HF_MCQ_MODEL_ID)
    tokenizer = T5Tokenizer.from_pretrained(HF_MCQ_MODEL_ID)
    model = T5ForConditionalGeneration.from_pretrained(HF_MCQ_MODEL_ID)
    model.eval()

    # Prefer GPU when available; otherwise stay on CPU
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    _hf_tokenizer = tokenizer
    _hf_model = model
    logger.info("Hugging Face MCQ model loaded on device=%s", device)
    return _hf_tokenizer, _hf_model


def _clean_context_for_t5(text: str) -> str:
    """
    Lightweight RAG passage cleaner used only before T5 generation.

    Strips boilerplate, empty lines, page artifacts, and non-factual noise
    while preserving factual sentence content. Does not alter prompt prefixes,
    parsing, validation, or API shapes.
    """
    if not text or not str(text).strip():
        return ""

    cleaned = str(text)

    # Drop known pipeline markers / form-feeds / soft hyphens
    cleaned = cleaned.replace("\x0c", " ").replace("\u00ad", "")
    cleaned = re.sub(
        r"(?i)\[?\s*VIDEO\s+TRANSCRIPT\s+CONTENT\s*\]?",
        " ",
        cleaned,
    )

    # Page / header / footer style artifacts common in PDF extracts
    cleaned = re.sub(r"(?im)^\s*(?:page\s*)?\d+\s*(?:of\s*\d+)?\s*$", " ", cleaned)
    cleaned = re.sub(r"(?i)\bpage\s+\d+\s*(?:of\s*\d+)?\b", " ", cleaned)
    cleaned = re.sub(r"(?im)^\s*[-–—_]{3,}\s*$", " ", cleaned)
    cleaned = re.sub(r"(?im)^\s*\d{1,4}\s*$", " ", cleaned)

    # Remove URLs and emails (noise for short MCQ support text)
    cleaned = re.sub(r"https?://\S+|www\.\S+", " ", cleaned)
    cleaned = re.sub(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", " ", cleaned)

    # Collapse runs of non-alphanumeric noise (keep basic punctuation)
    cleaned = re.sub(r"[^\w\s\.\,\?\!\;\:\'\"\(\)\-\/%]+", " ", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"([.!?]){3,}", r"\1", cleaned)
    cleaned = re.sub(r"([-_=]){3,}", " ", cleaned)

    # Line-level filter: drop empty / mostly non-letter lines
    kept_lines: list[str] = []
    for raw_line in cleaned.splitlines():
        line = " ".join(raw_line.split()).strip()
        if not line:
            continue
        letters = sum(1 for ch in line if ch.isalpha())
        if letters < 8:
            continue
        if letters / max(len(line), 1) < 0.35:
            continue
        kept_lines.append(line)

    cleaned = " ".join(kept_lines) if kept_lines else " ".join(cleaned.split())
    cleaned = " ".join(cleaned.split()).strip()
    return cleaned


def _split_context_passages(context: str, num_questions: int) -> list[str]:
    """Split retrieved context into short passages for per-question generation."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", context) if len(s.strip()) > 20]
    if not sentences:
        cleaned = " ".join(context.split())
        return [cleaned[:400]] if cleaned else []

    passages: list[str] = []
    # Group nearby sentences so each prompt has enough context
    for i in range(0, len(sentences), max(1, len(sentences) // max(num_questions, 1))):
        chunk = " ".join(sentences[i : i + 2]).strip()
        if chunk:
            passages.append(chunk[:500])
        if len(passages) >= num_questions:
            break

    while len(passages) < num_questions and sentences:
        passages.append(sentences[len(passages) % len(sentences)][:500])

    return passages[:num_questions]


def _build_t5_prompt(passage: str) -> str:
    """Build a T5/Flan-T5 style prompt for MCQ generation."""
    return (
        "generate question: "
        f"{passage.strip()}"
    )


# Lightweight stopwords for passage entity extraction (parser §4 only)
_PASSAGE_ENTITY_STOPWORDS = frozenset(
    {
        "a", "an", "the", "and", "or", "but", "if", "in", "on", "at", "to", "for",
        "of", "is", "are", "was", "were", "be", "been", "being", "have", "has",
        "had", "do", "does", "did", "will", "would", "could", "should", "may",
        "might", "must", "can", "this", "that", "these", "those", "it", "its",
        "as", "by", "from", "with", "about", "into", "through", "during", "before",
        "after", "above", "below", "between", "out", "off", "over", "under", "again",
        "further", "then", "once", "here", "there", "when", "where", "why", "how",
        "all", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
        "not", "only", "own", "same", "so", "than", "too", "very", "just", "also",
        "which", "what", "who", "whom", "whose", "their", "them", "they", "we",
        "you", "your", "our", "his", "her", "him", "she", "he", "i", "me", "my",
    }
)


def _extract_passage_entities(passage: str, *, exclude: set[str] | None = None) -> list[str]:
    """
    Derive distinct content words / short phrases from a retrieved passage
    for use as context-driven MCQ distractors (parser §4 only).
    """
    text = " ".join((passage or "").split()).strip()
    if not text:
        return []

    exclude_norm = {e.lower() for e in (exclude or set()) if e}
    candidates: list[str] = []
    seen: set[str] = set()

    def _consider(raw: str) -> None:
        value = " ".join(raw.split()).strip(" ,.;:!?\"'()[]")
        if not value:
            return
        key = value.lower()
        if key in seen or key in exclude_norm:
            return
        # Drop phrases that are only stopwords
        parts = re.findall(r"[A-Za-z][A-Za-z0-9\-]*", value)
        content = [p for p in parts if p.lower() not in _PASSAGE_ENTITY_STOPWORDS and len(p) >= 4]
        if not content:
            return
        if len(value) < 4:
            return
        seen.add(key)
        candidates.append(value)

    # Prefer short multi-word noun-like phrases (2–3 tokens)
    for match in re.finditer(
        r"\b([A-Z][a-zA-Z0-9\-]*(?:\s+[A-Za-z][a-zA-Z0-9\-]*){1,2})\b",
        text,
    ):
        _consider(match.group(1))

    # Then single content tokens (length >= 4, not stopwords)
    for token in re.findall(r"[A-Za-z][A-Za-z0-9\-]{3,}", text):
        if token.lower() in _PASSAGE_ENTITY_STOPWORDS:
            continue
        _consider(token)

    return candidates


def _parse_mcq_output(raw_text: str, passage: str) -> dict[str, Any] | None:
    """
    Parse model text into {question, options, correct_answer, explanation}.

    Supports:
    - Multi-line Question / A / B / C / D / Answer blocks
    - Single continuous lines like: "What is X? A) ... B) ... C) ... D) ... Answer: A"
    """
    text = (raw_text or "").strip()
    if not text:
        return None

    # Collapse odd spacing but keep enough structure for markers
    normalized = " ".join(text.split())

    options_map: dict[str, str] = {}
    question = ""
    correct_answer: str | None = None
    inline_options_found = False

    # -------------------------------------------------------------
    # 1) Primary: split on inline/single-line A) B) C) D) markers
    #    Works with or without newlines before each letter.
    # -------------------------------------------------------------
    # Split keeps the letter markers as captured groups.
    # Example:
    #   "Q text? A) foo B) bar C) baz D) qux Answer: A"
    # → ["Q text?", "A", "foo", "B", "bar", "C", "baz", "D", "qux Answer: A"]
    split_parts = re.split(
        r"(?i)(?:(?<=^)|(?<=\s)|(?<=[?\.\!;:]))([A-D])\s*[\)\.\:\-]\s*",
        normalized,
    )

    if len(split_parts) >= 9:
        # Expected: [question, A, optA, B, optB, C, optC, D, optD(+optional answer tail)]
        tentative_q = split_parts[0].strip()
        tentative_map: dict[str, str] = {}
        i = 1
        while i + 1 < len(split_parts):
            letter = split_parts[i].upper()
            value = split_parts[i + 1].strip()
            if letter in "ABCD" and letter not in tentative_map:
                tentative_map[letter] = value
            i += 2

        if all(k in tentative_map for k in ("A", "B", "C", "D")):
            inline_options_found = True
            # Strip trailing "Answer: X" / "Correct: X" off option D (and any option)
            answer_tail_re = re.compile(
                r"(?i)\s*(?:correct\s*answer|answer|correct)\s*[:\-]\s*([A-D]|.*)$"
            )
            for key in ("A", "B", "C", "D"):
                opt_val = tentative_map[key]
                ans_in_opt = answer_tail_re.search(opt_val)
                if ans_in_opt:
                    ans_raw = ans_in_opt.group(1).strip()
                    tentative_map[key] = answer_tail_re.sub("", opt_val).strip()
                    if correct_answer is None:
                        if len(ans_raw) == 1 and ans_raw.upper() in "ABCD":
                            correct_answer = ans_raw.upper()
                        elif ans_raw:
                            correct_answer = ans_raw

            options_map = {k: " ".join(tentative_map[k].split()) for k in ("A", "B", "C", "D")}
            question = " ".join(tentative_q.split())
            # Also strip a leading "Question:" label if present
            question = re.sub(r"(?i)^question\s*[:\-]\s*", "", question).strip()

    # -------------------------------------------------------------
    # 2) Fallback path: newline-oriented option blocks (legacy)
    # -------------------------------------------------------------
    if not inline_options_found:
        option_matches = re.findall(
            r"(?:^|\n|\s)([A-Da-d])\s*[\)\.\:\-]\s*(.+?)(?=(?:\s+[A-Da-d]\s*[\)\.\:\-])|(?:\s+(?:answer|correct)\s*[:\-])|$)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        for letter, opt_text in option_matches:
            cleaned = " ".join(opt_text.strip().split())
            cleaned = re.sub(
                r"(?i)\s*(?:correct\s*answer|answer|correct)\s*[:\-]\s*.*$",
                "",
                cleaned,
            ).strip()
            if cleaned and letter.upper() not in options_map:
                options_map[letter.upper()] = cleaned

        if all(k in options_map for k in ("A", "B", "C", "D")):
            inline_options_found = True

        # Question = text before the first A)/A./A: marker
        first_opt = re.search(
            r"(?i)(?:^|\s)([A-D])\s*[\)\.\:\-]\s+",
            normalized,
        )
        if first_opt:
            question = normalized[: first_opt.start()].strip()
        else:
            question_match = re.search(
                r"(?is)(?:question\s*[:\-]\s*)(.+?)(?=(?:\s*[A-D]\s*[\)\.\:\-])|(?:\s*answer\s*[:\-])|$)",
                text,
            )
            if question_match:
                question = " ".join(question_match.group(1).strip().split())
            else:
                question = normalized

        question = re.sub(r"(?i)^question\s*[:\-]\s*", "", question).strip()
        # Remove any glued option/answer remnants still stuck on the question
        question = re.split(
            r"(?i)(?:^|\s)[A-D]\s*[\)\.\:\-]\s+",
            question,
            maxsplit=1,
        )[0].strip()
        question = re.sub(
            r"(?i)\s*(?:correct\s*answer|answer|correct)\s*[:\-]\s*.*$",
            "",
            question,
        ).strip()

    # -------------------------------------------------------------
    # 3) Correct answer letter/text (global Answer: ... if not already set)
    # -------------------------------------------------------------
    if correct_answer is None:
        answer_match = re.search(
            r"(?i)(?:correct\s*answer|answer|correct)\s*[:\-]\s*([A-D]|[^\n]+)",
            text,
        )
        if answer_match:
            ans_raw = answer_match.group(1).strip()
            if len(ans_raw) == 1 and ans_raw.upper() in "ABCD":
                letter = ans_raw.upper()
                correct_answer = options_map.get(letter, letter)
            else:
                # Trim if answer text accidentally includes more options
                correct_answer = " ".join(ans_raw.split())
                correct_answer = re.split(
                    r"(?i)\s+[A-D]\s*[\)\.\:\-]\s+",
                    correct_answer,
                    maxsplit=1,
                )[0].strip()

    # If correct_answer is still a letter, map to option text
    if correct_answer and len(correct_answer) == 1 and correct_answer.upper() in "ABCD":
        letter = correct_answer.upper()
        correct_answer = options_map.get(letter, letter)

    options = [options_map[k] for k in ("A", "B", "C", "D") if k in options_map]

    # Final cleanup: never leave option markers glued inside the question
    if question:
        question = re.split(
            r"(?i)\s+[A-D]\s*[\)\.\:\-]\s+",
            question,
            maxsplit=1,
        )[0].strip()
        question = re.sub(
            r"(?i)\s*(?:correct\s*answer|answer|correct)\s*[:\-]\s*.*$",
            "",
            question,
        ).strip()
        question = " ".join(question.split())

    # -------------------------------------------------------------
    # 4) Context-driven distractors ONLY when no inline A–D options
    #    were found. Never fabricate "Option N" labels.
    # -------------------------------------------------------------
    if not inline_options_found and len(options) < 4:
        exclude = {question} if question else set()
        exclude.update(options)
        entities = _extract_passage_entities(passage, exclude=exclude)

        if len(options) == 0:
            if len(entities) >= 4:
                options = entities[:4]
                correct_answer = options[0]
            # else: leave incomplete → fail closed below (return None)
        else:
            existing = {o.lower() for o in options}
            for entity in entities:
                if len(options) >= 4:
                    break
                if entity.lower() not in existing:
                    options.append(entity)
                    existing.add(entity.lower())
            # If still < 4, do not invent fillers — fail closed below

    if not question:
        return None

    if len(options) < 4:
        # Incomplete parse after context-driven fill — reject so caller can fall back
        return None

    if not correct_answer:
        correct_answer = options[0]

    return {
        "question": question,
        "options": options[:4],
        "correct_answer": correct_answer,
        "explanation": f"Generated by Hugging Face model ({HF_MCQ_MODEL_ID}) from retrieved context.",
    }


def _generate_with_hf_t5_model(context: str, num_questions: int = 5) -> list[dict[str, Any]]:
    """Run Flan-T5 MCQ generation over context passages."""
    import torch

    try:
        tokenizer, model = _load_hf_mcq_model()
    except Exception:
        global _hf_load_failed
        _hf_load_failed = True
        raise

    # Clean retrieved RAG text once before passage split / T5 prompting
    cleaned_context = _clean_context_for_t5(context)
    if not cleaned_context:
        # Avoid hard-failing generation if cleaning was too aggressive
        cleaned_context = " ".join((context or "").split()).strip()

    passages = _split_context_passages(cleaned_context, num_questions)
    if not passages:
        raise ValueError("No usable passages extracted from context for HF generation.")

    device = next(model.parameters()).device
    mcqs: list[dict[str, Any]] = []

    for passage in passages:
        # Light per-passage pass so leftover artifacts never reach the prompt
        passage = _clean_context_for_t5(passage) or " ".join(passage.split()).strip()
        if not passage:
            continue
        prompt = _build_t5_prompt(passage)
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            max_length=512,
            truncation=True,
            padding=True,
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_length=128,
                num_beams=4,
                early_stopping=True,
                no_repeat_ngram_size=2,
                repetition_penalty=1.2,
            )

        raw = tokenizer.decode(output_ids[0], skip_special_tokens=True)

        # Guardrail: skip clearly garbage / single-letter raw T5 strings
        if _raw_generation_looks_garbage is not None:
            try:
                if _raw_generation_looks_garbage(raw):
                    logger.warning("Skipping garbage raw T5 output for one passage.")
                    continue
            except Exception:
                logger.exception(
                    "raw_generation_looks_garbage check failed; continuing with parse."
                )

        parsed = _parse_mcq_output(raw, passage)
        if parsed:
            mcqs.append(parsed)

    # Guardrail: drop weak / empty-option / duplicate-style MCQs
    if _filter_valid_mcqs is not None and mcqs:
        try:
            before = len(mcqs)
            mcqs = _filter_valid_mcqs(mcqs)
            if len(mcqs) < before:
                logger.info(
                    "MCQ validator kept %d/%d HF question(s).",
                    len(mcqs),
                    before,
                )
        except Exception:
            logger.exception("filter_valid_mcqs failed; using unfiltered parsed MCQs.")

    if not mcqs:
        raise ValueError("HF model produced no valid MCQ outputs after validation.")

    # Do NOT duplicate weak HF items. Caller tops up with rule-based fallback.
    return mcqs[:num_questions]


def _generate_rule_based_mcqs(context: str, num_questions: int = 5) -> list[dict[str, Any]]:
    """Extract key sentences from context and convert them into structured MCQs."""
    # Clean and split context into sentences
    sentences = [s.strip() for s in re.split(r"(?<=[.!?]) +", context) if len(s.strip()) > 20]

    if not sentences:
        return _get_fallback_questions()

    mcqs = []
    for index, sentence in enumerate(sentences[:num_questions]):
        words = sentence.split()
        if len(words) < 5:
            continue

        # Choose a key word/phrase from sentence to blank out
        target_word = words[len(words) // 2].strip(",.!?")
        question_text = sentence.replace(target_word, "_______")

        options = [
            target_word,
            f"Not {target_word}",
            f"{target_word}_alt",
            "None of the above"
        ]

        mcqs.append({
            "question": f"Q{index + 1}: Fill in the blank: '{question_text}'",
            "options": options,
            "correct_answer": target_word,
            "explanation": f"Based on the text: '{sentence}'"
        })

    # Top up with fallback questions if fewer sentences than required
    while len(mcqs) < num_questions:
        fallback_idx = len(mcqs) + 1
        mcqs.append({
            "question": f"Q{fallback_idx}: What is the main subject discussed in this chapter snippet?",
            "options": ["Core Concepts", "Advanced Implementation", "General Overview", "None of the above"],
            "correct_answer": "Core Concepts",
            "explanation": "Extracted key focus point from the provided study material."
        })

    return mcqs


def _get_fallback_questions() -> list[dict[str, Any]]:
    """Return default fallback MCQs when no context is available."""
    return [
        {
            "question": "What is the primary focus of this learning module?",
            "options": ["Core Concepts", "Implementation Details", "Practical Examples", "All of the above"],
            "correct_answer": "All of the above",
            "explanation": "General summary question generated for this chapter."
        }
    ]
