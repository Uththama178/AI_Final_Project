from datetime import datetime, timedelta, timezone
from typing import Optional, AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import (
    AcademicPrediction, AppUser, Course, CourseRating,
    Enrollment, Notification, Question, Quiz, Student,
    StudentActivity, Teacher,
)
import schema
import auth  


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    print("Attempting to create all 11 tables in MySQL...")
    Base.metadata.create_all(bind=engine)
    print("✅ Table Creation Process Finished!")
    yield


app = FastAPI(
    title="Learnify AI Smart Learning Platform API",
    lifespan=lifespan
)

SECRET_KEY = "learnify-secret-key-change-me"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@app.get("/")
def home():
    return {
        "status": "Success",
        "message": "Learnify Backend Core is Running! All 11 Tables Checked/Created Successfully."
    }



@app.post("/signup", response_model=schema.UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: schema.UserCreate, db: Session = Depends(get_db)):
    # 1. Check if the email has been previously registered.
    existing_user = db.query(AppUser).filter(AppUser.Email == user.Email.lower()).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # 2. Insert the new user into the main AppUser table
    new_user = AppUser(
        Name=user.Name,
        Email=user.Email.lower(),
        Password=auth.get_password_hash(user.Password),  # Hashing passwords with auth.py
        Role=user.Role.lower(),
    )
    db.add(new_user)
    db.flush()  

    # 3. ROLE BASED PROFILE CREATION
    user_role = user.Role.lower()
    
    if user_role == "student":
        student_profile = Student(User_ID=new_user.User_ID)
        db.add(student_profile)
        
    elif user_role == "teacher":
        teacher_profile = Teacher(User_ID=new_user.User_ID)
        db.add(teacher_profile)
        
    elif user_role == "both":
        student_profile = Student(User_ID=new_user.User_ID)
        teacher_profile = Teacher(User_ID=new_user.User_ID)
        db.add(student_profile)
        db.add(teacher_profile)

    db.commit()
    db.refresh(new_user)
    return new_user



@app.post("/login", response_model=schema.Token)
def login(user: schema.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(AppUser).filter(AppUser.Email == user.Email.lower()).first()
    if not db_user or not auth.verify_password(user.Password, db_user.Password): 
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token = create_access_token({"sub": db_user.Email})
    return {"access_token": access_token, "token_type": "bearer"}