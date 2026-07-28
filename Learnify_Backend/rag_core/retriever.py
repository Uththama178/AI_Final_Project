"""Semantic vector search and retrieval for chapter chunks using ChromaDB and SentenceTransformers."""

from __future__ import annotations

import logging
from typing import Any

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import ChromaError
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

COLLECTION_NAME = "learnify_materials"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
CHROMA_PERSIST_PATH = "./chroma_db"

_client: chromadb.PersistentClient | None = None
_collection: Collection | None = None
_embedding_model: SentenceTransformer | None = None


def _get_client() -> chromadb.PersistentClient:
    """Return a singleton persistent ChromaDB client."""
    global _client
    if _client is None:
        try:
            _client = chromadb.PersistentClient(path=CHROMA_PERSIST_PATH)
            logger.debug("Initialized ChromaDB client at %s", CHROMA_PERSIST_PATH)
        except Exception as exc:
            logger.exception("Failed to initialize ChromaDB client")
            raise RuntimeError("Could not initialize ChromaDB client") from exc
    return _client


def _get_collection() -> Collection:
    """Return the learnify_materials collection, creating it if needed."""
    global _collection
    if _collection is None:
        try:
            _collection = _get_client().get_or_create_collection(name=COLLECTION_NAME)
            logger.debug("Using ChromaDB collection %r", COLLECTION_NAME)
        except ChromaError as exc:
            logger.exception("Failed to get or create collection %r", COLLECTION_NAME)
            raise RuntimeError(f"Could not access collection {COLLECTION_NAME!r}") from exc
    return _collection


def _get_embedding_model() -> SentenceTransformer:
    """Return a singleton SentenceTransformer model for embeddings."""
    global _embedding_model
    if _embedding_model is None:
        try:
            _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
            logger.info("Loaded embedding model %r", EMBEDDING_MODEL_NAME)
        except Exception as exc:
            logger.exception("Failed to load embedding model %r", EMBEDDING_MODEL_NAME)
            raise RuntimeError(f"Could not load embedding model {EMBEDDING_MODEL_NAME!r}") from exc
    return _embedding_model


def retrieve_relevant_chunks(query: str, chapter_id: int, top_k: int = 5) -> list[str]:
    """
    Retrieve top_k relevant text chunks for a query using semantic vector search in ChromaDB.

    Args:
        query: Search prompt or topic string.
        chapter_id: Chapter identifier used to filter stored chunks.
        top_k: Maximum number of relevant chunks to retrieve (default is 5).

    Returns:
        List of relevant chunk strings (empty list if no matching chunks found or error occurs).
    """
    if not query or not query.strip():
        logger.warning("Empty query provided for vector retrieval in chapter_id=%s", chapter_id)
        return []

    try:
        collection = _get_collection()
        model = _get_embedding_model()

        # Convert query string into vector embedding
        query_embedding = model.encode([query], show_progress_bar=False).tolist()

        # Perform semantic similarity search in ChromaDB filtered by chapter_id
        results = collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            where={"chapter_id": chapter_id},
            include=["documents"]
        )

        documents = results.get("documents", [])
        if documents and len(documents) > 0:
            extracted_chunks = [doc for doc in documents[0] if doc is not None]
            logger.info(
                "Successfully retrieved %d chunks for query %r in chapter_id=%s",
                len(extracted_chunks), query, chapter_id
            )
            return extracted_chunks

    except ChromaError as exc:
        logger.exception("ChromaDB query error during retrieval for chapter_id=%s", chapter_id)
    except Exception as exc:
        logger.exception("Unexpected error during semantic retrieval for chapter_id=%s", chapter_id)

    return []


def retrieve_relevant_context(chapter_id: int, keyword: str) -> str:
    """
    Backward-compatible wrapper expected by rag_service.py.
    Retrieves top relevant chunks and joins them with double newlines.

    Args:
        chapter_id: Chapter identifier.
        keyword: Topic or keyword string to search for.

    Returns:
        Formatted context string.
    """
    chunks = retrieve_relevant_chunks(query=keyword, chapter_id=chapter_id, top_k=3)

    if not chunks:
        # Fallback to fetching all chunks for this chapter if query specific search returned empty
        from rag_core.vector_store import get_chunks_by_chapter
        chunks = get_chunks_by_chapter(chapter_id)
        if chunks:
            logger.info("Falling back to raw chapter chunks for chapter_id=%s", chapter_id)
            chunks = chunks[:3]

    if not chunks:
        return "No source content available for this chapter."

    return "\n\n--- Chunk Break ---\n\n".join(chunks)