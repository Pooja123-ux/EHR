from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.models import (
    AISummary, Appointment, Doctor, LabReport, MedicalRecord,
    MedicalTimeline, Notification, Patient, Prescription, User,
)
from ..ml.drug_interaction_predictor import predict_drug_interactions
from ..schemas.schemas import (
    ConsultationCreate, ConsultationResponse,
    DoctorDashboardResponse, DoctorSummaryResponse,
    DoctorUpdate, DrugInteractionCheckRequest,
    DrugInteractionCheckResponse, MedicalRecordCreate,
    MedicalRecordResponse, PatientEHRResponse,
    PrescriptionCreate, PrescriptionResponse, ReportReviewUpdate,
)
from .deps import get_current_user

router = APIRouter(prefix="/api/doctor", tags=["doctor"])


class AppointmentStatusUpdate(BaseModel):
    status: str


# ── Helpers ──────────────────────────────────────────────────────────────

def get_doctor_for_user(db: Session, user: User) -> Doctor:
    doctor = db.query(Doctor).filter(Doctor.user_id == user.user_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    return doctor


def _build_ai_summary_for_patient(db: Session, patient_id: int) -> dict:
    """Build a synthetic AI summary of the patient's history."""
    records = (
        db.query(MedicalRecord)
        .filter(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.created_at.desc())
        .limit(10)
        .all()
    )

    previous_diagnoses = list(set(r.diagnosis for r in records if r.diagnosis))[:5]

    prescriptions = (
        db.query(Prescription, MedicalRecord)
        .join(MedicalRecord, MedicalRecord.record_id == Prescription.record_id)
        .filter(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.created_at.desc())
        .limit(20)
        .all()
    )

    frequent_meds = {}
    for p, _ in prescriptions:
        name = p.medicine_name.lower() if p.medicine_name else ""
        if name:
            frequent_meds[name] = frequent_meds.get(name, 0) + 1
    top_meds = sorted(frequent_meds.items(), key=lambda x: x[1], reverse=True)[:5]

    abnormal_reports = (
        db.query(LabReport, AISummary)
        .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
        .filter(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .limit(10)
        .all()
    )

    abnormal_findings = []
    for report, ai in abnormal_reports:
        if ai and ai.summary:
            summary_lower = ai.summary.lower()
            if any(w in summary_lower for w in ["elevated", "abnormal", "high", "low", "infection", "positive"]):
                abnormal_findings.append(f"{report.report_type}: {ai.summary[:120]}")

    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()

    return {
        "previous_diagnoses": previous_diagnoses,
        "frequently_prescribed": [{"medicine": m, "count": c} for m, c in top_meds],
        "recent_abnormal_reports": abnormal_findings[:3],
        "chronic_conditions": patient.chronic_diseases if patient else None,
        "allergies": patient.allergies if patient else None,
        "generated_at": datetime.now().isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════
#  Dashboard
# ══════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", response_model=DoctorDashboardResponse)
def get_doctor_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    today = date.today()

    # Today's appointments
    todays_appts = (
        db.query(Appointment, Patient, User)
        .join(Patient, Patient.patient_id == Appointment.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .filter(
            Appointment.doctor_id == doctor.doctor_id,
            Appointment.appointment_date == today,
        )
        .order_by(Appointment.appointment_time.asc())
        .all()
    )

    # Patients seen today (Completed)
    seen = sum(1 for a, _, _ in todays_appts if a.status == "Completed")

    # Pending lab reports for this doctor
    pending_reports = (
        db.query(LabReport)
        .filter(LabReport.doctor_id == doctor.doctor_id)
        .filter(LabReport.status.in_(["Requested", "Collected", "Processing"]))
        .count()
    )

    # Critical alerts: appointments with status "Waiting" that have high-risk conditions
    critical = 0
    for appt, pat, _ in todays_appts:
        if pat.chronic_diseases and appt.status == "Waiting":
            critical += 1

    # Pending follow-ups: completed appointments that might need follow-up
    followups = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doctor.doctor_id,
            Appointment.status == "Completed",
            Appointment.appointment_date < today,
        )
        .count()
    )

    # Unread notifications
    unread = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    # Today's schedule
    schedule = []
    for appt, pat, u in todays_appts:
        schedule.append({
            "appointment_id": appt.appointment_id,
            "patient_id": pat.patient_id,
            "patient_name": u.full_name,
            "time": str(appt.appointment_time)[:5] if appt.appointment_time else "",
            "department": appt.department or "General Medicine",
            "status": appt.status,
            "reason": appt.reason,
        })

    return DoctorDashboardResponse(
        doctor_id=doctor.doctor_id,
        full_name=current_user.full_name,
        specialization=doctor.specialization,
        todays_appointments=len(todays_appts),
        patients_seen_today=seen,
        pending_lab_reports=pending_reports,
        critical_alerts=critical,
        pending_followups=followups,
        unread_notifications=unread,
        todays_schedule=schedule,
    )


# ══════════════════════════════════════════════════════════════════════════
#  Patients
# ══════════════════════════════════════════════════════════════════════════

@router.get("/patients")
def get_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doctor = get_doctor_for_user(db, current_user)
    today = date.today()

    rows = (
        db.query(Patient, User, Appointment)
        .join(User, User.user_id == Patient.user_id)
        .join(Appointment, Appointment.patient_id == Patient.patient_id)
        .filter(Appointment.doctor_id == doctor.doctor_id)
        .filter(Appointment.appointment_date >= today)
        .distinct(Patient.patient_id)
        .all()
    )

    # Also include any patient ever seen by this doctor
    all_patient_ids = set(
        p.patient_id for p, _, _ in rows
    )

    result = []
    for p, u, appt in rows:
        result.append({
            "patient_id": p.patient_id,
            "user_id": p.user_id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "date_of_birth": p.date_of_birth,
            "age": datetime.now().year - p.date_of_birth.year if p.date_of_birth else None,
            "appointment_time": str(appt.appointment_time)[:5] if appt.appointment_time else "",
            "appointment_date": appt.appointment_date,
            "status": appt.status,
            "allergies": p.allergies,
            "chronic_diseases": p.chronic_diseases,
        })

    # Also get patients from past who aren't in today's list
    past_patients = (
        db.query(Patient, User)
        .join(User, User.user_id == Patient.user_id)
        .join(Appointment, Appointment.patient_id == Patient.patient_id)
        .filter(Appointment.doctor_id == doctor.doctor_id)
        .filter(Patient.patient_id.notin_(all_patient_ids))
        .distinct(Patient.patient_id)
        .limit(50)
        .all()
    )

    for p, u in past_patients:
        result.append({
            "patient_id": p.patient_id,
            "user_id": p.user_id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "date_of_birth": p.date_of_birth,
            "age": datetime.now().year - p.date_of_birth.year if p.date_of_birth else None,
            "appointment_time": None,
            "appointment_date": None,
            "status": "Past Patient",
            "allergies": p.allergies,
            "chronic_diseases": p.chronic_diseases,
        })

    return result


# ══════════════════════════════════════════════════════════════════════════
#  Patient EHR
# ══════════════════════════════════════════════════════════════════════════

@router.get("/patients/{patient_id}/ehr", response_model=PatientEHRResponse)
def get_patient_ehr(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    user = db.query(User).filter(User.user_id == patient.user_id).first()

    # Previous consultations (medical records)
    consultations = (
        db.query(MedicalRecord, User)
        .outerjoin(User, User.user_id == MedicalRecord.doctor_id)
        .filter(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.created_at.desc())
        .limit(15)
        .all()
    )

    prev_consultations = [
        {
            "record_id": rec.record_id,
            "doctor_name": doc_user.full_name if doc_user else "Unknown",
            "diagnosis": rec.diagnosis,
            "symptoms": rec.symptoms,
            "doctor_notes": rec.doctor_notes,
            "created_at": rec.created_at.isoformat() if rec.created_at else None,
        }
        for rec, doc_user in consultations
    ]

    # Previous prescriptions
    prev_prescriptions = (
        db.query(Prescription, MedicalRecord, User)
        .join(MedicalRecord, MedicalRecord.record_id == Prescription.record_id)
        .outerjoin(User, User.user_id == MedicalRecord.doctor_id)
        .filter(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.created_at.desc())
        .limit(20)
        .all()
    )

    prev_prescriptions_list = [
        {
            "prescription_id": p.prescription_id,
            "medicine_name": p.medicine_name,
            "dosage": p.dosage,
            "frequency": p.frequency,
            "duration": p.duration,
            "instructions": p.instructions,
            "doctor_name": doc_user.full_name if doc_user else "Unknown",
            "created_at": rec.created_at.isoformat() if rec.created_at else None,
        }
        for p, rec, doc_user in prev_prescriptions
    ]

    # Lab reports
    lab_reports_raw = (
        db.query(LabReport, AISummary)
        .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
        .filter(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .limit(15)
        .all()
    )

    lab_reports_list = [
        {
            "report_id": r.report_id,
            "report_type": r.report_type,
            "status": r.status,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "ai_summary": ai.summary if ai else None,
            "report_file": r.report_file,
        }
        for r, ai in lab_reports_raw
    ]

    # Timeline events (surgeries + vaccinations)
    timeline = (
        db.query(MedicalTimeline)
        .filter(MedicalTimeline.patient_id == patient_id)
        .order_by(MedicalTimeline.event_date.desc())
        .all()
    )

    surgeries = [
        {"event": t.event_name, "description": t.description, "date": t.event_date.isoformat() if t.event_date else None}
        for t in timeline if t.event_type in ("surgery", "procedure")
    ]

    vaccinations = [
        {"event": t.event_name, "description": t.description, "date": t.event_date.isoformat() if t.event_date else None}
        for t in timeline if t.event_type == "vaccination"
    ]

    allergies_list = [
        {"allergen": a.strip(), "severity": "Moderate"}
        for a in (patient.allergies or "").split(",") if a.strip()
    ]

    ai_summary = _build_ai_summary_for_patient(db, patient_id)

    return PatientEHRResponse(
        patient_id=patient.patient_id,
        user_id=patient.user_id,
        full_name=user.full_name if user else "",
        email=user.email if user else None,
        phone=user.phone if user else None,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        blood_group=patient.blood_group,
        height=patient.height,
        weight=patient.weight,
        allergies=patient.allergies,
        chronic_diseases=patient.chronic_diseases,
        emergency_contact=patient.emergency_contact,
        insurance_number=patient.insurance_number,
        previous_consultations=prev_consultations,
        previous_prescriptions=prev_prescriptions_list,
        lab_reports=lab_reports_list,
        surgeries=surgeries,
        vaccinations=vaccinations,
        allergies_list=allergies_list,
        ai_summary=ai_summary,
    )


# ══════════════════════════════════════════════════════════════════════════
#  Appointments
# ══════════════════════════════════════════════════════════════════════════

@router.get("/appointments")
def get_appointments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doctor = get_doctor_for_user(db, current_user)
    rows = (
        db.query(Appointment, Patient, User)
        .join(Patient, Patient.patient_id == Appointment.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .filter(Appointment.doctor_id == doctor.doctor_id)
        .order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())
        .all()
    )
    return [
        {
            "appointment_id": appt.appointment_id,
            "patient_id": pat.patient_id,
            "patient_name": u.full_name,
            "age": datetime.now().year - pat.date_of_birth.year if pat.date_of_birth else None,
            "gender": pat.gender,
            "appointment_date": appt.appointment_date,
            "appointment_time": str(appt.appointment_time)[:5] if appt.appointment_time else "",
            "reason": appt.reason,
            "status": appt.status,
            "department": appt.department,
        }
        for appt, pat, u in rows
    ]


@router.put("/appointments/{appointment_id}/status")
def update_appointment_status(
    appointment_id: int,
    body: AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    appt = db.query(Appointment).filter(
        Appointment.appointment_id == appointment_id,
        Appointment.doctor_id == doctor.doctor_id,
    ).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    old_status = appt.status
    appt.status = body.status

    patient = db.query(Patient).filter(Patient.patient_id == appt.patient_id).first()
    if patient:
        status_labels = {
            "Confirmed": "confirmed",
            "Accepted": "accepted",
            "In Progress": "in progress",
            "Completed": "completed",
            "Cancelled": "cancelled",
        }
        label = status_labels.get(body.status, body.status.lower())

        db.add(Notification(
            user_id=patient.user_id,
            title=f"Appointment {label.capitalize()}",
            message=f"Your appointment with Dr. {current_user.full_name} on {appt.appointment_date} at {appt.appointment_time} has been {label}.",
        ))

        db.add(MedicalTimeline(
            patient_id=patient.patient_id,
            event_type="appointment",
            event_name=f"Appointment {label}",
            description=f"Appointment with Dr. {current_user.full_name} - Status: {label}",
            event_date=date.today(),
        ))

    if body.status == "Completed":
        # Count completed appointment towards seen-today
        pass

    db.commit()
    return {"message": f"Appointment {body.status}", "old_status": old_status}


# ══════════════════════════════════════════════════════════════════════════
#  Consultation
# ══════════════════════════════════════════════════════════════════════════

@router.post("/consultation", response_model=ConsultationResponse, status_code=status.HTTP_201_CREATED)
def create_consultation(
    data: ConsultationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Create medical record
    record = MedicalRecord(
        patient_id=data.patient_id,
        doctor_id=doctor.doctor_id,
        appointment_id=data.appointment_id,
        symptoms=data.symptoms,
        diagnosis=data.diagnosis,
        doctor_notes=data.doctor_notes,
    )
    db.add(record)
    db.flush()

    # Update appointment if provided
    if data.appointment_id:
        appt = db.query(Appointment).filter(
            Appointment.appointment_id == data.appointment_id
        ).first()
        if appt:
            appt.status = "In Progress"

    # Create lab requests if needed
    from ..models.models import Laboratory
    lab_request_ids = []
    for test_type in data.lab_requests:
        lab_report = LabReport(
            patient_id=data.patient_id,
            doctor_id=doctor.doctor_id,
            report_type=test_type,
            status="Requested",
        )
        db.add(lab_report)
        db.flush()
        lab_request_ids.append(lab_report.report_id)

    # Add timeline event
    db.add(MedicalTimeline(
        patient_id=data.patient_id,
        event_type="record",
        event_name=f"Consultation with Dr. {current_user.full_name}",
        description=data.diagnosis or "Clinical consultation",
        event_date=date.today(),
    ))

    # Notify patient
    db.add(Notification(
        user_id=patient.user_id,
        title="Consultation Recorded",
        message=f"Dr. {current_user.full_name} has recorded your consultation." + (
            f" {len(lab_request_ids)} lab test(s) requested." if lab_request_ids else ""
        ),
    ))

    if lab_request_ids:
        db.add(Notification(
            user_id=patient.user_id,
            title="Lab Tests Requested",
            message=f"Dr. {current_user.full_name} has requested {len(lab_request_ids)} lab test(s): {', '.join(data.lab_requests)}.",
        ))
        # Notify ALL lab users so any lab can see and pick up the request
        lab_users = (
            db.query(User)
            .join(Laboratory, Laboratory.user_id == User.user_id)
            .filter(User.role == "Lab")
            .all()
        )
        patient_user = db.query(User).filter(User.user_id == patient.user_id).first()
        for lab_user in lab_users:
            db.add(Notification(
                user_id=lab_user.user_id,
                title="New Lab Test Requested",
                message=(
                    f"Dr. {current_user.full_name} has requested {len(data.lab_requests)} test(s) "
                    f"for patient {patient_user.full_name if patient_user else 'Unknown'}: "
                    f"{', '.join(data.lab_requests)}."
                ),
            ))

    db.commit()
    db.refresh(record)

    return ConsultationResponse(
        record_id=record.record_id,
        patient_id=record.patient_id,
        appointment_id=record.appointment_id,
        diagnosis=record.diagnosis,
        symptoms=record.symptoms,
        doctor_notes=record.doctor_notes,
        created_at=record.created_at,
        lab_requests_created=lab_request_ids,
    )


# ══════════════════════════════════════════════════════════════════════════
#  Medical Records (Legacy)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/records", response_model=MedicalRecordResponse, status_code=status.HTTP_201_CREATED)
def create_medical_record(
    data: MedicalRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    record = MedicalRecord(
        patient_id=data.patient_id,
        doctor_id=doctor.doctor_id,
        appointment_id=data.appointment_id,
        diagnosis=data.diagnosis,
        symptoms=data.symptoms,
        doctor_notes=data.doctor_notes,
    )
    db.add(record)
    db.flush()

    db.add(MedicalTimeline(
        patient_id=data.patient_id,
        event_type="record",
        event_name=f"Medical Record by Dr. {current_user.full_name}",
        description=data.diagnosis or "Clinical record added",
        event_date=date.today(),
    ))
    db.add(Notification(
        user_id=patient.user_id,
        title="New Medical Record",
        message=f"Dr. {current_user.full_name} has added a new medical record for you.",
    ))
    db.commit()
    db.refresh(record)
    return record


# ══════════════════════════════════════════════════════════════════════════
#  Drug Interaction Check
# ══════════════════════════════════════════════════════════════════════════

@router.post("/drug-interaction-check", response_model=list[DrugInteractionCheckResponse])
def check_drug_interactions(
    data: DrugInteractionCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    medicines = [m.strip().lower() for m in data.medicines if m.strip()]
    if len(medicines) < 2:
        raise HTTPException(status_code=400, detail="At least 2 medicines required for interaction check")

    results = []
    return [DrugInteractionCheckResponse(**prediction) for prediction in predict_drug_interactions(medicines)]


# ══════════════════════════════════════════════════════════════════════════
#  Prescriptions
# ══════════════════════════════════════════════════════════════════════════

@router.post("/prescriptions", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_prescription(
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    record = db.query(MedicalRecord).filter(
        MedicalRecord.record_id == data.record_id,
        MedicalRecord.doctor_id == doctor.doctor_id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    prescription = Prescription(
        record_id=data.record_id,
        medicine_name=data.medicine_name,
        dosage=data.dosage,
        frequency=data.frequency,
        duration=data.duration,
        instructions=data.instructions,
    )
    db.add(prescription)
    db.flush()

    patient = db.query(Patient).filter(Patient.patient_id == record.patient_id).first()
    if patient:
        db.add(Notification(
            user_id=patient.user_id,
            title="New Prescription",
            message=f"Dr. {current_user.full_name} has prescribed {data.medicine_name}. {data.dosage or ''} {data.frequency or ''}.",
        ))

        db.add(MedicalTimeline(
            patient_id=patient.patient_id,
            event_type="prescription",
            event_name=f"Prescribed {data.medicine_name}",
            description=f"Dosage: {data.dosage}, Frequency: {data.frequency}, Duration: {data.duration}",
            event_date=date.today(),
        ))

    db.commit()
    db.refresh(prescription)

    return PrescriptionResponse(
        prescription_id=prescription.prescription_id,
        record_id=prescription.record_id,
        medicine_name=prescription.medicine_name,
        dosage=prescription.dosage,
        frequency=prescription.frequency,
        duration=prescription.duration,
        instructions=prescription.instructions,
        diagnosis=record.diagnosis,
        doctor_name=current_user.full_name,
        created_at=record.created_at,
    )


@router.get("/prescriptions")
def get_prescriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doctor = get_doctor_for_user(db, current_user)
    rows = (
        db.query(Prescription, MedicalRecord, Patient, User)
        .join(MedicalRecord, MedicalRecord.record_id == Prescription.record_id)
        .join(Patient, Patient.patient_id == MedicalRecord.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .filter(MedicalRecord.doctor_id == doctor.doctor_id)
        .order_by(MedicalRecord.created_at.desc())
        .all()
    )
    return [
        {
            "prescription_id": p.prescription_id,
            "record_id": p.record_id,
            "medicine_name": p.medicine_name,
            "dosage": p.dosage,
            "frequency": p.frequency,
            "duration": p.duration,
            "instructions": p.instructions,
            "diagnosis": rec.diagnosis,
            "patient_name": u.full_name,
            "patient_id": pat.patient_id,
            "created_at": rec.created_at.isoformat() if rec.created_at else None,
        }
        for p, rec, pat, u in rows
    ]


# ══════════════════════════════════════════════════════════════════════════
#  Lab Reports (Doctor view)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/reports")
def get_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ..models.models import ConsentSharing
    doctor = get_doctor_for_user(db, current_user)

    # Reports directly assigned to this doctor
    direct_rows = (
        db.query(LabReport, Patient, User, AISummary)
        .join(Patient, Patient.patient_id == LabReport.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
        .filter(LabReport.doctor_id == doctor.doctor_id)
        .order_by(LabReport.uploaded_at.desc())
        .all()
    )

    # Reports shared with this doctor via consent_sharing
    shared_report_ids = (
        db.query(ConsentSharing.lab_report_id)
        .filter(
            ConsentSharing.shared_with == current_user.user_id,
            ConsentSharing.status == "Active",
            ConsentSharing.lab_report_id.isnot(None),
        )
        .all()
    )
    shared_ids = {r[0] for r in shared_report_ids}

    # Already included direct report IDs
    direct_ids = {r[0].report_id for r in direct_rows}

    # Fetch shared reports not already in direct list
    shared_rows = []
    if shared_ids - direct_ids:
        shared_rows = (
            db.query(LabReport, Patient, User, AISummary)
            .join(Patient, Patient.patient_id == LabReport.patient_id)
            .join(User, User.user_id == Patient.user_id)
            .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
            .filter(LabReport.report_id.in_(shared_ids - direct_ids))
            .order_by(LabReport.uploaded_at.desc())
            .all()
        )

    all_rows = direct_rows + shared_rows

    return [
        {
            "report_id": r.report_id,
            "patient_name": u.full_name,
            "patient_id": p.patient_id,
            "report_type": r.report_type,
            "report_file": r.report_file,
            "ocr_text": r.ocr_text,
            "status": r.status,
            "doctor_notes": r.doctor_notes,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "ai_summary": ai.summary if ai else None,
            "shared": r.report_id in shared_ids and r.report_id not in direct_ids,
        }
        for r, p, u, ai in all_rows
    ]


@router.put("/reports/{report_id}/review")
def review_report(
    report_id: int,
    data: ReportReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.models import ConsentSharing
    doctor = get_doctor_for_user(db, current_user)

    # Allow review if directly assigned OR shared via consent
    report = db.query(LabReport).filter(LabReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    is_direct = report.doctor_id == doctor.doctor_id
    is_shared = db.query(ConsentSharing).filter(
        ConsentSharing.shared_with == current_user.user_id,
        ConsentSharing.lab_report_id == report_id,
        ConsentSharing.status == "Active",
    ).first() is not None

    if not is_direct and not is_shared:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.status:
        report.status = data.status
    if data.doctor_notes:
        report.doctor_notes = data.doctor_notes

    if data.action == "approve":
        report.status = "Reviewed"
    elif data.action == "retest":
        report.status = "Requested"

    # Generate AI summary if not exists
    existing_summary = db.query(AISummary).filter(AISummary.report_id == report_id).first()
    if not existing_summary and report.status in ("Completed", "Reviewed"):
        # Synthetic AI summary generation based on report type
        sample_summaries = {
            "CBC": "Hemoglobin: Normal (14.2 g/dL)\nWBC: Elevated (12,500/µL)\nPlatelets: Normal (250,000/µL)\nPossible viral infection indicated by elevated WBC count.",
            "Blood Sugar": "Fasting Glucose: 105 mg/dL (Borderline)\nHbA1c: 5.8%\nMildly elevated - pre-diabetic range. Recommend lifestyle modifications.",
            "Urine": "Color: Pale yellow\npH: 6.0\nProtein: Negative\nGlucose: Negative\nAll parameters within normal limits.",
            "ECG": "Heart Rate: 72 bpm\nRhythm: Normal Sinus\nPR Interval: 160ms\nQRS Duration: 90ms\nNormal sinus rhythm. No ischemic changes detected.",
            "MRI": "Findings: No acute abnormalities identified.\nReviewed structures appear normal.\nNo mass effect or midline shift.",
            "X-Ray": "Findings: No acute abnormalities identified in the reviewed region.\nAlignment and bony structures appear within normal limits.",
        }
        summary_text = sample_summaries.get(report.report_type, f"{report.report_type} report reviewed. Results appear within normal range. No critical abnormalities detected.")
        db.add(AISummary(report_id=report_id, summary=summary_text, report_type=report.report_type))

    # Notify patient
    patient = db.query(Patient).filter(Patient.patient_id == report.patient_id).first()
    if patient:
        db.add(Notification(
            user_id=patient.user_id,
            title="Lab Report Reviewed",
            message=f"Dr. {current_user.full_name} has reviewed your {report.report_type} report.",
        ))

    db.commit()
    return {"message": "Report reviewed", "report_id": report_id, "status": report.status}


# ══════════════════════════════════════════════════════════════════════════
#  Notifications (Doctor-specific)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.user_id)
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )


@router.put("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = db.query(Notification).filter(
        Notification.notification_id == notification_id,
        Notification.user_id == current_user.user_id,
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Marked as read"}


@router.put("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.user_id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


# ══════════════════════════════════════════════════════════════════════════
#  Profile
# ══════════════════════════════════════════════════════════════════════════

@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doctor = get_doctor_for_user(db, current_user)
    return {
        "user_id": current_user.user_id,
        "doctor_id": doctor.doctor_id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "specialization": doctor.specialization,
        "qualification": doctor.qualification,
        "experience": doctor.experience,
        "license_number": doctor.license_number,
        "hospital_name": doctor.hospital_name,
    }


@router.put("/profile")
def update_profile(
    data: DoctorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doctor = get_doctor_for_user(db, current_user)
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        current_user.phone = data.phone
    for field in ["specialization", "qualification", "experience", "hospital_name"]:
        val = getattr(data, field)
        if val is not None:
            setattr(doctor, field, val)
    db.commit()
    return {"message": "Profile updated"}
