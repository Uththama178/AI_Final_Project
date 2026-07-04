import os
import re
import json
from pypdf import PdfReader

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception:  # pragma: no cover - optional dependency guard
    YouTubeTranscriptApi = None

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    ගුරුවරයා අප්ලෝඩ් කරන PDF එක සැබෑවටම කියවා Text ලබා ගැනීම.
    """
    if not os.path.exists(pdf_path):
        return ""
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        print(f"PDF Loader Error: {str(e)}")
        return ""

def extract_youtube_id(url: str) -> str:
    """
    YouTube URL එකකින් වීඩියෝ ID එක (v=XXXXX) පමණක් වෙන් කර ගැනීම.
    """
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def extract_transcript_from_video(video_path: str) -> str:
    """
    සැබෑ YouTube API එක භාවිතයෙන් වීඩියო එක ඇතුළේ ඇති උපශීර්ෂ (Subtitles/Transcript) ලබා ගැනීම.
    """
    if "youtube" in video_path or "youtu.be" in video_path:
        try:
            video_id = extract_youtube_id(video_path)
            if not video_id or YouTubeTranscriptApi is None:
                return ""

            api_client = YouTubeTranscriptApi()
            transcript_list = None

            if hasattr(api_client, "fetch"):
                transcript_list = api_client.fetch(video_id)
            elif hasattr(YouTubeTranscriptApi, "get_transcript"):
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id)

            if transcript_list is None:
                return ""

            if hasattr(transcript_list, "to_list"):
                items = transcript_list.to_list()
            elif isinstance(transcript_list, list):
                items = transcript_list
            else:
                items = list(transcript_list)

            full_transcript = " ".join(
                item.get("text", "") for item in items if isinstance(item, dict) and item.get("text")
            )
            return full_transcript

        except Exception as e:
            print(f"Error fetching YouTube transcript: {str(e)}")
            return ""
            
    return ""

def save_to_vector_store_debugger(pdf_text: str, youtube_text: str):
    """
    🆕 JSON Vector Store එකේ රැඳෙන දත්ත ඇස් දෙකෙන් බලාගැනීම සඳහා 
    ඒවා JSON ෆයිල් එකකට ලියන (Save කරන) ලොජික් එක.
    """
    debug_data = {
        "status": "Successfully Indexed into RAG Vector Store",
        "extracted_pdf_text_length": len(pdf_text),
        "extracted_youtube_transcript_length": len(youtube_text),
        "sources": {
            "pdf_data_preview": pdf_text[:2000] + "... (Truncated for Preview)", # මුල් අකුරු 2000
            "youtube_transcript_preview": youtube_text[:2000] + "... (Truncated for Preview)" if youtube_text else "No Transcript Fetched"
        }
    }
    
    # Learnify_Backend ෆෝල්ඩර් එක ඇතුළේ ෆයිල් එකක් විදිහට සේဝ် වේ
    file_path = "latest_rag_source_data.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(debug_data, f, indent=4, ensure_ascii=False)
    print(f"🔍 [RAG DEBUGGER] Vector store source data saved to: {file_path}")