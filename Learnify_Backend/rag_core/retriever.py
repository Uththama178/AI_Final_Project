from rag_core.vector_store import get_chunks_by_chapter

def retrieve_relevant_context(chapter_id: int, keyword: str) -> str:
    """
    In-Memory Store එකෙන් අදාළ Chapter එකේ Chunks කියවා, 
    මාතෘකාවට (Keyword) ගැලපෙන හොඳම Chunks පෙරලා Context එක සෑදීම.
    """
    # 🆕 සැබෑවටම සේව් වුණු Chunks ලබා ගැනීම
    chunks = get_chunks_by_chapter(chapter_id)
    
    if not chunks:
        return "No source content available for this chapter."
        
    results = []
    search_query = keyword.lower()
    
    for chunk in chunks:
        if search_query in chunk.lower():
            results.append(chunk)
            
    # කිසිවක් හමුනොවුණහොත් මුල්ම Chunks දෙක ලබා දේ
    if not results:
        results = chunks[:2]
        
    # උපරිම Chunks 3ක් එකතු කර String එකක් ලෙස ලබා දීම
    return "\n\n--- Chunk Break ---\n\n".join(results[:3])