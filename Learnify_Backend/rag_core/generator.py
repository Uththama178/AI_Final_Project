"""Context-aware MCQ generator supporting rule-based extraction and future T5 model integration."""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Path to the fine-tuned model (for future T5 model integration)
FINE_TUNED_MODEL_PATH = "saved_models/learnify_t5"


def generate_mcqs_from_context(context: str, num_questions: int = 5) -> list[dict[str, Any]]:
    """
    Generate structured MCQs based on the provided context chunks.

    Currently uses a context-aware rule-based fallback logic.
    Designed to seamlessly switch to a fine-tuned T5/BART model when present.

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
        # -------------------------------------------------------------
        # FUTURE EXTENSION: Fine-tuned Model Inference
        # -------------------------------------------------------------
        # if os.path.exists(FINE_TUNED_MODEL_PATH):
        #     return _generate_with_t5_model(context, num_questions)

        # -------------------------------------------------------------
        # CURRENT IMPLEMENTATION: Rule-based Extraction Logic
        # -------------------------------------------------------------
        return _generate_rule_based_mcqs(context, num_questions)

    except Exception as exc:
        logger.exception("Error occurred while generating MCQs from context.")
        return _get_fallback_questions()


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