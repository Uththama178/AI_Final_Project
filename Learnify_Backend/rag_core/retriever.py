def retrieve_relevant_context(chunks: list[str], keyword: str) -> str:
    """
    පරිච්ඡේදයේ මාතෘකාවට අදාළ වන Chunks පමණක් පෙරලා (Retrieve කර) එකතු කර Context එක සෑදීම.
    """
    if not chunks:
        return "No source content available."
        
    results = []
    search_query = keyword.lower()
    
    for chunk in chunks:
        if search_query in chunk.lower():
            results.append(chunk)
            
    # කිසිවක් හමුනොවුණහොත් මුල්ම Chunks දෙක ලබා දීම
    if not results:
        results = chunks[:2]
        
    return "\n\n--- Chunk Break ---\n\n".join(results[:3]) # උපරිම Chunks 3ක් ලබා දේ