# 🆕 Chunks ටික මතකයේ තබා ගැනීමට සරල JSON / In-Memory Store එකක් (Global Dictionary)
IN_MEMORY_VECTOR_STORE = {}

def save_chunks_to_vector_store(chunks: list[str], chapter_id: int):
    """
    ChromaDB වෙනුවට සරල JSON ව්‍යුහයකින් මතකය (Memory) තුළ Chunks තැන්පත් කිරීම.
    """
    if not chunks:
        return []
        
    # Chapter ID එකට අදාළව chunks ටික සේව් කරගන්නවා
    IN_MEMORY_VECTOR_STORE[chapter_id] = chunks
    
    print(f"Log: Successfully indexed {len(chunks)} chunks into In-Memory JSON Store for Chapter {chapter_id}.")
    return chunks

# 🆕 අපිට පසුව Retriever එකෙන් මේවා කියවන්න උදව් වෙන Helper Function එකක්
def get_chunks_by_chapter(chapter_id: int) -> list[str]:
    return IN_MEMORY_VECTOR_STORE.get(chapter_id, [])
