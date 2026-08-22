"""
MCQ output guardrails for T5 / Flan-T5 generation.

Standalone validation helpers — does not alter model weights, training, or
architecture. Existing generators can optionally import and call these
functions after parsing model text, e.g.:

    from rag_core.mcq_validator import filter_valid_mcqs, is_valid_mcq

No existing backend files are modified by this module itself.

Contract for filter_valid_mcqs:
  - Drops weak, nonsensical, or poorly parsed items
  - Always returns exactly ``num_questions`` items (default 5)
  - Pads with clean, context-aware fallbacks when needed (never garbage)
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional

# ---------------------------------------------------------------------------
# Tunable thresholds — strict enough to drop weak / filler MCQs
# ---------------------------------------------------------------------------
MIN_QUESTION_CHARS = 20
MIN_QUESTION_WORDS = 5
MIN_OPTION_CHARS = 3
MIN_OPTION_WORDS = 1
MAX_OPTION_CHARS = 300
MAX_QUESTION_CHARS = 500
TARGET_MCQ_COUNT = 5

# Patterns that usually mean garbage / collapsed T5 output
_SINGLE_LETTER_RE = re.compile(r"^[A-Da-d]$")
_MOSTLY_NON_ALPHA_RE = re.compile(r"^[^A-Za-z0-9]*$")
_REPEATED_CHAR_RE = re.compile(r"^(.)\1{3,}$")  # aaaa, ....
_GARBAGE_TOKEN_RE = re.compile(
    r"(?i)\b(asdf|qwer|zxcv|lorem|ipsum|null|undefined|n/?a|xxx+|test123|"
    r"option\s*[a-d1-4]|placeholder|todo|fix)\b"
)
_OPTION_MARKER_ONLY_RE = re.compile(r"^[A-D]\s*[\)\.\:\-]\s*$", re.IGNORECASE)
# Rule-based / parse filler patterns: "Not photosynthesis", "cell_alt"
_NOT_PREFIX_RE = re.compile(r"(?i)^not\s+\S+$")
_ALT_SUFFIX_RE = re.compile(r"(?i).+_alt$")
_FILLER_OPTION_RE = re.compile(
    r"(?i)^(none|all|both|n/?a|unknown|option\s*[a-d1-4]|choice\s*[a-d1-4])$"
)
_INTERROGATIVE_RE = re.compile(
    r"(?i)\b(what|which|who|when|where|why|how|select|choose|identify|"
    r"define|describe|explain|according|based)\b"
)
_STOPWORDS = frozenset(
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
        "which", "what", "who", "whom", "whose", "select", "choose", "following",
        "correct", "answer", "option", "question", "based", "according", "material",
        "passage", "text", "context", "chapter", "lesson", "none", "above",
    }
)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len([w for w in re.split(r"\s+", text) if w])


def normalize_mcq_dict(mcq: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize common MCQ key shapes into a canonical form:

        {
          "question": str,
          "options": [A, B, C, D],  # length 4 when possible
          "correct_answer": str,    # option text or letter A–D
          "explanation": str,
        }
    """
    if not isinstance(mcq, dict):
        return {
            "question": "",
            "options": [],
            "correct_answer": "",
            "explanation": "",
        }

    question = _as_text(
        mcq.get("question")
        or mcq.get("Question_Text")
        or mcq.get("Question")
        or ""
    )

    options: list[str] = []
    raw_options = mcq.get("options")
    if isinstance(raw_options, (list, tuple)):
        options = [_as_text(o) for o in raw_options]
    else:
        for key in ("A", "B", "C", "D"):
            val = mcq.get(f"Option_{key}") or mcq.get(key)
            if val is not None:
                options.append(_as_text(val))

    # Keep at most 4 for MCQ validation
    options = options[:4]

    correct = _as_text(
        mcq.get("correct_answer")
        or mcq.get("Correct_Answer")
        or mcq.get("answer")
        or ""
    )
    explanation = _as_text(mcq.get("explanation") or mcq.get("Explanation") or "")

    return {
        "question": question,
        "options": options,
        "correct_answer": correct,
        "explanation": explanation,
    }


