from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..core.database import get_db
from ..core.security import get_password_hash
from ..models.models import (
    AuditLog, Appointment, Doctor, Hospital, LabReport,
    Laboratory, Patient, User,
)
from ..schemas.schemas import AdminSummaryResponse
from .deps import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


class StatusUpdate(BaseModel):
    status: str


class CreateDoctorRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    password: str
    specialization: str | None = None
    qualification: str | None = None
    experience: int | None = None
    license_number: str | None = None
    hospital_name: str | None = None
    hospital_id: int | None = None


class CreateLabRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    password: str
    lab_name: str | None = None
    registration_number: str | None = None
    address: str | None = None
    hospital_id: int | None = None


def get_admin_hospital(current_user: User) -> int | None:
    """Return hospital_id for this admin, or None if super-admin."""
    return current_user.hospital_id


def scoped_doctors(db: Session, hospital_id: int | None):
    q = db.query(Doctor, User).join(User, User.user_id == Doctor.user_id)
    if hospital_id:
        q = q.filter(Doctor.hospital_id == hospital_id)
    return q


def scoped_patients(db: Session, hospital_id: int | None):
    q = db.query(Patient, User).join(User, User.user_id == Patient.user_id)
    if hospital_id:
        doctor_ids = [d.doctor_id for d in db.query(Doctor).filter(Doctor.hospital_id == hospital_id).all()]
        patient_ids = [
            row[0] for row in
            db.query(Appointment.patient_id)
            .filter(Appointment.doctor_id.in_(doctor_ids))
            .distinct()
            .all()
        ]
        q = q.filter(Patient.patient_id.in_(patient_ids))
    return q


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)

    # Hospital info
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hid).first() if hid else None

    # Scoped counts
    doctors_q = db.query(Doctor)
    patients_q = db.query(Patient)
    appointments_q = db.query(Appointment)
    reports_q = db.query(LabReport)

    if hid:
        doctors_q = doctors_q.filter(Doctor.hospital_id == hid)
        appointments_q = appointments_q.filter(Appointment.hospital_id == hid)
        patient_ids = [a.patient_id for a in appointments_q.with_entities(Appointment.patient_id).distinct()]
        patients_q = patients_q.filter(Patient.patient_id.in_(patient_ids))
        doctor_ids = [d.doctor_id for d in doctors_q.with_entities(Doctor.doctor_id)]
        reports_q = reports_q.filter(LabReport.doctor_id.in_(doctor_ids))

    labs_q = db.query(Laboratory)

    # Appointment status breakdown
    status_rows = (
        db.query(Appointment.status, func.count(Appointment.appointment_id))
        .filter(Appointment.hospital_id == hid if hid else True)
        .group_by(Appointment.status)
        .all()
    )
    status_breakdown = {s: c for s, c in status_rows}

    # Recent logs
    logs = db.query(AuditLog).order_by(AuditLog.log_time.desc()).limit(10).all()

    return {
        "hospital_id": hid,
        "hospital_name": hospital.name if hospital else "All Hospitals",
        "hospital_address": hospital.address if hospital else None,
        "hospital_phone": hospital.phone if hospital else None,
        "patients": patients_q.count(),
        "doctors": doctors_q.count(),
        "labs": labs_q.count(),
        "appointments": appointments_q.count(),
        "reports": reports_q.count(),
        "appointment_status": status_breakdown,
        "recent_logs": [log.action for log in logs],
    }


# ── Doctors ───────────────────────────────────────────────────────────────────

@router.get("/doctors")
def get_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)
    rows = scoped_doctors(db, hid).all()
    return [
        {
            "doctor_id": d.doctor_id,
            "user_id": d.user_id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "specialization": d.specialization,
            "qualification": d.qualification,
            "experience": d.experience,
            "license_number": d.license_number,
            "hospital_name": d.hospital_name,
            "hospital_id": d.hospital_id,
            "status": u.status,
            "created_at": u.created_at,
        }
        for d, u in rows
    ]


@router.put("/doctors/{user_id}/status")
def update_doctor_status(
    user_id: int,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.user_id == user_id, User.role == "Doctor").first()
    if not user:
        raise HTTPException(status_code=404, detail="Doctor not found")
    user.status = body.status
    db.add(AuditLog(user_id=current_user.user_id, action=f"Doctor status updated: user_id={user_id} -> {body.status}", module="admin"))
    db.commit()
    return {"message": f"Doctor status updated to {user.status}"}


