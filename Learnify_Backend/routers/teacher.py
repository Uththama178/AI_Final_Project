import os
import shutil
import uuid  # 🆕 අලුත් Unique නමක් හැදීම සඳහා
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from sqlalchemy.orm import Session
from database import get_db
import models
import schema  # Pydantic schemas සඳහා
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer

# RAG Service එක සම්බන්ධ කිරීම (AI Module එකට ඉඩ තබා ඇත)
from rag_core.rag_service import process_chapter_rag_quiz  

# 🛣️ Teacher Router එක සාදා ගැනීම
router = APIRouter(
    prefix="/teacher",
    tags=["Teacher Dashboard"]
)

# 📂 PDF ෆයිල් එක සර්වර් එකේ සේව් කරන ස්ථිර ෆෝල්ඩර් එක
UPLOAD_DIR = "uploads/pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 🔐 JWT ටෝකන් එක හරහා User ව හඳුනා ගැනීමට අවශ්‍ය දේවල්
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
SECRET_KEY = "learnify-secret-key-change-me"  # 💡 Localhost නිසා දැනට මෙසේ තැබිය හැක, පසුව main එකෙන් import කල හැක.
ALGORITHM = "HS256"

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """ දැනට ලොග් වී සිටින පරිශීලකයා (AppUser) කවුදැයි තහවුරු කරගන්නා ශ්‍රිතය """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.AppUser).filter(models.AppUser.Email == email.lower()).first()
    if user is None:
        raise credentials_exception
    return user


# ====================================================================================
# 🤖 Endpoint 1: Generate Quiz (ආරක්ෂිත සහ සකස් කරන ලද කේතය)
# ====================================================================================
@router.post("/generate-quiz", status_code=status.HTTP_200_OK)
async def generate_quiz_endpoint(
    chapter_title: str = Form(...),
    youtube_url: str = Form(""),  
    file: UploadFile = File(...),
    current_user: models.AppUser = Depends(get_current_user)  # 🆕 1. Auth Check එකක් එකතු කලා (ලොග් වුනු අයට පමණයි)
):
    # 🆕 2. අවසර පරික්ෂාව (ටීචර් කෙනෙක්ද කියා බැලීම)
    if current_user.Role.lower() not in ["teacher", "both"]:
        raise HTTPException(status_code=403, detail="මෙම ක්‍රියාව සිදු කිරීමට ඔබට අවසර නැත.")

    # 🆕 3. File Size Validation (උපරිම 50MB) - සර්වර් එක ආරක්ෂා කිරීමට
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 Megabytes
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)  # ආපසු මුලට Reset කිරීම
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ෆයිල් එක විශාල වැඩියි! කරුණාකර 50MB ට වඩා අඩු PDF එකක් අප්ලෝඩ් කරන්න."
        )

    # PDF එකක්ද කියා බැලීම
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="වැරදි ෆයිල් වර්ගයක්! කරුණාකර PDF ෆයිල් එකක් පමණක් අප්ලෝඩ් කරන්න."
        )

    try:
        # 🆕 4. Duplicate Filename Risk එක නැති කිරීමට UUID එකක් නමට එකතු කිරීම
        clean_basename = os.path.basename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{clean_basename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"[TEACHER ROUTER] File saved successfully at: {file_path}")

        # AI Module එකට දත්ත යැවීම
        quiz_data = process_chapter_rag_quiz(
            chapter_title=chapter_title,
            pdf_path=file_path,
            video_path=youtube_url
        )

        if not quiz_data:
            quiz_data = {"quiz_Title": f"{chapter_title} Quiz", "questions": []}

        return {
            "status": "Success",
            "message": f"Quiz generated successfully for chapter: {chapter_title}",
            "pdf_path": file_path,
            "youtube_url": youtube_url,
            "quiz": quiz_data,
            "questions": quiz_data.get("questions", [])
        }

    except Exception as e:
        print(f"[TEACHER ROUTER] Quiz generation failed: {str(e)}")
        fallback_questions = [
            {
                "Question_Text": f"What is the main topic discussed in '{chapter_title}'?",
                "Option_A": "Key concept",
                "Option_B": "Supporting detail",
                "Option_C": "Background context",
                "Option_D": "Example",
                "Correct_Answer": "A"
            }
        ]
        fallback_quiz = {
            "quiz_Title": f"{chapter_title} Quiz",
            "questions": fallback_questions
        }
        return {
            "status": "Success",
            "message": f"Quiz generation used fallback content for chapter: {chapter_title}",
            "pdf_path": file_path if 'file_path' in locals() else "uploads/pdfs/default.pdf",
            "youtube_url": youtube_url,
            "quiz": fallback_quiz,
            "questions": fallback_questions
        }


