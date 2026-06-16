from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal 

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

class TokenData(BaseModel):
    email: Optional[str] = None