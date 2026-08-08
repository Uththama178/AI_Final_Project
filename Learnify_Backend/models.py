from sqlalchemy import (
    Column, Integer, String, ForeignKey,
    TEXT, Numeric, DateTime, Boolean,
    CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# ==========================================
# 1. User Table
# ==========================================
class AppUser(Base):
    __tablename__ = "app_user"
    User_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Name = Column(String(100), nullable=False)
    Email = Column(String(100), unique=True, index=True, nullable=False)
    Password = Column(String(255), nullable=False)
    Role = Column(String(20), nullable=False)

    # Relationships
    teacher_profile = relationship("Teacher", back_populates="user", uselist=False, cascade="all, delete-orphan")
    student_profile = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")


# ==========================================
# 2. Teacher Table 
# ==========================================
class Teacher(Base):
    __tablename__ = "teacher"
    Teacher_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), unique=True)
    Description = Column(TEXT)

    # Relationships
    user = relationship("AppUser", back_populates="teacher_profile")
    courses = relationship("Course", back_populates="teacher", cascade="all, delete-orphan")



# 3. Student Table 
# ==========================================
class Student(Base):
    __tablename__ = "student"
    Student_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), unique=True)
    Current_Grade = Column(String(50))

    # Relationships
    user = relationship("AppUser", back_populates="student_profile")
    enrollments = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")
    activities = relationship("StudentActivity", back_populates="student", cascade="all, delete-orphan")
    predictions = relationship("AcademicPrediction", back_populates="student", cascade="all, delete-orphan")
    ratings = relationship("CourseRating", back_populates="student", cascade="all, delete-orphan")



# 4. Course Table

class Course(Base):
    __tablename__ = "course"
    Course_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Teacher_ID = Column(Integer, ForeignKey("teacher.Teacher_ID", ondelete="CASCADE"))
    Title = Column(String(150), nullable=False)
    Description = Column(TEXT)
    Price = Column(Numeric(10, 2), default=0.00)
    is_published = Column(Boolean, nullable=False, default=False)

    # Relationships
    teacher = relationship("Teacher", back_populates="courses")
    chapters = relationship("CourseChapter", back_populates="course", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    ratings = relationship("CourseRating", back_populates="course", cascade="all, delete-orphan")



# 5. Course Chapter Table (Chapter 1, 2, 3 System )

class CourseChapter(Base):
    __tablename__ = "course_chapter"
    Chapter_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"), nullable=False)  # ◄ Fixed Naming Case!
    Chapter_Number = Column(Integer, nullable=False)  # 1, 2, හෝ 3
    Chapter_Title = Column(String(150), nullable=False)
    Video_Link_Or_Path = Column(String(255), nullable=True)
    PDF_Link_Or_Path = Column(String(255), nullable=True)

    # Relationships
    course = relationship("Course", back_populates="chapters")
    quiz = relationship("Quiz", back_populates="chapter", uselist=False, cascade="all, delete-orphan")

    
    __table_args__ = (
        UniqueConstraint('Course_ID', 'Chapter_Number', name='unique_course_chapter_no'),
    )



# 6. Enrollment Table (Junction Table)

class Enrollment(Base):
    __tablename__ = "enrollment"
    Enrollment_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"))
    Enrollment_Date = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    student = relationship("Student", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")

    __table_args__ = (UniqueConstraint('Student_ID', 'Course_ID', name='_student_course_uc'),)



# 7. Quiz Table

class Quiz(Base):
    __tablename__ = "quiz"
    Quiz_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Chapter_ID = Column(Integer, ForeignKey("course_chapter.Chapter_ID", ondelete="CASCADE"))  # ◄ Fixed Naming Case!
    Quiz_Title = Column(String(150), nullable=False)

    # Relationships
    chapter = relationship("CourseChapter", back_populates="quiz")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    activities = relationship("StudentActivity", back_populates="quiz", cascade="all, delete-orphan")



# 8. Question Table (RAG/T5 Generated MCQs)

class Question(Base):
    __tablename__ = "question"
    Question_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Quiz_ID = Column(Integer, ForeignKey("quiz.Quiz_ID", ondelete="CASCADE"))
    Question_Text = Column(TEXT, nullable=False)
    Option_A = Column(String(255), nullable=False)
    Option_B = Column(String(255), nullable=False)
    Option_C = Column(String(255), nullable=False)
    Option_D = Column(String(255), nullable=False)
    Correct_Answer = Column(String(1), nullable=False)

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")



# 9. Student_Activity Table (Random Forest Input)

class StudentActivity(Base):
    __tablename__ = "student_activity"
    Activity_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Quiz_ID = Column(Integer, ForeignKey("quiz.Quiz_ID", ondelete="CASCADE"))
    Marks_Obtained = Column(Integer, nullable=False)
    Time_Spent_Minutes = Column(Integer, nullable=False)
    Attendance_Percentage = Column(Integer, nullable=False)

    # Relationships
    student = relationship("Student", back_populates="activities")
    quiz = relationship("Quiz", back_populates="activities")



# 10. Academic_Prediction Table (Random Forest Output)

class AcademicPrediction(Base):
    __tablename__ = "academic_prediction"
    Prediction_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Risk_Level = Column(String(20), nullable=False)
    Predicted_Date = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("Student", back_populates="predictions")

    __table_args__ = (
        CheckConstraint("Risk_Level IN ('High','Medium','Low')", name='check_risk_level'),
    )



# 11. Course_Rating Table (Recommender Input)

class CourseRating(Base):
    __tablename__ = "course_rating"
    Rating_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"))
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Rating_Stars = Column(Integer, nullable=False)
    Comment = Column(TEXT)
    
    # Relationships
    course = relationship("Course", back_populates="ratings")
    student = relationship("Student", back_populates="ratings")
    
    __table_args__ = (
        CheckConstraint('Rating_Stars BETWEEN 1 AND 5', name='check_rating_stars'),
        UniqueConstraint('Student_ID', 'Course_ID', name='_student_course_rating_uc'),
    )



# 12. Notification Table

class Notification(Base):
    __tablename__ = "notification"
    Notification_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), nullable=False)
    User_Type = Column(String(20), nullable=False)
    Message = Column(TEXT, nullable=False)
    Is_Read = Column(Boolean, default=False)
    Created_Date = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("User_Type IN ('student','teacher')", name='check_user_type'),
    )