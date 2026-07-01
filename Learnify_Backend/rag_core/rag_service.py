from rag_core.document_loader import extract_text_from_pdf, extract_transcript_from_video
from rag_core.text_splitter import split_text_into_chunks
from rag_core.vector_store import save_chunks_to_vector_store
from rag_core.retriever import retrieve_relevant_context
from rag_core.generator import generate_mcqs_from_context

def process_chapter_rag_quiz(pdf_path: str, video_path: str, chapter_title: str, chapter_id: int = 0) -> dict:
    """
    RAG Master Workflow: PDF + Video දෙකෙන්ම දත්ත ගෙන Chunk කර, 
    Context එක Retrieve කර අවසානයේ Quiz එකක් සාදා දේ.
    """
    # 1. Extract Text from both sources
    pdf_text = extract_text_from_pdf(pdf_path)
    video_text = extract_transcript_from_video(video_path)
    
    # 2. Combine content (PDF + Video)
    combined_text = f"{pdf_text}\n\n[VIDEO TRANSCRIPT CONTENT]\n{video_text}"
    
    # 3. Chunking
    chunks = split_text_into_chunks(combined_text)
    
    # 4. 🆕 සැබෑ ලෙසම Memory Store එකට සේව් කිරීම
    save_chunks_to_vector_store(chunks, chapter_id)
    
    # 5. 🆕 සැබෑ ලෙසම Chapter ID එක පාවිච්චි කර Context එක ලබා ගැනීම
    context = retrieve_relevant_context(chapter_id, chapter_title)
    
    # 6. Generation (AI හෝ Dummy)
    questions = generate_mcqs_from_context(context, chapter_title)
    
    return {
        "Quiz_Title": f"{chapter_title} Quiz",
        "Questions": questions
    }