def is_garbage_text(text: str, *, min_chars: int = 1, min_words: int = 1) -> bool:
    """Return True if text looks empty, single-letter, or nonsensical."""
    value = _as_text(text)
    if not value:
        return True
    if len(value) < min_chars:
        return True
    if _word_count(value) < min_words:
        return True
    if _SINGLE_LETTER_RE.match(value):
        return True
    if _MOSTLY_NON_ALPHA_RE.match(value):
        return True
    if _REPEATED_CHAR_RE.match(value):
        return True
    if _OPTION_MARKER_ONLY_RE.match(value):
        return True
    if _GARBAGE_TOKEN_RE.search(value):
        return True
    # Mostly the same character repeated with spaces: "a a a a"
    compact = re.sub(r"\s+", "", value)
    if len(compact) >= 4 and len(set(compact.lower())) == 1:
        return True
    return False


def is_weak_question(question: str) -> bool:
    """Reject questions that are too short, vague, or not question-like."""
    q = _as_text(question)
    if is_garbage_text(q, min_chars=MIN_QUESTION_CHARS, min_words=MIN_QUESTION_WORDS):
        return True
    if len(q) > MAX_QUESTION_CHARS:
        return True

    has_question_mark = "?" in q
    has_cue = bool(_INTERROGATIVE_RE.search(q))
    # Strict: need a clear interrogative signal for short stems
    if not has_question_mark and not has_cue:
        return True
    if not has_question_mark and _word_count(q) < 7:
        return True

    # Reject stems that are basically just a noun phrase / single clause filler
    alpha_ratio = sum(ch.isalpha() for ch in q) / max(len(q), 1)
    if alpha_ratio < 0.55:
        return True

    return False


def is_weak_option(option: str) -> bool:
    """Reject empty, marker-only, filler, or parse-artifact options."""
    opt = _as_text(option)
    if is_garbage_text(opt, min_chars=MIN_OPTION_CHARS, min_words=MIN_OPTION_WORDS):
        return True
    if len(opt) > MAX_OPTION_CHARS:
        return True
    if re.match(r"^[A-D]$", opt, re.IGNORECASE):
        return True
    if _NOT_PREFIX_RE.match(opt):
        return True
    if _ALT_SUFFIX_RE.match(opt):
        return True
    if _FILLER_OPTION_RE.match(opt):
        return True
    # Tiny single-token options are usually parse leftovers
    if _word_count(opt) == 1 and len(opt) < 4:
        return True
    return False


def options_are_duplicates(options: Iterable[str]) -> bool:
    """True if any two options match after case-insensitive normalization."""
    seen: set[str] = set()
    for opt in options:
        key = _as_text(opt).lower()
        if not key:
            return True
        if key in seen:
            return True
        seen.add(key)
    return False


def _options_look_like_parse_fillers(options: list[str]) -> bool:
    """
    Detect classic weak patterns:
      [word, Not word, word_alt, None]
      all single short tokens
    """
    if len(options) != 4:
        return True

    cleaned = [_as_text(o) for o in options]
    if any(_NOT_PREFIX_RE.match(o) or _ALT_SUFFIX_RE.match(o) for o in cleaned):
        return True

    # Too many ultra-short single tokens → poorly parsed
    short_singles = sum(1 for o in cleaned if _word_count(o) == 1 and len(o) <= 6)
    if short_singles >= 3:
        return True

    # "X" / "Not X" pair is a common rule-based artifact
    lowers = [o.lower() for o in cleaned]
    for o in lowers:
        if o.startswith("not ") and o[4:].strip() in lowers:
            return True

    return False


def _question_aligned_with_options(question: str, options: list[str]) -> bool:
    """Light check: question and options should not be identical / empty of meaning."""
    q = _as_text(question).lower().rstrip("?")
    for opt in options:
        o = _as_text(opt).lower()
        if o and q == o:
            return False
    return True


def resolve_correct_letter(mcq: dict[str, Any]) -> Optional[str]:
    """
    Return 'A'|'B'|'C'|'D' if the correct answer can be resolved; else None.
    Accepts letter or matching option text.
    """
    norm = normalize_mcq_dict(mcq)
    options = norm["options"]
    if len(options) < 4:
        return None

    correct = norm["correct_answer"]
    if not correct:
        return None

    if len(correct) == 1 and correct.upper() in "ABCD":
        return correct.upper()

    for idx, letter in enumerate("ABCD"):
        if correct.lower() == options[idx].lower():
            return letter

    # Soft contains match (avoid matching empty / tiny strings)
    for idx, letter in enumerate("ABCD"):
        opt = options[idx]
        if len(opt) < 3 or len(correct) < 2:
            continue
        if opt.lower() in correct.lower() or correct.lower() in opt.lower():
            return letter

    return None


