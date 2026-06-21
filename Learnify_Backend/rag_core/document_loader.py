import os
from pypdf import PdfReader

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

def extract_transcript_from_video(video_path: str) -> str:
    """
    වීඩියෝ එකකින් Transcript එක ලබා ගැනීම.
    මෙතනට Local Path එකක් හෝ YouTube URL එකක් ආවත් වැඩ කරන ලෙස සකසා ඇත.
    """
    # 🔗 YouTube ලින්ක් එකක්ද කියලා බලන්න
    if "http" in video_path or "youtube" in video_path or "youtu.be" in video_path:
        print(f"[DOCUMENT LOADER] Processing YouTube URL: {video_path}")
        # පසුව මෙතනට youtube-transcript-api වැනි සැබෑ AI Library එකක් ප්ලග් කෙරේ.
        return f"This is a simulated transcript extracted from the YouTube video: {video_path}. It contains educational content related to the chapter."
    
    # 📁 සාමාන්‍ය වීඩියෝ ෆයිල් එකක් (Local File) ආවොත් චෙක් කරන ආකාරය
    if os.path.exists(video_path):
        print(f"[DOCUMENT LOADER] Processing Local Video File: {video_path}")
        filename = os.path.basename(video_path)
        return f"This is an automated simulation of the video lecture transcript extracted from {filename}."
        
    return ""