# ====================================================================================
# 💾 Endpoint 2: Confirm & Create Course (Atomic Save)
# ====================================================================================
@router.post("/create-course", status_code=status.HTTP_201_CREATED)
def create_entire_course(
    payload: schema.CourseCreatePayload, 
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user)
):
    """
    ටීචර් සියල්ල පරික්ෂා කර අවසානයේ 'Confirm & Upload Course' බටන් එක එබූ විට ක්‍රියාත්මක වේ.
    """
    # 1️⃣ ආරක්ෂාව: ලොග් වෙලා ඉන්නේ ටීචර් කෙනෙක්ද කියා බැලීම
    if current_user.Role.lower() not in ["teacher", "both"]:
        raise HTTPException(status_code=403, detail="මෙම ක්‍රියාව සිදු කිරීමට ඔබට අවසර නැත. ටීචර් කෙනෙකු ලෙස ලොග් වන්න.")

    # 🆕 5. Backend Input Validation: මිල සෘණ අගයක්ද කියා බැලීම
    if payload.Price < 0:
        raise HTTPException(status_code=400, detail="කෝස් එකේ මිල සෘණ අගයක් විය නොහැක.")

    # 2️⃣ AppUser ගේ User_ID එකෙන් Teacher Table එකේ ඉන්න Teacher_ID එක සෙවීම
    teacher_profile = db.query(models.Teacher).filter(models.Teacher.User_ID == current_user.User_ID).first()
    if not teacher_profile:
        raise HTTPException(status_code=404, detail="ටීචර් ප්‍රොෆයිල් එකක් හමු වුණේ නැත.")

    try:
        # 🏢 පියවර A: Course Table එකට දත්ත දැමීම
        new_course = models.Course(
            Teacher_ID=teacher_profile.Teacher_ID,
            Title=payload.Title,
            Description=payload.Description,
            Price=payload.Price
        )
        db.add(new_course)
        db.flush()  # Course_ID එක ජෙනරේට් කර ගැනීමට ෆ්ලෂ් කරයි

        # 📖 පියවර B: Chapters ලූප් එකක් මඟින් කියවීම
        for ch_data in payload.chapters:
            new_chapter = models.CourseChapter(
                Course_ID=new_course.Course_ID,
                Chapter_Number=ch_data.Chapter_Number,
                Chapter_Title=ch_data.Chapter_Title,
                Video_Link_Or_Path=ch_data.Video_Link_Or_Path,  # YouTube Link එක සේဝ် වේ
                PDF_Link_Or_Path=ch_data.PDF_Link_Or_Path        # PDF සේဝ် වුණු Path එක සේဝ် වේ
            )
            db.add(new_chapter)
            db.flush()  # Chapter_ID එක ජෙනරේට් කර ගැනීමට ෆ්ලෂ් කරයි

            # 🧠 පියවර C: එම Chapter එකට අදාළව Quiz එකක් තියෙනවා නම්
            if ch_data.quiz:
                new_quiz = models.Quiz(
                    Chapter_ID=new_chapter.Chapter_ID,
                    Quiz_Title=ch_data.quiz.Quiz_Title
                )
                db.add(new_quiz)
                db.flush()  # Quiz_ID එක ජෙනරේට් කර ගැනීමට ෆ්ලෂ් කරයි

                # 📝 පියවර D: Quiz එක ඇතුළේ තියෙන ප්‍රශ්න සේව් කිරීම
                for q_data in ch_data.quiz.questions:
                    new_question = models.Question(
                        Quiz_ID=new_quiz.Quiz_ID,
                        Question_Text=q_data.Question_Text,
                        Option_A=q_data.Option_A,
                        Option_B=q_data.Option_B,
                        Option_C=q_data.Option_C,
                        Option_D=q_data.Option_D,
                        Correct_Answer=q_data.Correct_Answer
                    )
                    db.add(new_question)

        # 🚀 කිසිදු දෝෂයක් නැත්නම් සියල්ල එක පාර ඩේටාබේස් එකේ ස්ථිරවම සේව් කිරීම
        db.commit()
        
        return {
            "status": "Success",
            "message": "මුළු කෝස් එකම, පරිච්ඡේද සහ ක්විස් ප්‍රශ්න සියල්ල සාර්ථකව සේව් කරන ලදී!",
            "course_id": new_course.Course_ID
        }

    except Exception as e:
        db.rollback()  # මොකක් හරි වැරදුනොත් කලින් කරපු ඔක්කොම රෝල්බැක් කරයි
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"කෝස් එක සේව් කිරීම අසාර්ථකයි! දත්ත රෝල්බැක් කරන ලදී. Error: {str(e)}"
        )