def validate_mcq(mcq: dict[str, Any], *, context: str | None = None) -> tuple[bool, list[str]]:
    """
    Validate one MCQ dict for meaning, clarity, and structure.

    Returns:
        (ok, reasons) — ok is True only if all guardrails pass.
    """
    reasons: list[str] = []
    norm = normalize_mcq_dict(mcq)
    question = norm["question"]
    options = norm["options"]

    if is_weak_question(question):
        reasons.append("question_weak_or_nonsensical")

    if len(options) != 4:
        reasons.append(f"expected_4_options_got_{len(options)}")
    else:
        for i, opt in enumerate(options):
            if is_weak_option(opt):
                reasons.append(f"option_{'ABCD'[i]}_weak_or_garbage")
        if options_are_duplicates(options):
            reasons.append("duplicate_options")
        if _options_look_like_parse_fillers(options):
            reasons.append("options_look_like_parse_fillers")
        if not _question_aligned_with_options(question, options):
            reasons.append("question_option_misaligned")

    letter = resolve_correct_letter(norm)
    if letter is None:
        reasons.append("correct_answer_unresolved")

    # Optional: soft context alignment — at least one content word overlaps
    if context and question and not reasons:
        ctx_tokens = _content_tokens(context)
        q_tokens = _content_tokens(question)
        if ctx_tokens and q_tokens and not (q_tokens & ctx_tokens):
            # Also allow overlap via option text
            opt_tokens: set[str] = set()
            for o in options:
                opt_tokens |= _content_tokens(o)
            if not (opt_tokens & ctx_tokens):
                reasons.append("not_aligned_with_context")

    return (len(reasons) == 0, reasons)


def is_valid_mcq(mcq: dict[str, Any], *, context: str | None = None) -> bool:
    """Convenience boolean wrapper around validate_mcq()."""
    ok, _ = validate_mcq(mcq, context=context)
    return ok


def _content_tokens(text: str) -> set[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", text.lower())
    return {t for t in tokens if t not in _STOPWORDS}


def _extract_topic_phrases(
    context: str | None,
    mcqs: list[dict[str, Any]],
    *,
    limit: int = 12,
) -> list[str]:
    """
    Harvest meaningful topic terms from optional context and/or MCQ text
    so padding stays context-aware even when the caller passes only mcqs.
    """
    blob_parts: list[str] = []
    if context:
        blob_parts.append(context[:4000])
    for mcq in mcqs or []:
        norm = normalize_mcq_dict(mcq)
        blob_parts.append(norm["question"])
        blob_parts.extend(norm["options"])
        if norm["explanation"]:
            blob_parts.append(norm["explanation"])

    blob = " ".join(blob_parts)
    counts: dict[str, int] = {}
    for tok in _content_tokens(blob):
        counts[tok] = counts.get(tok, 0) + 1

    # Prefer longer / more frequent tokens
    ranked = sorted(counts.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)
    phrases = [w for w, _ in ranked[:limit]]

    # Also pull a few multi-word noun-ish snippets from context/questions
    for sentence in re.split(r"[.!?\n]+", blob):
        sentence = _as_text(sentence)
        if 20 <= len(sentence) <= 90:
            words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9\-]*", sentence) if w.lower() not in _STOPWORDS]
            if 2 <= len(words) <= 6:
                phrase = " ".join(words[:4])
                if phrase.lower() not in {p.lower() for p in phrases}:
                    phrases.append(phrase)
        if len(phrases) >= limit:
            break

    return phrases[:limit]


def _make_mcq(
    question: str,
    options: list[str],
    correct_letter: str = "A",
    explanation: str = "",
) -> dict[str, Any]:
    opts = [_as_text(o) for o in options[:4]]
    while len(opts) < 4:
        opts.append(f"Related concept {len(opts) + 1}")
    letter = correct_letter.upper() if correct_letter.upper() in "ABCD" else "A"
    idx = "ABCD".index(letter)
    return {
        "question": _as_text(question),
        "options": opts,
        "correct_answer": opts[idx],
        "explanation": _as_text(explanation)
        or "Derived from the provided learning material to complete a full practice set.",
    }


