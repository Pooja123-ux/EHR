import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import create_access_token, get_password_hash, verify_password
from ..models.models import AuditLog, Doctor, Laboratory, Patient, User
from ..schemas.schemas import Token, UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

password_regex = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$')


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(request: Request, user_in: UserCreate, db: Session = Depends(get_db)):
    if not password_regex.match(user_in.password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters and include uppercase, lowercase, number, and special character.",
        )
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    role = user_in.role.capitalize()
    if role not in {"Patient", "Doctor", "Lab", "Admin"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    if role == "Admin" and not user_in.hospital_id:
        raise HTTPException(status_code=400, detail="Hospital ID is required for admin accounts")

    user = User(
        role=role,
        full_name=user_in.full_name,
        email=user_in.email,
        phone=user_in.phone,
        hospital_id=user_in.hospital_id,
        password_hash=get_password_hash(user_in.password),
        status=user_in.status or "Active",
    )
    db.add(user)
    db.flush()

    if role == "Patient":
        db.add(
            Patient(
                user_id=user.user_id,
                date_of_birth=user_in.date_of_birth,
                gender=user_in.gender,
                blood_group=user_in.blood_group,
                height=user_in.height,
                weight=user_in.weight,
                allergies=user_in.allergies,
                chronic_diseases=user_in.chronic_diseases,
                emergency_contact=user_in.emergency_contact,
                insurance_number=user_in.insurance_number,
            )
        )
    elif role == "Doctor":
        db.add(
            Doctor(
                user_id=user.user_id,
                specialization=user_in.specialization,
                qualification=user_in.qualification,
                experience=user_in.experience,
                license_number=user_in.license_number,
                hospital_name=user_in.hospital_name,
            )
        )
    elif role == "Lab":
        db.add(
            Laboratory(
                user_id=user.user_id,
                lab_name=user_in.lab_name,
                registration_number=user_in.registration_number,
                address=user_in.address,
                hospital_id=user_in.hospital_id,
            )
        )

    db.commit()
    db.refresh(user)

    db.add(AuditLog(user_id=user.user_id, action=f"User registered: {user.email} ({role})", module="auth"))
    db.commit()
    return user


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if credentials.role and user.role.lower() != credentials.role.lower():
        raise HTTPException(status_code=403, detail="Selected role does not match this account")

    token = create_access_token(
        {
            "sub": user.email,
            "user_id": user.user_id,
            "role": user.role,
        }
    )
    db.add(AuditLog(user_id=user.user_id, action=f"User logged in: {user.email}", module="auth"))
    db.commit()
    return Token(access_token=token, role=user.role, user_id=user.user_id)
