"""Orchestrator service coordinating chunking, vector storage, retrieval, and MCQ generation."""

from __future__ import annotations

import logging
from typing import Any

from rag_core.document_loader import (
    extract_text_from_pdf,
    extract_transcript_from_video,
    save_to_vector_store_debugger,
)
from rag_core.text_splitter import split_text_into_chunks
from rag_core.vector_store import add_chunks_to_vector_store, get_chunks_by_chapter
from rag_core.retriever import retrieve_relevant_chunks
from rag_core.generator import generate_mcqs_from_context

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 10


def _run_rag_pipeline_on_text(
    text_content: str,
    chapter_id: int,
    query_topic: str,
    num_questions: int = 5,
) -> dict[str, Any]:
    """
    Core RAG pipeline: chunk → ChromaDB → semantic retrieve → generate MCQs.

    Args:
        text_content: Combined document or transcript text.
        chapter_id: Chapter identifier for vector store metadata.
        query_topic: Topic string used for semantic retrieval.
        num_questions: Target number of MCQs.

    Returns:
        Structured result with status, counts, and raw generator MCQ dicts.
    """
    logger.info(
        "Running RAG pipeline for chapter_id=%s query=%r",
        chapter_id,
        query_topic,
    )

    if not text_content or not text_content.strip():
        logger.warning("Empty text content for chapter_id=%s", chapter_id)
        return {
            "status": "error",
            "message": "Empty content provided",
            "chapter_id": chapter_id,
            "mcqs": [],
        }

    try:
        chunks = split_text_into_chunks(text_content)
        logger.info("Created %d chunk(s) for chapter_id=%s", len(chunks), chapter_id)

        if not chunks:
            logger.warning("No valid chunks produced for chapter_id=%s", chapter_id)
            return {
                "status": "warning",
                "message": "No valid text chunks could be extracted.",
                "chapter_id": chapter_id,
                "mcqs": [],
            }

        add_chunks_to_vector_store(chunks=chunks, chapter_id=chapter_id)
        logger.info("Persisted chunks to ChromaDB for chapter_id=%s", chapter_id)

        relevant_chunks = retrieve_relevant_chunks(
            query=query_topic,
            chapter_id=chapter_id,
            top_k=DEFAULT_TOP_K,
        )
        if not relevant_chunks:
            logger.info(
                "Vector retrieval returned no hits for chapter_id=%s; using fallback chunks",
                chapter_id,
            )
            relevant_chunks = get_chunks_by_chapter(chapter_id) or chunks[:DEFAULT_TOP_K]

        context_chunks = relevant_chunks[:DEFAULT_TOP_K]
        combined_context = "\n\n".join(context_chunks)

        mcqs = generate_mcqs_from_context(
            context=combined_context,
            num_questions=num_questions,
        )
        logger.info("Generated %d MCQ(s) for chapter_id=%s", len(mcqs), chapter_id)

        return {
            "status": "success",
            "chapter_id": chapter_id,
            "total_chunks_indexed": len(chunks),
            "retrieved_context_count": len(context_chunks),
            "mcqs": mcqs,
        }

    except ValueError as exc:
        logger.error("Validation/embedding error for chapter_id=%s: %s", chapter_id, exc)
        return {
            "status": "error",
            "message": str(exc),
            "chapter_id": chapter_id,
            "mcqs": [],
        }
    except Exception as exc:
        logger.exception("RAG pipeline failed for chapter_id=%s", chapter_id)
        return {
            "status": "error",
            "message": str(exc),
            "chapter_id": chapter_id,
            "mcqs": [],
        }