def _build_context_aware_fallbacks(
    needed: int,
    *,
    context: str | None,
    seed_mcqs: list[dict[str, Any]],
    exclude_questions: set[str],
) -> list[dict[str, Any]]:
    """
    Produce clean, meaningful padding MCQs aligned to available topic cues.
    Never returns empty / garbage options.
    """
    if needed <= 0:
        return []

    topics = _extract_topic_phrases(context, seed_mcqs)
    # Guaranteed readable defaults if no topic signal exists
    if not topics:
        topics = [
            "the main concept",
            "key terminology",
            "the central idea",
            "important details",
            "core principles",
            "the learning objective",
        ]

    templates = [
        (
            "According to the material, which statement best describes {topic}?",
            [
                "{topic} is a central idea discussed in the material",
                "{topic} is unrelated to the lesson content",
                "{topic} should be ignored when studying this topic",
                "{topic} appears only as a formatting artifact",
            ],
            "A",
            "The first option reflects how the topic is used in the source material.",
        ),
        (
            "Which of the following is most accurate about {topic}?",
            [
                "It is an important idea learners should understand from the material",
                "It has no connection to the provided content",
                "It is only a distractor with no meaning",
                "It contradicts the learning goals of the chapter",
            ],
            "A",
            "Meaningful review questions focus on concepts actually present in the material.",
        ),
        (
            "Based on the learning content, what role does {topic} play?",
            [
                "It helps explain or organize ideas in the material",
                "It is intentionally left undefined and unused",
                "It replaces all other concepts in the lesson",
                "It is used only as a random filler phrase",
            ],
            "A",
            "Context-aware practice checks understanding of roles and relationships.",
        ),
        (
            "When reviewing this material, how should a learner approach {topic}?",
            [
                "Relate it to the explanations and examples in the content",
                "Memorize unrelated terms instead",
                "Skip it because it has no educational value",
                "Treat it as a formatting error in the text",
            ],
            "A",
            "Good study habits connect new terms to the surrounding explanation.",
        ),
        (
            "Which choice correctly reflects the material's treatment of {topic}?",
            [
                "The material presents it as relevant to the learning objectives",
                "The material dismisses it as unimportant noise",
                "The material never mentions any related ideas",
                "The material uses it only as an empty placeholder",
            ],
            "A",
            "Aligned questions stay faithful to what the source actually emphasizes.",
        ),
        (
            "Select the clearest takeaway related to {topic} from the content.",
            [
                "Understanding {topic} supports comprehension of the broader lesson",
                "{topic} should be removed from any summary of the lesson",
                "{topic} is identical to every other concept with no distinction",
                "{topic} exists only to confuse learners",
            ],
            "A",
            "Clear takeaways reinforce the main instructional goals.",
        ),
    ]

    out: list[dict[str, Any]] = []
    topic_i = 0
    template_i = 0
    safety = 0

    while len(out) < needed and safety < needed * 20:
        safety += 1
        topic = topics[topic_i % len(topics)]
        topic_i += 1
        # Prefer readable multi-word display for single tokens
        topic_display = topic if " " in topic else topic.replace("-", " ")
        topic_display = topic_display.strip() or "the main concept"

        q_tmpl, opt_tmpls, correct, expl = templates[template_i % len(templates)]
        template_i += 1

        question = q_tmpl.format(topic=topic_display)
        options = [o.format(topic=topic_display) for o in opt_tmpls]
        mcq = _make_mcq(question, options, correct, expl)

        q_key = mcq["question"].lower()
        if q_key in exclude_questions:
            continue
        if not is_valid_mcq(mcq):
            # Fallbacks are designed to pass; if not, skip rather than emit junk
            continue

        exclude_questions.add(q_key)
        out.append(mcq)

    # Absolute last resort — still clean, never crash
    while len(out) < needed:
        n = len(out) + 1
        mcq = _make_mcq(
            f"Which statement best reflects careful study of the provided learning material (item {n})?",
            [
                "Focus on the main ideas, terms, and relationships explained in the content",
                "Ignore the explanations and memorize unrelated labels",
                "Assume every sentence is a formatting error",
                "Replace the lesson with random filler phrases",
            ],
            "A",
            "A complete practice set always includes clear, meaningful review items.",
        )
        q_key = mcq["question"].lower()
        if q_key in exclude_questions:
            mcq["question"] = f"{mcq['question']} [{n}]"
            q_key = mcq["question"].lower()
        exclude_questions.add(q_key)
        out.append(mcq)

    return out[:needed]