# ====================================================================================
# 📚 Endpoint 3: Fetch Logged-in Teacher's Courses (My Courses Tab)
# ====================================================================================
@router.get("/my-courses", response_model=list[schema.CourseSummaryResponse])
def get_my_courses(
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user)
):
    """
    ලොග් වී සිටින ටීචර් විසින් සාදන ලද සියලුම කෝස් ලැයිස්තුව ලබා දෙයි.
    """
    teacher_profile = db.query(models.Teacher).filter(models.Teacher.User_ID == current_user.User_ID).first()
    if not teacher_profile:
        raise HTTPException(status_code=404, detail="ටීචර් ප්‍රොෆයිල් එකක් හමු වුණේ නැත.")

    courses = db.query(models.Course).filter(models.Course.Teacher_ID == teacher_profile.Teacher_ID).all()

    return [
        schema.CourseSummaryResponse(
            Course_ID=course.Course_ID,
            Title=course.Title,
            Description=course.Description,
            Price=course.Price,
            chapter_count=len(course.chapters)
        )
        for course in courses
    ]


# ====================================================================================
# 📖 Endpoint 4: Fetch Full Course Details (chapters, media, quizzes, questions)
# ====================================================================================
@router.get("/course-details/{course_id}", response_model=schema.CourseDetailResponse)
def get_course_details(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user)
):
    """
    ලොග් වී සිටින ටීචර්ගේ තෝරාගත් කෝස් එකේ සම්පූර්ණ විස්තර
    (chapters, video/PDF links, quizzes, questions) ලබා දෙයි.
    """
    teacher_profile = db.query(models.Teacher).filter(models.Teacher.User_ID == current_user.User_ID).first()
    if not teacher_profile:
        raise HTTPException(status_code=404, detail="ටීචර් ප්‍රොෆයිල් එකක් හමු වුණේ නැත.")

    course = db.query(models.Course).filter(
        models.Course.Course_ID == course_id,
        models.Course.Teacher_ID == teacher_profile.Teacher_ID
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="කෝස් එක හමු වුණේ නැත හෝ ඔබට අයිතියක් නැත.")

    chapters_payload = []
    for chapter in sorted(course.chapters, key=lambda c: c.Chapter_Number or 0):
        quiz_payload = None
        if chapter.quiz:
            quiz_payload = schema.QuizDetailResponse(
                Quiz_ID=chapter.quiz.Quiz_ID,
                Quiz_Title=chapter.quiz.Quiz_Title,
                questions=[
                    schema.QuestionDetailResponse(
                        Question_ID=q.Question_ID,
                        Question_Text=q.Question_Text,
                        Option_A=q.Option_A,
                        Option_B=q.Option_B,
                        Option_C=q.Option_C,
                        Option_D=q.Option_D,
                        Correct_Answer=q.Correct_Answer,
                    )
                    for q in (chapter.quiz.questions or [])
                ],
            )

        chapters_payload.append(
            schema.ChapterDetailResponse(
                Chapter_ID=chapter.Chapter_ID,
                Chapter_Number=chapter.Chapter_Number,
                Chapter_Title=chapter.Chapter_Title,
                Video_Link_Or_Path=chapter.Video_Link_Or_Path,
                PDF_Link_Or_Path=chapter.PDF_Link_Or_Path,
                quiz=quiz_payload,
            )
        )

    return schema.CourseDetailResponse(
        Course_ID=course.Course_ID,
        Title=course.Title,
        Description=course.Description,
        Price=course.Price,
        chapters=chapters_payload,
    )


