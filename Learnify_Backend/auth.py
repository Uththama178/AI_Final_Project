import bcrypt

def get_password_hash(password: str) -> str:
    # The password is converted from a string to bytes and hashed.
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8') # Return the hashed password as a string

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # When logging in, compare the plain password with the hashed password from the database
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)