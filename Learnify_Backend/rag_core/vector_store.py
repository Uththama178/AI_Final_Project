"""Persistent vector storage for chapter chunks using ChromaDB and SentenceTransformers."""

from __future__ import annotations

import logging
from typing import Any

import chromadb
from chromadb.errors import ChromaError
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

COLLECTION_NAME = "learnify_materials"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
CHROMA_PERSIST_PATH = "./chroma_db"

_client: chromadb.PersistentClient | None = None
_collection: Any = None
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


def _get_collection() -> Any:
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


def _chapter_metadata(chapter_id: int) -> dict[str, Any]:
    return {"chapter_id": chapter_id}


def add_chunks_to_vector_store(chunks: list[str], chapter_id: int) -> list[str]:
    """
    Embed text chunks and persist them in ChromaDB for the given chapter.

    Re-indexing a chapter replaces any previously stored chunks for that ``chapter_id``.

    Args:
        chunks: Text segments to index.
        chapter_id: Chapter identifier stored in chunk metadata.

    Returns:
        The indexed chunk texts (empty list if ``chunks`` is empty).

    Raises:
        RuntimeError: If ChromaDB or embedding initialization fails.
        ValueError: If embedding generation fails for the provided chunks.
    """
    if not chunks:
        logger.debug("No chunks to index for chapter_id=%s", chapter_id)
        return []

    collection = _get_collection()

    try:
        collection.delete(where={"chapter_id": chapter_id})
    except ChromaError:
        logger.warning(
            "Could not delete existing vectors for chapter_id=%s; continuing with add",
            chapter_id,
            exc_info=True,
        )

    try:
        model = _get_embedding_model()
        embeddings = model.encode(chunks, show_progress_bar=False)
    except Exception as exc:
        logger.exception("Embedding generation failed for chapter_id=%s", chapter_id)
        raise ValueError(f"Failed to generate embeddings for chapter {chapter_id}") from exc

    ids = [f"{chapter_id}_{index}" for index in range(len(chunks))]
    metadatas = [_chapter_metadata(chapter_id) for _ in chunks]

    try:
        collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings.tolist(),
            metadatas=metadatas,
        )
    except ChromaError as exc:
        logger.exception("Failed to add chunks to ChromaDB for chapter_id=%s", chapter_id)
        raise RuntimeError(f"Failed to store chunks for chapter {chapter_id}") from exc

    logger.info(
        "Indexed %s chunk(s) into ChromaDB collection %r for chapter_id=%s",
        len(chunks),
        COLLECTION_NAME,
        chapter_id,
    )
    return chunks


def save_chunks_to_vector_store(chunks: list[str], chapter_id: int) -> list[str]:
    """
    Persist chapter chunks in the vector store (alias for ``add_chunks_to_vector_store``).

    Args:
        chunks: Text segments to index.
        chapter_id: Chapter identifier.

    Returns:
        The indexed chunk texts, or an empty list when ``chunks`` is empty.
    """
    return add_chunks_to_vector_store(chunks, chapter_id)


def get_chunks_by_chapter(chapter_id: int) -> list[str]:
    """
    Retrieve all document texts stored for a chapter.

    Args:
        chapter_id: Chapter whose chunks should be returned.

    Returns:
        List of chunk strings, or an empty list if none are stored.
    """
    try:
        collection = _get_collection()
        result = collection.get(
            where={"chapter_id": chapter_id},
            include=["documents"],
        )
    except ChromaError:
        logger.exception("Failed to read chunks for chapter_id=%s", chapter_id)
        return []

    documents = result.get("documents") or []
    return [doc for doc in documents if doc is not None]