def filter_valid_mcqs(
    mcqs: list[dict[str, Any]],
    *,
    context: str | None = None,
    num_questions: int = TARGET_MCQ_COUNT,
    min_keep: int = 0,
) -> list[dict[str, Any]]:
    """
    Keep only high-quality MCQs, then return **exactly** ``num_questions`` items
    (default 5).

    - Filters weak, nonsensical, poorly parsed, or misaligned questions
    - Deduplicates by normalized question text
    - Pads with clean, context-aware fallbacks when fewer than ``num_questions``
      survive (uses ``context`` when provided; otherwise harvests topic cues
      from the input MCQ batch)

    ``min_keep`` is retained for API compatibility but does not reduce the
    final length below ``num_questions`` — padding always fills the gap.
    """
    target = max(1, int(num_questions) if num_questions else TARGET_MCQ_COUNT)
    source = list(mcqs or [])

    kept: list[dict[str, Any]] = []
    seen_questions: set[str] = set()

    for mcq in source:
        if not isinstance(mcq, dict):
            continue
        if not is_valid_mcq(mcq, context=context):
            continue
        norm = normalize_mcq_dict(mcq)
        q_key = norm["question"].lower()
        if not q_key or q_key in seen_questions:
            continue
        seen_questions.add(q_key)
        # Prefer normalized shape for downstream consumers
        letter = resolve_correct_letter(norm)
        if letter is None:
            continue
        idx = "ABCD".index(letter)
        kept.append(
            {
                "question": norm["question"],
                "options": list(norm["options"][:4]),
                "correct_answer": norm["options"][idx],
                "explanation": norm["explanation"]
                or "Validated question retained from model output.",
            }
        )
        if len(kept) >= target:
            break

    # min_keep is informational only for callers that checked length historically
    _ = min_keep

    if len(kept) < target:
        pads = _build_context_aware_fallbacks(
            target - len(kept),
            context=context,
            seed_mcqs=source,
            exclude_questions=set(seen_questions),
        )
        kept.extend(pads)

    return kept[:target]


def ensure_five_valid_mcqs(
    mcqs: list[dict[str, Any]],
    *,
    context: str | None = None,
) -> list[dict[str, Any]]:
    """Explicit helper: always returns exactly 5 validated / padded MCQs."""
    return filter_valid_mcqs(mcqs, context=context, num_questions=TARGET_MCQ_COUNT)


def raw_generation_looks_garbage(raw_text: str) -> bool:
    """
    Pre-parse check on decoded T5 string.
    Use before / after parsing to skip hopeless generations.
    """
    text = _as_text(raw_text)
    if not text:
        return True
    if len(text) < 20:
        return True
    if _SINGLE_LETTER_RE.match(text):
        return True
    if _REPEATED_CHAR_RE.match(text):
        return True
    if _GARBAGE_TOKEN_RE.search(text):
        return True
    # Must contain at least some alphabetic content
    letters = sum(1 for ch in text if ch.isalpha())
    if letters < 10:
        return True
    return False


def summarize_validation(mcqs: list[dict[str, Any]]) -> dict[str, Any]:
    """Debug helper: counts accepted vs rejected with reason tallies."""
    accepted = 0
    rejected = 0
    reason_counts: dict[str, int] = {}
    for mcq in mcqs or []:
        ok, reasons = validate_mcq(mcq)
        if ok:
            accepted += 1
        else:
            rejected += 1
            for r in reasons:
                reason_counts[r] = reason_counts.get(r, 0) + 1
    return {
        "total": len(mcqs or []),
        "accepted": accepted,
        "rejected": rejected,
        "reasons": reason_counts,
    }


__all__ = [
    "normalize_mcq_dict",
    "is_garbage_text",
    "is_weak_question",
    "is_weak_option",
    "options_are_duplicates",
    "resolve_correct_letter",
    "validate_mcq",
    "is_valid_mcq",
    "filter_valid_mcqs",
    "ensure_five_valid_mcqs",
    "raw_generation_looks_garbage",
    "summarize_validation",
    "TARGET_MCQ_COUNT",
]
