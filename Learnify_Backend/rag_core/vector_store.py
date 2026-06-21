def save_chunks_to_vector_store(chunks: list[str], chapter_id: int):
    """
    දැනට Dummy Store එකක් ලෙස ක්‍රියා කරයි.
    (පසුව ChromaDB: collection.add(documents=chunks, ids=[...]) මෙතනට එකතු වේ)
    """
    print(f"Log: Successfully indexed {len(chunks)} chunks into Vector DB for Chapter {chapter_id}.")
    return chunks