@router.post("/doctors", status_code=201)
def create_doctor(
    body: CreateDoctorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    hid = body.hospital_id or get_admin_hospital(current_user)
    user = User(
        role="Doctor",
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        hospital_id=hid,
        password_hash=get_password_hash(body.password),
        status="Active",
    )
    db.add(user)
    db.flush()
    db.add(Doctor(
        user_id=user.user_id,
        specialization=body.specialization,
        qualification=body.qualification,
        experience=body.experience,
        license_number=body.license_number,
        hospital_name=body.hospital_name,
        hospital_id=hid,
    ))
    db.add(AuditLog(user_id=current_user.user_id, action=f"Admin created doctor: {body.email}", module="admin"))
    db.commit()
    db.refresh(user)
    return {"user_id": user.user_id, "message": "Doctor created successfully"}


# ── Patients ──────────────────────────────────────────────────────────────────

@router.get("/patients")
def get_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)
    rows = scoped_patients(db, hid).all()
    return [
        {
            "patient_id": p.patient_id,
            "user_id": p.user_id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "date_of_birth": p.date_of_birth,
            "allergies": p.allergies,
            "chronic_diseases": p.chronic_diseases,
            "insurance_number": p.insurance_number,
            "status": u.status,
            "created_at": u.created_at,
        }
        for p, u in rows
    ]


@router.put("/patients/{user_id}/status")
def update_patient_status(
    user_id: int,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.user_id == user_id, User.role == "Patient").first()
    if not user:
        raise HTTPException(status_code=404, detail="Patient not found")
    user.status = body.status
    db.add(AuditLog(user_id=current_user.user_id, action=f"Patient status updated: user_id={user_id} -> {body.status}", module="admin"))
    db.commit()
    return {"message": f"Patient status updated to {user.status}"}


# ── Labs ──────────────────────────────────────────────────────────────────────

@router.get("/labs")
def get_labs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)
    q = db.query(Laboratory, User).join(User, User.user_id == Laboratory.user_id)
    if hid:
        q = q.filter(Laboratory.hospital_id == hid)
    rows = q.all()
    return [
        {
            "lab_id": lab.lab_id,
            "user_id": lab.user_id,
            "lab_name": lab.lab_name,
            "registration_number": lab.registration_number,
            "address": lab.address,
            "email": u.email,
            "phone": u.phone,
            "status": u.status,
            "created_at": u.created_at,
        }
        for lab, u in rows
    ]


@router.put("/labs/{user_id}/status")
def update_lab_status(
    user_id: int,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.user_id == user_id, User.role == "Lab").first()
    if not user:
        raise HTTPException(status_code=404, detail="Lab not found")
    user.status = body.status
    db.add(AuditLog(user_id=current_user.user_id, action=f"Lab status updated: user_id={user_id} -> {body.status}", module="admin"))
    db.commit()
    return {"message": f"Lab status updated to {user.status}"}


@router.post("/labs", status_code=201)
def create_lab(
    body: CreateLabRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    hid = body.hospital_id or get_admin_hospital(current_user)
    user = User(
        role="Lab",
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        hospital_id=hid,
        password_hash=get_password_hash(body.password),
        status="Active",
    )
    db.add(user)
    db.flush()
    db.add(Laboratory(
        user_id=user.user_id,
        lab_name=body.lab_name,
        registration_number=body.registration_number,
        address=body.address,
        hospital_id=hid,
    ))
    db.add(AuditLog(user_id=current_user.user_id, action=f"Admin created lab: {body.email}", module="admin"))
    db.commit()
    db.refresh(user)
    return {"user_id": user.user_id, "message": "Lab created successfully"}


# ── Appointments ──────────────────────────────────────────────────────────────

@router.get("/appointments")
def get_appointments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)
    q = (
        db.query(Appointment, Patient, User, Doctor)
        .join(Patient, Patient.patient_id == Appointment.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .join(Doctor, Doctor.doctor_id == Appointment.doctor_id)
    )
    if hid:
        q = q.filter(Appointment.hospital_id == hid)
    rows = q.order_by(Appointment.appointment_date.desc()).limit(50).all()
    return [
        {
            "appointment_id": a.appointment_id,
            "patient_name": u.full_name,
            "doctor_name": db.query(User).filter(User.user_id == d.user_id).first().full_name,
            "appointment_date": a.appointment_date,
            "appointment_time": a.appointment_time,
            "department": a.department,
            "status": a.status,
            "reason": a.reason,
        }
        for a, p, u, d in rows
    ]


# ── Hospital Info ─────────────────────────────────────────────────────────────

@router.get("/hospital")
def get_hospital_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hid = get_admin_hospital(current_user)
    if not hid:
        hospitals = db.query(Hospital).all()
        return [{"hospital_id": h.hospital_id, "name": h.name, "address": h.address, "phone": h.phone} for h in hospitals]
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hid).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"hospital_id": hospital.hospital_id, "name": hospital.name, "address": hospital.address, "phone": hospital.phone}
