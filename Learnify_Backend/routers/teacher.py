import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from rag_core.rag_service import process_chapter_rag_quiz  # RAG Service එක සම්බන්ධ කිරීම

# 🛣️ Teacher Router එක සාදා ගැනීම
router = APIRouter(
    prefix="/teacher",
    tags=["Teacher Dashboard"]
)

# 📂 PDF ෆයිල් එක සර්වර් එකේ සේව් කරන ස්ථිර ෆෝල්ඩර් එක
UPLOAD_DIR = "uploads/pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/generate-quiz", status_code=status.HTTP_200_OK)
async def generate_quiz_endpoint(
    chapter_title: str = Form(...),
    youtube_url: str = Form(""),  # ටීචර් ලින්ක් එකක් නොදුන්නොත් හිස්ව බාරගනී
    file: UploadFile = File(...)   # Frontend එකෙන් එන ෆයිල් Object එකේ නම 'file' ලෙස තබා ඇත
):
    """
    පියවර 1 සහ 2: ටීචර් Form එක පුරවා 'Generate Quiz' බටන් එක ඔබද්දී ක්‍රියාත්මක වන API Endpoint එක.
    මෙය PDF එක ආරක්ෂිතව සේව් කර, RAG පද්ධතිය හරහා MCQ සාදා දෙයි.
    """
    
    # 1️⃣ ආරක්ෂිත පියවරක් ලෙස අප්ලෝඩ් කරන්නේ PDF එකක්මදැයි පරික්ෂා කිරීම
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="වැරදි ෆයිල් වර්ගයක්! කරුණාකර PDF ෆයිල් එකක් පමණක් අප්ලෝඩ් කරන්න."
        )

    try:
        # 2️⃣ Path Traversal ආරක්ෂාව සඳහා ෆයිල් එකේ නම පිරිසිදු කර Path එක සෑදීම
        clean_filename = os.path.basename(file.filename)
        file_path = os.path.join(UPLOAD_DIR, clean_filename)

        # 3️⃣ shutil පාවිච්චි කර ආරක්ෂිතව සහ සර්වර් එකේ Memory එක බ්ලොක් නොවී PDF එක සේව් කිරීම
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"[TEACHER ROUTER] File saved successfully at: {file_path}")

        # 4️⃣ අපේ RAG Core Master Controller එක ක්‍රියාත්මක කිරීම
        quiz_data = process_chapter_rag_quiz(
            chapter_title=chapter_title,
            pdf_path=file_path,
            video_path=youtube_url
        )

        # 5️⃣ සාර්ථක ප්‍රතිඵලය සහ පසුව ඩේටාබේස් එකට දැමීමට අවශ්‍ය pdf_path, youtube_url නැවත Frontend වෙත යැවීම
        return {
            "status": "Success",
            "message": f"Quiz generated successfully for chapter: {chapter_title}",
            "pdf_path": file_path,
            "youtube_url": youtube_url,
            "quiz": quiz_data
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating quiz: {str(e)}"
        )