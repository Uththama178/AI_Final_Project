from sqlalchemy import (
    Column, Integer, String, ForeignKey,
    TEXT, Numeric, DateTime, Boolean,
    CheckConstraint, UniqueConstraint
)
from sqlalchemy.sql import func
from database import Base

# 1. User Table
class AppUser(Base):
    __tablename__ = "app_user"
    User_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Name = Column(String(100), nullable=False)
    Email = Column(String(100), unique=True, index=True, nullable=False)
    Password = Column(String(255), nullable=False)
    Role = Column(String(20), nullable=False)

# 2. Teacher Table 
class Teacher(Base):
    __tablename__ = "teacher"
    Teacher_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), unique=True)
    Description = Column(TEXT)

# 3. Student Table 
class Student(Base):
    __tablename__ = "student"
    Student_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), unique=True)
    Current_Grade = Column(String(50))

# 4. Course Table
class Course(Base):
    __tablename__ = "course"
    Course_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Teacher_ID = Column(Integer, ForeignKey("teacher.Teacher_ID", ondelete="CASCADE"))
    Title = Column(String(150), nullable=False)
    Description = Column(TEXT)
    File_Path = Column(String(255))
    Price = Column(Numeric(10, 2), default=0.00)

# 5. Enrollment Table (Junction Table)
class Enrollment(Base):
    __tablename__ = "enrollment"
    Enrollment_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"))
    Enrollment_Date = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (UniqueConstraint('Student_ID', 'Course_ID', name='_student_course_uc'),)

# 6. Quiz Table
class Quiz(Base):
    __tablename__ = "quiz"
    Quiz_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"))
    Quiz_Title = Column(String(150), nullable=False)

# 7. Question Table (T5 Model generated MCQs)
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

# 8. Student_Activity Table (Random Forest Input)
class StudentActivity(Base):
    __tablename__ = "student_activity"
    Activity_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Quiz_ID = Column(Integer, ForeignKey("quiz.Quiz_ID", ondelete="CASCADE"))
    Marks_Obtained = Column(Integer, nullable=False)
    Time_Spent_Minutes = Column(Integer, nullable=False)
    Attendance_Percentage = Column(Integer, nullable=False)

# 9. Academic_Prediction Table (Random Forest Output)
class AcademicPrediction(Base):
    __tablename__ = "academic_prediction"
    Prediction_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Risk_Level = Column(String(20), nullable=False)
    Predicted_Date = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "Risk_Level IN ('High','Medium','Low')",
            name='check_risk_level'
        ),
    )


# 10. Course_Rating Table (Recommender Input)
class CourseRating(Base):
    __tablename__ = "course_rating"
    Rating_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Course_ID = Column(Integer, ForeignKey("course.Course_ID", ondelete="CASCADE"))
    Student_ID = Column(Integer, ForeignKey("student.Student_ID", ondelete="CASCADE"))
    Rating_Stars = Column(Integer, nullable=False)
    Comment = Column(TEXT)
    
    __table_args__ = (
        CheckConstraint('Rating_Stars BETWEEN 1 AND 5', name='check_rating_stars'),
        UniqueConstraint('Student_ID', 'Course_ID', name='_student_course_rating_uc'),
    )

# 11. Notification Table
class Notification(Base):
    __tablename__ = "notification"
    Notification_ID = Column(Integer, primary_key=True, index=True, autoincrement=True)
    User_ID = Column(Integer, ForeignKey("app_user.User_ID", ondelete="CASCADE"), nullable=False)
    User_Type = Column(String(20), nullable=False)
    Message = Column(TEXT, nullable=False)
    Is_Read = Column(Boolean, default=False)
    Created_Date = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
    CheckConstraint(
        "User_Type IN ('student','teacher')",
        name='check_user_type'
    ),
)