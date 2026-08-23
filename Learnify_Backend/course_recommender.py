"""
Content-based course recommendations using TF-IDF + cosine similarity,
then ranked by marketplace average star ratings.

Pure ranking helpers — does not alter DB schemas or other app modules.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DEFAULT_TOP_K = 5
DEFAULT_MIN_SIMILARITY = 0.05


def _course_text(course: Mapping[str, Any]) -> str:
    title = str(course.get("Title") or "").strip()
    description = str(course.get("Description") or "").strip()
    return f"{title} {description}".strip()


def _as_course_records(courses: Sequence[Any]) -> list[dict[str, Any]]:
    """Normalize Pydantic models or dicts into plain records."""
    records: list[dict[str, Any]] = []
    for item in courses or []:
        if hasattr(item, "model_dump"):
            records.append(item.model_dump())
        elif hasattr(item, "dict"):
            records.append(item.dict())
        elif isinstance(item, Mapping):
            records.append(dict(item))
    return records


def rank_related_courses(
    enrolled_courses: Sequence[Any],
    candidate_courses: Sequence[Any],
    average_ratings: Mapping[int, float] | None = None,
    rating_counts: Mapping[int, int] | None = None,
    *,
    top_k: int = DEFAULT_TOP_K,
    min_similarity: float = DEFAULT_MIN_SIMILARITY,
) -> list[dict[str, Any]]:
    """
    Compare enrolled vs candidate course Title/Description with TF-IDF cosine
    similarity, then sort by similarity and marketplace average stars.

    Returns up to ``top_k`` candidate dicts enriched with:
      - similarity_score
      - average_rating
      - rating_count
    """
    enrolled = _as_course_records(enrolled_courses)
    candidates = _as_course_records(candidate_courses)
    avg_map = {int(k): float(v) for k, v in (average_ratings or {}).items()}
    count_map = {int(k): int(v) for k, v in (rating_counts or {}).items()}

    if not enrolled or not candidates:
        return []

    enrolled_texts = [_course_text(c) for c in enrolled]
    candidate_texts = [_course_text(c) for c in candidates]

    # If every string is empty, TF-IDF cannot fit meaningfully
    if not any(enrolled_texts) or not any(candidate_texts):
        return []

    corpus = enrolled_texts + candidate_texts
    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_features=5000,
        )
        matrix = vectorizer.fit_transform(corpus)
    except ValueError:
        # Empty vocabulary after stop-word filtering, etc.
        return []

    n_enrolled = len(enrolled_texts)
    enrolled_matrix = matrix[:n_enrolled]
    candidate_matrix = matrix[n_enrolled:]

    # Max similarity of each candidate against any enrolled course
    sim = cosine_similarity(candidate_matrix, enrolled_matrix)
    max_sim = sim.max(axis=1)

    ranked_rows: list[dict[str, Any]] = []
    for idx, candidate in enumerate(candidates):
        score = float(max_sim[idx])
        if score < min_similarity:
            continue
        course_id = int(candidate.get("Course_ID") or 0)
        row = dict(candidate)
        row["similarity_score"] = round(score, 4)
        row["average_rating"] = round(avg_map.get(course_id, 0.0), 2)
        row["rating_count"] = count_map.get(course_id, 0)
        # Drop enrollment-only fields from candidate payloads if present
        row.pop("Enrollment_ID", None)
        row.pop("Enrollment_Date", None)
        ranked_rows.append(row)

    if not ranked_rows:
        return []

    df = pd.DataFrame(ranked_rows)
    df = df.sort_values(
        by=["similarity_score", "average_rating", "rating_count"],
        ascending=[False, False, False],
        kind="mergesort",
    )

    top = df.head(max(1, int(top_k))).to_dict(orient="records")
    # Ensure JSON-friendly native types
    for row in top:
        row["Course_ID"] = int(row["Course_ID"])
        row["Price"] = float(row.get("Price") or 0)
        row["Teacher_ID"] = int(row["Teacher_ID"]) if row.get("Teacher_ID") is not None else None
        row["chapter_count"] = int(row.get("chapter_count") or 0)
        row["is_published"] = bool(row.get("is_published", True))
        row["similarity_score"] = float(row.get("similarity_score") or 0)
        row["average_rating"] = float(row.get("average_rating") or 0)
        row["rating_count"] = int(row.get("rating_count") or 0)
    return top
