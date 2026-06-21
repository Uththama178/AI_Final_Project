def split_text_into_chunks(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> list[str]:
    """
    PDF සහ Video Text එකතු කර සාදාගත් මුළු දත්ත ප්‍රමාණය කුඩා Chunks වලට කැඩීම.
    """
    if not text:
        return []
        
    words = text.split()
    chunks = []
    
    # Overlap එකක් තබා ගනිමින් කැබලි කිරීම (RAG එකක Context එක නොකැඩී තිබීමට මෙය වැදගත් වේ)
    for i in range(0, len(words), chunk_size - chunk_overlap):
        chunk_words = words[i : i + chunk_size]
        chunk_text = " ".join(chunk_words)
        chunks.append(chunk_text)
        
        if i + chunk_size >= len(words):
            break
            
    return chunks