# ====================================================================================
# ✏️ Endpoint 5: Update Course Title / Description / Price Only
# ====================================================================================
@router.put("/update-course/{course_id}", response_model=schema.CourseSummaryResponse)
def update_course(
    course_id: int,
    payload: schema.CourseUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user)
):
    """
    කෝස් එකේ Title, Description, Price පමණක් යාවත්කාලීන කරයි.
    Chapters සහ Quiz Questions නොවෙනස්ව තබයි.
    """
    if current_user.Role.lower() not in ["teacher", "both"]:
        raise HTTPException(status_code=403, detail="මෙම ක්‍රියාව සිදු කිරීමට ඔබට අවසර නැත. ටීචර් කෙනෙකු ලෙස ලොග් වන්න.")

    teacher_profile = db.query(models.Teacher).filter(models.Teacher.User_ID == current_user.User_ID).first()
    if not teacher_profile:
        raise HTTPException(status_code=404, detail="ටීචර් ප්‍රොෆයිල් එකක් හමු වුණේ නැත.")

    course = db.query(models.Course).filter(
        models.Course.Course_ID == course_id,
        models.Course.Teacher_ID == teacher_profile.Teacher_ID
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="කෝස් එක හමු වුණේ නැත හෝ ඔබට අයිතියක් නැත.")

    if payload.Price is not None and payload.Price < 0:
        raise HTTPException(status_code=400, detail="කෝස් එකේ මිල සෘණ අගයක් විය නොහැක.")

    if payload.Title is not None:
        course.Title = payload.Title
    if payload.Description is not None:
        course.Description = payload.Description
    if payload.Price is not None:
        course.Price = payload.Price

    db.commit()
    db.refresh(course)

    return schema.CourseSummaryResponse(
        Course_ID=course.Course_ID,
        Title=course.Title,
        Description=course.Description,
        Price=course.Price,
        chapter_count=len(course.chapters),
    )


# ====================================================================================
# 🗑️ Endpoint 6: Delete Course (DB cascade + safe PDF file cleanup)
# ====================================================================================
@router.delete("/delete-course/{course_id}", status_code=status.HTTP_200_OK)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user)
):
    """
    Deletes a course owned by the logged-in teacher.
    ORM cascades remove chapters, quizzes, and questions.
    Associated PDF files under uploads/pdfs/ are removed safely from disk.
    """
    if current_user.Role.lower() not in ["teacher", "both"]:
        raise HTTPException(status_code=403, detail="මෙම ක්‍රියාව සිදු කිරීමට ඔබට අවසර නැත. ටීචර් කෙනෙකු ලෙස ලොග් වන්න.")

    teacher_profile = db.query(models.Teacher).filter(models.Teacher.User_ID == current_user.User_ID).first()
    if not teacher_profile:
        raise HTTPException(status_code=404, detail="ටීචර් ප්‍රොෆයිල් එකක් හමු වුණේ නැත.")

    course = db.query(models.Course).filter(
        models.Course.Course_ID == course_id,
        models.Course.Teacher_ID == teacher_profile.Teacher_ID
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="කෝස් එක හමු වුණේ නැත හෝ ඔබට අයිතියක් නැත.")

    upload_root = os.path.abspath(UPLOAD_DIR)
    pdf_candidates = []
    for chapter in course.chapters:
        raw_path = (chapter.PDF_Link_Or_Path or "").strip()
        if raw_path:
            pdf_candidates.append(raw_path)

    db.delete(course)
    db.commit()

    deleted_files = []
    for raw_path in pdf_candidates:
        normalized = raw_path.replace("\\", "/").strip()
        if not normalized or ".." in normalized.split("/"):
            continue

        basename = os.path.basename(normalized)
        if not basename:
            continue

        candidate = os.path.abspath(os.path.join(UPLOAD_DIR, basename))
        if not candidate.startswith(upload_root + os.sep) and candidate != upload_root:
            continue

        try:
            if os.path.isfile(candidate):
                os.remove(candidate)
                deleted_files.append(basename)
        except OSError:
            pass

    return {
        "status": "Success",
        "message": "කෝස් එක සහ අදාළ දත්ත සාර්ථකව මකන ලදී.",
        "course_id": course_id,
        "deleted_pdf_count": len(deleted_files),
    }