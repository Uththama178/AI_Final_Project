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


