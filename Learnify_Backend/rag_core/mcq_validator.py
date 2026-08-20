"""
MCQ output guardrails for T5 / Flan-T5 generation.

Standalone validation helpers — does not alter model weights, training, or
architecture. Existing generators can optionally import and call these
functions after parsing model text, e.g.:

    from rag_core.mcq_validator import filter_valid_mcqs, is_valid_mcq

No existing backend files are modified by this module itself.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional

# ---------------------------------------------------------------------------
# Tunable thresholds (safe defaults for short educational MCQs)
# ---------------------------------------------------------------------------
MIN_QUESTION_CHARS = 12
MIN_QUESTION_WORDS = 3
MIN_OPTION_CHARS = 2
MIN_OPTION_WORDS = 1
MAX_OPTION_CHARS = 300
MAX_QUESTION_CHARS = 500

# Patterns that usually mean garbage / collapsed T5 output
_SINGLE_LETTER_RE = re.compile(r"^[A-Da-d]$")
_MOSTLY_NON_ALPHA_RE = re.compile(r"^[^A-Za-z0-9]*$")
_REPEATED_CHAR_RE = re.compile(r"^(.)\1{3,}$")  # aaaa, ....
_GARBAGE_TOKEN_RE = re.compile(
    r"(?i)\b(asdf|qwer|zxcv|lorem|ipsum|null|undefined|n/?a|xxx+|test123)\b"
)
_OPTION_MARKER_ONLY_RE = re.compile(r"^[A-D]\s*[\)\.\:\-]\s*$", re.IGNORECASE)


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
    """Reject questions that are too short or not actually question-like."""
    q = _as_text(question)
    if is_garbage_text(q, min_chars=MIN_QUESTION_CHARS, min_words=MIN_QUESTION_WORDS):
        return True
    if len(q) > MAX_QUESTION_CHARS:
        return True
    # Allow missing '?' but require some interrogative / instructional cue OR length
    has_question_mark = "?" in q
    has_cue = bool(
        re.search(
            r"(?i)\b(what|which|who|when|where|why|how|select|choose|identify|define|is|are|can|does|do)\b",
            q,
        )
    )
    if not has_question_mark and not has_cue and _word_count(q) < 6:
        return True
    return False


def is_weak_option(option: str) -> bool:
    """Reject empty, single-letter, marker-only, or tiny options."""
    opt = _as_text(option)
    if is_garbage_text(opt, min_chars=MIN_OPTION_CHARS, min_words=MIN_OPTION_WORDS):
        return True
    if len(opt) > MAX_OPTION_CHARS:
        return True
    # Single token that is only a letter label
    if re.match(r"^[A-D]$", opt, re.IGNORECASE):
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

    # Soft contains match (avoid matching empty)
    for idx, letter in enumerate("ABCD"):
        if options[idx] and options[idx].lower() in correct.lower():
            return letter
        if correct and correct.lower() in options[idx].lower():
            return letter

    return None


def validate_mcq(mcq: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate one MCQ dict.

    Returns:
        (ok, reasons) — ok is True only if all guardrails pass.
    """
    reasons: list[str] = []
    norm = normalize_mcq_dict(mcq)
    question = norm["question"]
    options = norm["options"]

    if is_weak_question(question):
        reasons.append("question_too_short_or_garbage")

    if len(options) != 4:
        reasons.append(f"expected_4_options_got_{len(options)}")
    else:
        for i, opt in enumerate(options):
            if is_weak_option(opt):
                reasons.append(f"option_{'ABCD'[i]}_garbage_or_too_short")
        if options_are_duplicates(options):
            reasons.append("duplicate_options")

    letter = resolve_correct_letter(norm)
    if letter is None:
        reasons.append("correct_answer_unresolved")

    return (len(reasons) == 0, reasons)


def is_valid_mcq(mcq: dict[str, Any]) -> bool:
    """Convenience boolean wrapper around validate_mcq()."""
    ok, _ = validate_mcq(mcq)
    return ok


def filter_valid_mcqs(
    mcqs: list[dict[str, Any]],
    *,
    min_keep: int = 0,
) -> list[dict[str, Any]]:
    """
    Return only MCQs that pass validation, preserving input order.

    If fewer than min_keep survive, still returns only the valid ones
    (caller should fall back to rule-based generation).
    """
    kept: list[dict[str, Any]] = []
    for mcq in mcqs or []:
        if is_valid_mcq(mcq):
            kept.append(mcq)
    if min_keep and len(kept) < min_keep:
        # Explicitly do not pad with invalid items
        return kept
    return kept


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
    "raw_generation_looks_garbage",
    "summarize_validation",
]
