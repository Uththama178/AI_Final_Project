from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, Literal, List


# 1. Base User Schema (Common Data)
class UserBase(BaseModel):
    Name: str = Field(..., max_length=100, description="Username")
    Email: EmailStr = Field(..., description="User's email address")
    Role: Literal["student", "teacher", "both"] 

# 2. Registration (Sign Up) 
class UserCreate(UserBase):
    Password: str = Field(..., min_length=6, description="Must be at least 6 letters/digits")

# 3. Login (Sign In) 
class UserLogin(BaseModel):
    Email: EmailStr
    Password: str

# 4. Response Schema for Front-end
class UserResponse(BaseModel):
    User_ID: int
    Name: str
    Email: EmailStr
    Role: str

    class Config:
        from_attributes = True

# 5. Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user_name: str
    user_email: str
    user_role: str
class TokenData(BaseModel):
    email: Optional[str] = None

    # 1. Question එකක් සේව් කරන්න එන දත්ත
class QuestionCreate(BaseModel):
    Question_Text: str
    Option_A: str
    Option_B: str
    Option_C: str
    Option_D: str
    Correct_Answer: str  # "A", "B", "C" හෝ "D"

# 2. Quiz එකක් සේව් කරන්න එන දත්ත
class QuizCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    Quiz_Title: str = Field(
        ...,
        validation_alias=AliasChoices("quiz_title", "Quiz_Title"),
    )
    questions: List[QuestionCreate]

# 3. Chapter එකක් සේව් කරන්න එන දත්ත
class ChapterCreate(BaseModel):
    Chapter_Number: int  # 1, 2, හෝ 3
    Chapter_Title: str
    Video_Link_Or_Path: str  # YouTube Link එක string එකක් ලෙස
    PDF_Link_Or_Path: str    # කලින් generate-quiz එකෙන් දීපු uploads/pdfs/... path එක
    quiz: Optional[QuizCreate] = None

# 4. මුළු Course එකම එක පාර සේව් කරන්න එන ප්‍රධාන Payload එක
class CourseCreatePayload(BaseModel):
    Title: str
    Description: Optional[str] = None
    Price: float
    chapters: List[ChapterCreate]

# 5. Teacher ගේ "My Courses" ලිස්ට් එකට යවන Summary Response Schema
class CourseSummaryResponse(BaseModel):
    Course_ID: int
    Title: str
    Description: Optional[str] = None
    Price: float
    chapter_count: int

    class Config:
        from_attributes = True


# 6. Course Edit Request (Title / Description / Price only)
class CourseUpdateRequest(BaseModel):
    Title: Optional[str] = None
    Description: Optional[str] = None
    Price: Optional[float] = None


# 7. Detailed Course Card Response Schemas (nested chapters / quiz / questions)
class QuestionDetailResponse(BaseModel):
    Question_ID: int
    Question_Text: str
    Option_A: str
    Option_B: str
    Option_C: str
    Option_D: str
    Correct_Answer: str

    class Config:
        from_attributes = True


class QuizDetailResponse(BaseModel):
    Quiz_ID: int
    Quiz_Title: str
    questions: List[QuestionDetailResponse] = []

    class Config:
        from_attributes = True


class ChapterDetailResponse(BaseModel):
    Chapter_ID: int
    Chapter_Number: int
    Chapter_Title: str
    Video_Link_Or_Path: Optional[str] = None
    PDF_Link_Or_Path: Optional[str] = None
    quiz: Optional[QuizDetailResponse] = None

    class Config:
        from_attributes = True


class CourseDetailResponse(BaseModel):
    Course_ID: int
    Title: str
    Description: Optional[str] = None
    Price: float
    chapters: List[ChapterDetailResponse] = []

    class Config:
        from_attributes = True


# 8. Course Publish Request / Response
class CoursePublishRequest(BaseModel):
    is_published: bool = True


class CoursePublishResponse(BaseModel):
    Course_ID: int
    Title: str
    is_published: bool
    message: str

    class Config:
        from_attributes = True


# 9. Student catalog / enrollment schemas
class StudentPublishedCourseResponse(BaseModel):
    Course_ID: int
    Title: str
    Description: Optional[str] = None
    Price: float
    Teacher_ID: int
    Teacher_Name: str
    chapter_count: int
    is_published: bool = True


class StudentEnrollmentResponse(BaseModel):
    status: str
    message: str
    Enrollment_ID: int
    Course_ID: int


class StudentEnrolledCourseResponse(BaseModel):
    Course_ID: int
    Title: str
    Description: Optional[str] = None
    Price: float
    Teacher_Name: str
    Enrollment_ID: int
    Enrollment_Date: Optional[str] = None
    chapters: List[ChapterDetailResponse] = []