def _normalize_questions_for_teacher(mcqs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map generator MCQs to the teacher API question schema."""
    normalized: list[dict[str, Any]] = []

    for item in mcqs:
        if not item:
            continue

        if "Question_Text" in item:
            normalized.append(item)
            continue

        question_text = item.get("question") or item.get("Question_Text") or ""
        options = item.get("options") or []
        correct = item.get("correct_answer") or item.get("Correct_Answer") or ""

        option_a = options[0] if len(options) > 0 else "Option A"
        option_b = options[1] if len(options) > 1 else "Option B"
        option_c = options[2] if len(options) > 2 else "Option C"
        option_d = options[3] if len(options) > 3 else "Option D"

        correct_letter = "A"
        letter_map = {"A": option_a, "B": option_b, "C": option_c, "D": option_d}
        for letter, option_value in letter_map.items():
            if str(correct).strip().lower() == str(option_value).strip().lower():
                correct_letter = letter
                break
        if correct in ("A", "B", "C", "D"):
            correct_letter = str(correct)

        normalized.append(
            {
                "Question_Text": question_text,
                "Option_A": option_a,
                "Option_B": option_b,
                "Option_C": option_c,
                "Option_D": option_d,
                "Correct_Answer": correct_letter,
            }
        )

    return normalized


def _fallback_teacher_questions(chapter_title: str) -> list[dict[str, Any]]:
    """Default questions when the RAG pipeline cannot produce MCQs."""
    return [
        {
            "Question_Text": f"What is the main topic discussed in '{chapter_title}'?",
            "Option_A": "Key concept",
            "Option_B": "Supporting detail",
            "Option_C": "Background context",
            "Option_D": "Example",
            "Correct_Answer": "A",
        }
    ]


def process_chapter_rag_quiz(
    chapter_title: str,
    pdf_path: str,
    video_path: str,
    chapter_id: int = 0,
    num_questions: int = 5,
) -> dict[str, Any]:
    """
    Full teacher workflow: load PDF and optional YouTube transcript, run Chroma RAG, return quiz.

    Args:
        chapter_title: Chapter title (also used as the retrieval query topic).
        pdf_path: Path to the uploaded PDF on disk.
        video_path: YouTube URL or empty string when not provided.
        chapter_id: Vector store chapter key (default 0 until persisted in DB).
        num_questions: Number of MCQs to generate.

    Returns:
        Dictionary with ``quiz_Title`` and ``questions`` for the teacher router.
    """
    logger.info(
        "Starting chapter RAG quiz for title=%r chapter_id=%s",
        chapter_title,
        chapter_id,
    )

    try:
        pdf_text = extract_text_from_pdf(pdf_path)
        video_text = extract_transcript_from_video(video_path) if video_path else ""

        save_to_vector_store_debugger(pdf_text, video_text)

        combined_text = pdf_text
        if video_text.strip():
            combined_text = f"{pdf_text}\n\n[VIDEO TRANSCRIPT CONTENT]\n{video_text}"

        pipeline_result = _run_rag_pipeline_on_text(
            text_content=combined_text,
            chapter_id=chapter_id,
            query_topic=chapter_title or "General Concepts",
            num_questions=num_questions,
        )

        raw_mcqs = pipeline_result.get("mcqs") or []
        questions = _normalize_questions_for_teacher(raw_mcqs)

        if not questions:
            logger.warning(
                "No MCQs from pipeline (status=%s); using fallback for %r",
                pipeline_result.get("status"),
                chapter_title,
            )
            questions = _fallback_teacher_questions(chapter_title)

        return {
            "quiz_Title": f"{chapter_title} Quiz",
            "questions": questions,
        }

    except Exception as exc:
        logger.exception("process_chapter_rag_quiz failed for %r", chapter_title)
        return {
            "quiz_Title": f"{chapter_title} Quiz",
            "questions": _fallback_teacher_questions(chapter_title),
            "message": str(exc),
        }


def process_chapter_text_rag_quiz(
    text_content: str,
    chapter_id: int,
    query_topic: str = "General Concepts",
    num_questions: int = 5,
) -> dict[str, Any]:
    """
    RAG pipeline entry point when raw text (or transcript) is already available.

    Returns the detailed pipeline result (status, counts, and generator MCQ dicts).
    """
    return _run_rag_pipeline_on_text(
        text_content=text_content,
        chapter_id=chapter_id,
        query_topic=query_topic,
        num_questions=num_questions,
    )
