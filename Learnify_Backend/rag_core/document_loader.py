import os
import re
from pypdf import PdfReader
from youtube_transcript_api import YouTubeTranscriptApi

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
    සැබෑ YouTube API එක භාවිතයෙන් වීඩියෝ එක ඇතුළේ ඇති උපශීර්ෂ (Subtitles/Transcript) ලබා ගැනීම.
    """
    if "youtube" in video_path or "youtu.be" in video_path:
        try:
            video_id = extract_youtube_id(video_path)
            if not video_id:
                return "Could not extract YouTube Video ID."
            
            # YouTube එකෙන් Transcript එක Array එකක් විදිහට ලබා ගනී
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            
            # සියලුම වාක්‍ය එකට එකතු කර එකම ඡේදයක් (String) බවට පත් කිරීම
            full_transcript = " ".join([t["text"] for t in transcript_list])
            return full_transcript
            
        except Exception as e:
            print(f"Error fetching YouTube transcript: {str(e)}")
            return f"No English transcript found for this video. (Error: {str(e)})"
            
    return ""
