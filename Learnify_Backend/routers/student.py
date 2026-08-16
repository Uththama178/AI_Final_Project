"""Student Dashboard API — published catalog, enrollment, and enrolled course content."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer

from database import get_db
import models
import schema

router = APIRouter(
    prefix="/student",
    tags=["Student Dashboard"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
SECRET_KEY = "learnify-secret-key-change-me"
ALGORITHM = "HS256"


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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


def _require_student(current_user: models.AppUser) -> None:
    if current_user.Role.lower() not in ["student", "both"]:
        raise HTTPException(
            status_code=403,
            detail="This action requires a student account. Please log in as a student.",
        )


def _get_student_profile(db: Session, current_user: models.AppUser) -> models.Student:
    student = (
        db.query(models.Student)
        .filter(models.Student.User_ID == current_user.User_ID)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return student


def _teacher_name(course: models.Course) -> str:
    if course.teacher and course.teacher.user:
        return course.teacher.user.Name
    return "Unknown Teacher"


def _build_chapter_details(course: models.Course) -> list[schema.ChapterDetailResponse]:
    chapters_payload: list[schema.ChapterDetailResponse] = []
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
    return chapters_payload


# ====================================================================================
# 1) GET /student/courses — published catalog (read-only)
# ====================================================================================
@router.get("/courses", response_model=list[schema.StudentPublishedCourseResponse])
def get_published_courses(
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user),
):
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    enrolled_ids = {
        row.Course_ID
        for row in db.query(models.Enrollment.Course_ID)
        .filter(models.Enrollment.Student_ID == student.Student_ID)
        .all()
    }

    courses = (
        db.query(models.Course)
        .options(joinedload(models.Course.teacher).joinedload(models.Teacher.user))
        .filter(models.Course.is_published.is_(True))
        .all()
    )

    return [
        schema.StudentPublishedCourseResponse(
            Course_ID=course.Course_ID,
            Title=course.Title,
            Description=course.Description,
            Price=float(course.Price or 0),
            Teacher_ID=course.Teacher_ID,
            Teacher_Name=_teacher_name(course),
            chapter_count=len(course.chapters or []),
            is_published=True,
        )
        for course in courses
        if course.Course_ID not in enrolled_ids #8/15#
    ]


# ====================================================================================
# 2) POST /student/enroll/{course_id} — enroll in a published course
# ====================================================================================
@router.post(
    "/enroll/{course_id}",
    response_model=schema.StudentEnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def enroll_in_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user),
):
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    course = (
        db.query(models.Course)
        .filter(
            models.Course.Course_ID == course_id,
            models.Course.is_published.is_(True),
        )
        .first()
    )
    if not course:
        raise HTTPException(
            status_code=404,
            detail="Published course not found.",
        )

    existing = (
        db.query(models.Enrollment)
        .filter(
            models.Enrollment.Student_ID == student.Student_ID,
            models.Enrollment.Course_ID == course_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You are already enrolled in this course.",
        )

    enrollment = models.Enrollment(
        Student_ID=student.Student_ID,
        Course_ID=course.Course_ID,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)

    return schema.StudentEnrollmentResponse(
        status="Success",
        message="Successfully enrolled in the course.",
        Enrollment_ID=enrollment.Enrollment_ID,
        Course_ID=course.Course_ID,
    )


# ====================================================================================
# 3) GET /student/my-courses — enrolled courses with content
# ====================================================================================
@router.get("/my-courses", response_model=list[schema.StudentEnrolledCourseResponse])
def get_my_enrolled_courses(
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user),
):
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    enrollments = (
        db.query(models.Enrollment)
        .options(
            joinedload(models.Enrollment.course)
            .joinedload(models.Course.teacher)
            .joinedload(models.Teacher.user),
            joinedload(models.Enrollment.course)
            .joinedload(models.Course.chapters)
            .joinedload(models.CourseChapter.quiz)
            .joinedload(models.Quiz.questions),
        )
        .filter(models.Enrollment.Student_ID == student.Student_ID)
        .all()
    )

    results: list[schema.StudentEnrolledCourseResponse] = []
    for enrollment in enrollments:
        course = enrollment.course
        if not course:
            continue

        enrollment_date = None
        if enrollment.Enrollment_Date is not None:
            enrollment_date = enrollment.Enrollment_Date.isoformat()

        existing_rating = (
            db.query(models.CourseRating)
            .filter(
                models.CourseRating.Student_ID == student.Student_ID,
                models.CourseRating.Course_ID == course.Course_ID,
            )
            .first()
        )

        results.append(
            schema.StudentEnrolledCourseResponse(
                Course_ID=course.Course_ID,
                Title=course.Title,
                Description=course.Description,
                Price=float(course.Price or 0),
                Teacher_Name=_teacher_name(course),
                Enrollment_ID=enrollment.Enrollment_ID,
                Enrollment_Date=enrollment_date,
                Rating_Stars=existing_rating.Rating_Stars if existing_rating else None,
                chapters=_build_chapter_details(course),
            )
        )

    return results


# ====================================================================================
# 4) POST /student/rate-course/{course_id} — enrolled students only
# ====================================================================================
@router.post(
    "/rate-course/{course_id}",
    response_model=schema.StudentCourseRatingResponse,
    status_code=status.HTTP_200_OK,
)
def rate_enrolled_course(
    course_id: int,
    payload: schema.StudentCourseRatingRequest,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user),
):
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    stars = int(payload.Rating_Stars)
    if stars < 1 or stars > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5 stars.")

    enrollment = (
        db.query(models.Enrollment)
        .filter(
            models.Enrollment.Student_ID == student.Student_ID,
            models.Enrollment.Course_ID == course_id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(
            status_code=403,
            detail="You can only rate courses you are enrolled in.",
        )

    rating = (
        db.query(models.CourseRating)
        .filter(
            models.CourseRating.Student_ID == student.Student_ID,
            models.CourseRating.Course_ID == course_id,
        )
        .first()
    )
    if rating:
        rating.Rating_Stars = stars
        if payload.Comment is not None:
            rating.Comment = payload.Comment
    else:
        rating = models.CourseRating(
            Student_ID=student.Student_ID,
            Course_ID=course_id,
            Rating_Stars=stars,
            Comment=payload.Comment,
        )
        db.add(rating)

    db.commit()
    db.refresh(rating)

    return schema.StudentCourseRatingResponse(
        status="Success",
        message="Course rating saved successfully.",
        Course_ID=course_id,
        Rating_Stars=rating.Rating_Stars,
    )


# ====================================================================================
# 5) POST /student/complete-course-activities
#     Persist ALL chapter quiz activities ONLY after final course completion.
#     Does not alter the student_activity table schema — writes rows only.
# ====================================================================================
@router.post(
    "/complete-course-activities",
    response_model=schema.StudentCourseActivitiesResponse,
    status_code=status.HTTP_200_OK,
)
def save_complete_course_activities(
    payload: schema.StudentCourseActivitiesRequest,
    db: Session = Depends(get_db),
    current_user: models.AppUser = Depends(get_current_user),
):
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    enrollment = (
        db.query(models.Enrollment)
        .filter(
            models.Enrollment.Student_ID == student.Student_ID,
            models.Enrollment.Course_ID == payload.Course_ID,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(
            status_code=403,
            detail="You can only save activity for courses you are enrolled in.",
        )

    if not payload.activities:
        raise HTTPException(status_code=400, detail="No quiz activities provided.")

    course = (
        db.query(models.Course)
        .options(
            joinedload(models.Course.chapters).joinedload(models.CourseChapter.quiz)
        )
        .filter(models.Course.Course_ID == payload.Course_ID)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")

    chapters = sorted(course.chapters or [], key=lambda c: c.Chapter_Number or 0)
    if not chapters:
        raise HTTPException(status_code=400, detail="Course has no chapters.")

    # Allowed quiz IDs for this course
    course_quiz_ids = {
        chapter.quiz.Quiz_ID
        for chapter in chapters
        if chapter.quiz is not None
    }
    if not course_quiz_ids:
        raise HTTPException(status_code=400, detail="Course has no quizzes to save.")

    # Require activities for every chapter quiz (full-course completion dump)
    submitted_quiz_ids = {item.Quiz_ID for item in payload.activities}
    missing = course_quiz_ids - submitted_quiz_ids
    if missing:
        raise HTTPException(
            status_code=400,
            detail="All chapter quiz results must be submitted together at final course completion.",
        )

    extra = submitted_quiz_ids - course_quiz_ids
    if extra:
        raise HTTPException(
            status_code=400,
            detail="One or more quizzes do not belong to this course.",
        )

    saved_count = 0
    for item in payload.activities:
        marks = int(item.Marks_Obtained)
        time_spent = max(0, int(item.Time_Spent_Minutes))
        attendance = int(item.Attendance_Percentage)

        if marks < 0 or marks > 100:
            raise HTTPException(
                status_code=400,
                detail="Marks_Obtained must be between 0 and 100.",
            )
        if attendance < 0 or attendance > 100:
            raise HTTPException(
                status_code=400,
                detail="Attendance_Percentage must be between 0 and 100.",
            )

        existing = (
            db.query(models.StudentActivity)
            .filter(
                models.StudentActivity.Student_ID == student.Student_ID,
                models.StudentActivity.Quiz_ID == item.Quiz_ID,
            )
            .first()
        )
        if existing:
            existing.Marks_Obtained = marks
            existing.Time_Spent_Minutes = time_spent
            existing.Attendance_Percentage = attendance
        else:
            db.add(
                models.StudentActivity(
                    Student_ID=student.Student_ID,
                    Quiz_ID=item.Quiz_ID,
                    Marks_Obtained=marks,
                    Time_Spent_Minutes=time_spent,
                    Attendance_Percentage=attendance,
                )
            )
        saved_count += 1

    db.commit()

    return schema.StudentCourseActivitiesResponse(
        status="Success",
        message="Course quiz activities saved to student_activity after final chapter completion.",
        Course_ID=payload.Course_ID,
        saved_count=saved_count,
    )
