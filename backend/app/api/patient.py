import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
import re
from typing import Optional

import ollama
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..models.models import (
    AISummary, AIChat, Appointment, ConsentSharing, DiseasePrediction,
    Doctor, DrugInteraction, LabReport, Laboratory, MedicalRecord, MedicalTimeline,
    Notification, Patient, Prescription, User,
)
from ..schemas.schemas import (
    AIChatRequest, AIChatResponse,
    AppointmentCreate, AppointmentDetailResponse,
    ConsentSharingCreate, ConsentSharingResponse,
    DiseasePredictionCreate, DiseasePredictionResponse,
    DrugInteractionCreate, DrugInteractionResponse,
    MedicalRecordListItem, NotificationResponse,
    PatientDashboardResponse, PatientRecordCreate, PatientUpdate,
    PrescriptionResponse, TimelineEventResponse,
)
from ..services.llm_service import generate_chat_reply, extract_document_structure, generate_summary, _generate_summary_from_structure, is_ollama_available, _is_refusal, _client, LLM_MODEL, GENERATE_OPTIONS, _status_from_reference, _parse_reference_range
from ..services.rag_service import rag_service, is_rag_available, init_medical_knowledge_base
from ..services.vision_service import analyze_image as vision_analyze, analyze_image_with_type, is_vision_available
from ..services.report_parsing import classify_report_type, build_summary_text as _build_summary_text
from ..services.text_extraction import extract_text
from ..services.background_processing import _process_report_background
from ..services.report_validation import validate_extracted_data, _is_unit_consistent
from .deps import get_current_user
from ..core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patient", tags=["patient"])

RECOMMENDATIONS = {
    "LOW":    "Stay hydrated and rest well. Monitor symptoms for 48 hours. Take OTC medication if needed.",
    "MEDIUM": "Schedule a doctor appointment soon. Avoid strenuous activity. Monitor temperature regularly.",
    "HIGH":   "Seek immediate medical attention. Go to the nearest hospital. Do not self-medicate.",
}

DISEASE_DB = {
    "Fever,Cough,Fatigue":            [{"name": "Influenza", "prob": 82}, {"name": "COVID-19", "prob": 15}, {"name": "Typhoid", "prob": 3}],
    "Fever,Headache,Body Ache":       [{"name": "Dengue", "prob": 70}, {"name": "Malaria", "prob": 20}, {"name": "Typhoid", "prob": 10}],
    "Chest Pain,Shortness of Breath": [{"name": "Angina", "prob": 55}, {"name": "Anxiety", "prob": 30}, {"name": "Pneumonia", "prob": 15}],
    "default":                        [{"name": "Common Cold", "prob": 60}, {"name": "Viral Infection", "prob": 30}, {"name": "Allergies", "prob": 10}],
}

INTERACTION_DB = [
    {"drugs": ["warfarin", "ibuprofen"],      "level": "High Risk",  "desc": "Ibuprofen increases the anticoagulant effect of Warfarin, significantly raising the risk of bleeding.", "alt": "Use Paracetamol instead of Ibuprofen"},
    {"drugs": ["warfarin", "aspirin"],         "level": "High Risk",  "desc": "Aspirin combined with Warfarin greatly increases bleeding risk.", "alt": "Consult doctor before combining"},
    {"drugs": ["metformin", "alcohol"],        "level": "Moderate",   "desc": "Alcohol can increase the risk of lactic acidosis when taken with Metformin.", "alt": "Avoid alcohol while on Metformin"},
    {"drugs": ["simvastatin", "amiodarone"],   "level": "Moderate",   "desc": "Amiodarone can increase Simvastatin levels, raising the risk of muscle damage.", "alt": "Consider dose reduction or alternative statin"},
    {"drugs": ["paracetamol", "amoxicillin"],  "level": "Safe",       "desc": "No significant interaction known between Paracetamol and Amoxicillin.", "alt": None},
    {"drugs": ["omeprazole", "clopidogrel"],   "level": "Moderate",   "desc": "Omeprazole may reduce the effectiveness of Clopidogrel.", "alt": "Consider Pantoprazole as an alternative"},
    {"drugs": ["ssri", "tramadol"],            "level": "High Risk",  "desc": "Combining SSRIs with Tramadol can cause serotonin syndrome.", "alt": "Use alternative pain management"},
]

COMMON_DRUGS = [
    "Warfarin", "Ibuprofen", "Aspirin", "Metformin", "Alcohol",
    "Simvastatin", "Amiodarone", "Paracetamol", "Amoxicillin",
    "Omeprazole", "Clopidogrel", "SSRIs", "Tramadol",
    "Atenolol", "Atorvastatin", "Cefalexin", "Cetirizine",
    "Hydrochlorothiazide", "Insulin", "Levothyroxine", "Pantoprazole",
]


def get_patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.user_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=PatientDashboardResponse)
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)

    latest_report = (
        db.query(LabReport, Doctor, User)
        .outerjoin(Doctor, Doctor.doctor_id == LabReport.doctor_id)
        .outerjoin(User, User.user_id == Doctor.user_id)
        .filter(LabReport.patient_id == patient.patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .first()
    )
    upcoming = (
        db.query(Appointment, Doctor, User)
        .join(Doctor, Doctor.doctor_id == Appointment.doctor_id)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Appointment.patient_id == patient.patient_id)
        .filter(Appointment.appointment_date >= date.today())
        .filter(Appointment.status.notin_(["Cancelled"]))
        .order_by(Appointment.appointment_date.asc(), Appointment.appointment_time.asc())
        .first()
    )

    return PatientDashboardResponse(
        patient_id=patient.patient_id,
        full_name=current_user.full_name,
        blood_group=patient.blood_group,
        appointments_count=db.query(Appointment).filter(Appointment.patient_id == patient.patient_id).count(),
        medical_reports_count=db.query(LabReport).filter(LabReport.patient_id == patient.patient_id).count(),
        prescriptions_count=(
            db.query(Prescription)
            .join(MedicalRecord, MedicalRecord.record_id == Prescription.record_id)
            .filter(MedicalRecord.patient_id == patient.patient_id)
            .count()
        ),
        notifications_count=db.query(Notification).filter(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        ).count(),
        latest_report=(
            {
                "report_id": latest_report[0].report_id,
                "report_type": latest_report[0].report_type,
                "uploaded_at": latest_report[0].uploaded_at,
                "doctor_name": latest_report[2].full_name if latest_report[2] else None,
                "hospital_name": latest_report[1].hospital_name if latest_report[1] else None,
            }
            if latest_report else None
        ),
        upcoming_appointment=(
            {
                "appointment_id": upcoming[0].appointment_id,
                "appointment_date": upcoming[0].appointment_date,
                "appointment_time": upcoming[0].appointment_time,
                "doctor_name": upcoming[2].full_name,
                "specialization": upcoming[1].specialization,
            }
            if upcoming else None
        ),
    )


# ── Records ───────────────────────────────────────────────────────────────────

@router.get("/records", response_model=list[MedicalRecordListItem])
def get_records(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    rows = (
        db.query(LabReport, Doctor, User, Laboratory, AISummary)
        .outerjoin(Doctor, Doctor.doctor_id == LabReport.doctor_id)
        .outerjoin(User, User.user_id == Doctor.user_id)
        .outerjoin(Laboratory, Laboratory.lab_id == LabReport.lab_id)
        .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
        .filter(LabReport.patient_id == patient.patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .all()
    )
    seen = set()
    unique_rows = []
    for row in rows:
        report = row[0]
        if report.report_id not in seen:
            seen.add(report.report_id)
            unique_rows.append(row)
    return [
        MedicalRecordListItem(
            report_id=r.report_id,
            uploaded_at=r.uploaded_at,
            hospital=d.hospital_name if d else lab.lab_name if lab else None,
            doctor=u.full_name if u else None,
            report_type=r.report_type,
            report_file=r.report_file,
            ai_summary=ai.summary if ai else None,
        )
        for r, d, u, lab, ai in rows
    ]


@router.post("/records", status_code=status.HTTP_201_CREATED)
async def upload_patient_record(
    report_type: str = Form(...),
    report_file: UploadFile | None = File(None),
    ocr_text: Optional[str] = Form(None),
    ai_summary: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)

    report_file_path: Optional[str] = None

    if report_file is not None:
        if report_file.content_type not in {"application/pdf", "image/jpeg", "image/png"}:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "patient_records"
        upload_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(report_file.filename).name
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", safe_name)
        target_path = upload_dir / safe_name
        counter = 1
        while target_path.exists():
            target_path = upload_dir / f"{target_path.stem}_{counter}{target_path.suffix}"
            counter += 1

        contents = await report_file.read()
        target_path.write_bytes(contents)
        report_file_path = f"uploads/patient_records/{target_path.name}"
        logger.info("[UPLOAD] Saved file: %s (%d bytes)", report_file_path, len(contents))

    report = LabReport(
        patient_id=patient.patient_id,
        report_type=report_type,
        report_file=report_file_path,
        ocr_text=ocr_text if (ocr_text and not ocr_text.startswith("[")) else None,
        status="Requested",
        processing_status="EXTRACTING",
    )
    db.add(report)
    db.flush()

    if ai_summary:
        db.add(AISummary(
            report_id=report.report_id,
            summary=ai_summary,
            report_type=report_type,
        ))

    db.commit()
    db.refresh(report)

    if report_file_path:
        try:
            from app.services.background_processing import process_report
            process_report(report.report_id, db)
            db.refresh(report)
        except Exception as e:
            logger.error("[UPLOAD] Background processing failed: %s", e)
            report.processing_status = "FAILED"
            report.processing_error = str(e)
            db.commit()

    return {
        "report_id": report.report_id,
        "message": "Record uploaded successfully.",
        "status": report.processing_status,
    }


@router.get("/records/{report_id}/processing-status")
def get_processing_status(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "report_id": report.report_id,
        "processing_status": report.processing_status,
        "processing_error": report.processing_error,
        "has_summary": db.query(AISummary).filter(AISummary.report_id == report_id).first() is not None,
    }


@router.post("/records/{report_id}/reanalyze")
def reanalyze_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if not report.report_file:
        raise HTTPException(status_code=400, detail="No file attached to this report")

    file_path = Path(__file__).resolve().parents[2] / report.report_file
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    extracted_text = extract_text(str(file_path))
    if not extracted_text and is_vision_available():
        vision_result = analyze_image_with_type(str(file_path))
        if vision_result:
            extracted_text = vision_result.get("analysis", "")

    if not extracted_text:
        raise HTTPException(status_code=422, detail="Could not extract text from this file. The file may be corrupted or in an unsupported format.")

    logger.info("[REANALYZE] Extracted %d chars from report %d", len(extracted_text), report_id)
    report.ocr_text = extracted_text
    report.processing_status = "STRUCTURING"
    db.commit()

    structured_data = extract_document_structure(extracted_text, report.report_type or "Medical Report")
    verified_data = None
    summary_text = None

    if structured_data:
        verified_data = validate_extracted_data(structured_data, extracted_text)

    if verified_data and (verified_data.get("parameters") or verified_data.get("findings")):
        summary_text = _generate_summary_from_structure(
            doc_type=verified_data.get("document_type", "laboratory_report"),
            title=verified_data.get("title", report.report_type or "Medical Report"),
            sections=verified_data.get("sections", []),
            findings=verified_data.get("findings", []),
            measurements=verified_data.get("parameters", []),
            source_text=extracted_text,
        )

    if not summary_text:
        summary_text = _build_summary_text(report.report_type or "Report", [], extracted_text, report.uploaded_at)

    report.processing_status = "COMPLETED"
    report.processing_error = None
    db.commit()

    existing_summary = db.query(AISummary).filter(AISummary.report_id == report.report_id).first()
    if existing_summary:
        existing_summary.summary = summary_text
        existing_summary.report_type = (verified_data.get("document_type") if verified_data else None) or report.report_type
        existing_summary.structured_data = json.dumps(verified_data or structured_data) if (verified_data or structured_data) else None
        existing_summary.verified_data = json.dumps(verified_data) if verified_data else None
        existing_summary.processing_version = "2.0"
    else:
        db.add(AISummary(
            report_id=report.report_id,
            summary=summary_text,
            report_type=(verified_data.get("document_type") if verified_data else None) or report.report_type,
            structured_data=json.dumps(verified_data or structured_data) if (verified_data or structured_data) else None,
            verified_data=json.dumps(verified_data) if verified_data else None,
            processing_version="2.0",
        ))
    db.commit()

    if extracted_text and is_rag_available():
        try:
            rag_service.add_document(
                text=extracted_text,
                source=f"patient_report_{report.report_id}",
                metadata={"type": "patient_report", "patient_id": patient.patient_id, "report_id": report.report_id, "report_type": report.report_type},
            )
        except Exception as e:
            logger.error("[RAG] Failed to re-ingest report: %s", e)

    return {
        "report_id": report.report_id,
        "ocr_text": report.ocr_text,
        "summary": summary_text,
        "structured_data": verified_data or structured_data,
        "message": "Report re-analyzed successfully",
    }


@router.post("/records/{report_id}/analyze-image")
def analyze_report_image(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if not report.report_file:
        raise HTTPException(status_code=400, detail="No file attached to this report")

    file_path = Path(__file__).resolve().parents[2] / report.report_file
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    vision_result = analyze_image_with_type(str(file_path))
    if not vision_result:
        raise HTTPException(status_code=503, detail="Vision model not available. Please ensure llava is installed via Ollama.")

    vision_notes = vision_result.get("analysis")
    detected_type = vision_result.get("detected_type")
    
    if detected_type and detected_type not in ("Not a standard medical image", ""):
        report.report_type = detected_type.split("\n")[0].strip()
    
    if vision_notes:
        if report.ocr_text:
            report.ocr_text = f"{report.ocr_text}\n\n[Vision Analysis]\n{vision_notes}"
        else:
            report.ocr_text = f"[Vision Analysis]\n{vision_notes}"

    db.commit()
    db.refresh(report)

    if report.ocr_text and is_rag_available():
        try:
            rag_service.add_document(
                text=report.ocr_text,
                source=f"patient_report_{report.report_id}",
                metadata={"type": "patient_report", "patient_id": patient.patient_id, "report_id": report.report_id, "report_type": report.report_type},
            )
        except Exception as e:
            print(f"[RAG] Failed to re-ingest report after vision analysis: {e}")

    return {"report_id": report.report_id, "report_type": report.report_type, "ocr_text": report.ocr_text, "vision_analysis": vision_result}


@router.post("/rag/ingest-reports")
def ingest_reports_for_rag(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    reports = db.query(LabReport).filter(LabReport.patient_id == patient.patient_id).all()
    count = 0
    for report in reports:
        if report.ocr_text and is_rag_available():
            try:
                rag_service.add_document(
                    text=report.ocr_text,
                    source=f"patient_report_{report.report_id}",
                    metadata={"type": "patient_report", "patient_id": patient.patient_id, "report_id": report.report_id, "report_type": report.report_type},
                )
                count += 1
            except Exception:
                pass
    return {"ingested": count, "total": len(reports)}


# ── Appointments ──────────────────────────────────────────────────────────────

@router.get("/appointments", response_model=list[AppointmentDetailResponse])
def get_appointments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    rows = (
        db.query(Appointment, Doctor, User)
        .join(Doctor, Doctor.doctor_id == Appointment.doctor_id)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Appointment.patient_id == patient.patient_id)
        .order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())
        .all()
    )
    return [
        AppointmentDetailResponse(
            appointment_id=a.appointment_id,
            patient_id=a.patient_id,
            doctor_id=a.doctor_id,
            doctor_name=u.full_name,
            specialization=d.specialization,
            hospital_name=d.hospital_name,
            appointment_date=a.appointment_date,
            appointment_time=a.appointment_time,
            reason=a.reason,
            status=a.status,
        )
        for a, d, u in rows
    ]


@router.post("/appointments", response_model=AppointmentDetailResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(
    data: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    doctor_row = (
        db.query(Doctor, User)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Doctor.doctor_id == data.doctor_id)
        .first()
    )
    if not doctor_row:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor, doc_user = doctor_row

    appt = Appointment(
        patient_id=patient.patient_id,
        doctor_id=data.doctor_id,
        appointment_date=data.appointment_date,
        appointment_time=data.appointment_time,
        reason=data.reason,
        department=getattr(data, "department", None),
        visit_type=getattr(data, "visit_type", "In-Person"),
        status="Pending",
    )
    db.add(appt)
    db.flush()

    db.add(MedicalTimeline(
        patient_id=patient.patient_id,
        event_type="appointment",
        event_name=f"Appointment with {doc_user.full_name}",
        description=f"Reason: {data.reason or 'General consultation'}. Status: Pending.",
        event_date=data.appointment_date,
    ))
    db.add(Notification(
        user_id=current_user.user_id,
        title="Appointment Booked",
        message=f"Your appointment with {doc_user.full_name} on {data.appointment_date} is pending confirmation.",
    ))
    # Notify doctor
    db.add(Notification(
        user_id=doc_user.user_id,
        title="New Appointment Request",
        message=f"{current_user.full_name} has booked an appointment on {data.appointment_date} at {data.appointment_time}. Reason: {data.reason or 'Not specified'}.",
    ))

    db.commit()
    db.refresh(appt)

    return AppointmentDetailResponse(
        appointment_id=appt.appointment_id,
        patient_id=appt.patient_id,
        doctor_id=appt.doctor_id,
        doctor_name=doc_user.full_name,
        specialization=doctor.specialization,
        hospital_name=doctor.hospital_name,
        appointment_date=appt.appointment_date,
        appointment_time=appt.appointment_time,
        reason=appt.reason,
        status=appt.status,
    )


@router.put("/appointments/{appointment_id}/cancel")
def cancel_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    appt = db.query(Appointment).filter(
        Appointment.appointment_id == appointment_id,
        Appointment.patient_id == patient.patient_id,
    ).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status in ("Cancelled", "Completed"):
        raise HTTPException(status_code=400, detail=f"Appointment already {appt.status.lower()}")

    appt.status = "Cancelled"

    doctor_row = (
        db.query(Doctor, User)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Doctor.doctor_id == appt.doctor_id)
        .first()
    )
    if doctor_row:
        _, doc_user = doctor_row
        db.add(Notification(
            user_id=doc_user.user_id,
            title="Appointment Cancelled",
            message=f"{current_user.full_name} has cancelled their appointment on {appt.appointment_date} at {appt.appointment_time}.",
        ))

    db.commit()
    return {"message": "Appointment cancelled successfully"}


@router.delete("/appointments/{appointment_id}")
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    appt = db.query(Appointment).filter(
        Appointment.appointment_id == appointment_id,
        Appointment.patient_id == patient.patient_id,
    ).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status == "Completed":
        raise HTTPException(status_code=400, detail="Completed appointments cannot be deleted")

    doctor_row = (
        db.query(Doctor, User)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Doctor.doctor_id == appt.doctor_id)
        .first()
    )
    if doctor_row:
        _, doc_user = doctor_row
        db.add(Notification(
            user_id=doc_user.user_id,
            title="Appointment Deleted",
            message=f"{current_user.full_name} has deleted their appointment on {appt.appointment_date} at {appt.appointment_time}.",
        ))

    db.delete(appt)
    db.commit()
    return {"message": "Appointment deleted successfully"}


# ── Prescriptions ─────────────────────────────────────────────────────────────

@router.get("/prescriptions", response_model=list[PrescriptionResponse])
def get_prescriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    rows = (
        db.query(Prescription, MedicalRecord, Doctor, User)
        .join(MedicalRecord, MedicalRecord.record_id == Prescription.record_id)
        .outerjoin(Doctor, Doctor.doctor_id == MedicalRecord.doctor_id)
        .outerjoin(User, User.user_id == Doctor.user_id)
        .filter(MedicalRecord.patient_id == patient.patient_id)
        .order_by(MedicalRecord.created_at.desc())
        .all()
    )
    return [
        PrescriptionResponse(
            prescription_id=p.prescription_id,
            record_id=p.record_id,
            medicine_name=p.medicine_name,
            dosage=p.dosage,
            frequency=p.frequency,
            duration=p.duration,
            instructions=p.instructions,
            diagnosis=rec.diagnosis,
            doctor_name=u.full_name if u else None,
            created_at=rec.created_at,
        )
        for p, rec, _, u in rows
    ]


# ── Delete Record ────────────────────────────────────────────────────────────

@router.delete("/records/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.query(AISummary).filter(AISummary.report_id == report_id).delete()
    db.delete(report)
    db.commit()


# ── AI Summary ────────────────────────────────────────────────────────────────

def _build_trends(current_report: LabReport, findings: list[dict], db: Session) -> list[dict]:
    previous_reports = (
        db.query(LabReport)
        .filter(
            LabReport.patient_id == current_report.patient_id,
            LabReport.report_type == current_report.report_type,
            LabReport.report_id != current_report.report_id,
        )
        .order_by(LabReport.uploaded_at.desc())
        .all()
    )

    def _normalize_name(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", (name or "").lower())

    current_by_name = {}
    for finding in findings:
        name = finding.get("parameter") or finding.get("name") or ""
        current_by_name[_normalize_name(name)] = finding

    trends = []
    matched_previous = set()

    for previous_report in previous_reports:
        ai_row = (
            db.query(AISummary)
            .filter(AISummary.report_id == previous_report.report_id)
            .order_by(AISummary.generated_at.desc())
            .first()
        )
        prev_findings = []
        if ai_row and ai_row.structured_data:
            try:
                structured = json.loads(ai_row.structured_data)
                prev_findings = structured.get("parameters", [])
            except (json.JSONDecodeError, TypeError):
                prev_findings = []

        for prev in prev_findings:
            prev_name = prev.get("parameter") or prev.get("name") or ""
            norm = _normalize_name(prev_name)
            if norm in current_by_name and norm not in matched_previous:
                matched_previous.add(norm)
                curr = current_by_name[norm]
                curr_val = curr.get("value")
                prev_val = prev.get("value")
                try:
                    curr_num = float(curr_val)
                    prev_num = float(prev_val)
                    delta = round(curr_num - prev_num, 2)
                    direction = "Unchanged" if delta == 0 else "Up" if delta > 0 else "Down"
                except (TypeError, ValueError):
                    delta = 0
                    direction = "Unchanged"
                trends.append({
                    "parameter": curr.get("parameter") or curr.get("name", prev_name),
                    "previous_value": prev_val,
                    "current_value": curr_val,
                    "unit": curr.get("unit") or prev.get("unit", ""),
                    "delta": delta,
                    "direction": direction,
                    "previous_status": prev.get("status", "Unknown"),
                    "current_status": curr.get("status", "Unknown"),
                    "previous_date": previous_report.uploaded_at,
                })

    for name, finding in current_by_name.items():
        if name not in matched_previous:
            trends.append({
                "parameter": finding.get("parameter") or finding.get("name", ""),
                "previous_value": None,
                "current_value": finding.get("value"),
                "unit": finding.get("unit", ""),
                "delta": None,
                "direction": "New",
                "previous_status": None,
                "current_status": finding.get("status", "Unknown"),
                "previous_date": None,
            })

    return trends


@router.get("/ai-summary/{report_id}")
def get_ai_summary(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    summary_row = (
        db.query(AISummary)
        .filter(AISummary.report_id == report_id)
        .order_by(AISummary.generated_at.desc())
        .first()
    )

    structured_data = None
    verified_data = None
    findings = []
    summary_text = summary_row.summary if summary_row else None

    if summary_row and (summary_row.verified_data or summary_row.structured_data):
        try:
            raw_data = summary_row.verified_data or summary_row.structured_data
            parsed = json.loads(raw_data)
            verified_data = parsed
            structured_data = parsed
            findings = parsed.get("parameters", [])
        except (json.JSONDecodeError, TypeError):
            structured_data = None
            verified_data = None
            findings = []

    # If no OCR text in report record, extract it now from file
    if not report.ocr_text and report.report_file:
        file_path = Path(__file__).resolve().parents[2] / report.report_file
        if file_path.exists():
            extracted = extract_text(str(file_path))
            if extracted:
                report.ocr_text = extracted
                db.commit()

    # If missing summary or structured data, extract and summarize now
    needs_processing = not summary_text or not findings
    if needs_processing and report.ocr_text:
        structured_data = extract_document_structure(report.ocr_text, report.report_type or "Medical Report")
        if structured_data:
            verified_data = validate_extracted_data(structured_data, report.ocr_text)
            findings = verified_data.get("parameters", [])
            summary_text = _generate_summary_from_structure(
                doc_type=verified_data.get("document_type", "laboratory_report"),
                title=verified_data.get("title", report.report_type or "Medical Report"),
                sections=verified_data.get("sections", []),
                findings=verified_data.get("findings", []),
                measurements=verified_data.get("parameters", []),
                source_text=report.ocr_text,
            )

            if summary_row:
                summary_row.summary = summary_text
                summary_row.report_type = verified_data.get("document_type", report.report_type)
                summary_row.structured_data = json.dumps(verified_data)
                summary_row.verified_data = json.dumps(verified_data)
                summary_row.processing_version = "2.0"
            else:
                summary_row = AISummary(
                    report_id=report.report_id,
                    summary=summary_text or "",
                    report_type=verified_data.get("document_type", report.report_type),
                    structured_data=json.dumps(verified_data),
                    verified_data=json.dumps(verified_data),
                    processing_version="2.0",
                )
                db.add(summary_row)
            report.processing_status = "COMPLETED"
            db.commit()

    if not summary_text:
        summary_text = _build_summary_text(report.report_type or "Report", findings, report.ocr_text or "", report.uploaded_at)

    trends = _build_trends(report, findings, db)

    api_findings = []
    for param in findings:
        api_findings.append({
            "parameter": param.get("name", ""),
            "value": param.get("value", ""),
            "unit": param.get("unit", ""),
            "reference": param.get("reference_raw") or param.get("reference_range", ""),
            "reference_low": param.get("reference_low"),
            "reference_high": param.get("reference_high"),
            "status": param.get("status", "NORMAL"),
            "confidence": param.get("confidence", "HIGH"),
            "type": param.get("type", "numeric"),
            "source_text": param.get("source_text", ""),
        })

    imaging_findings = []
    active_data = verified_data or structured_data
    if active_data:
        raw_findings = active_data.get("findings", [])
        if isinstance(raw_findings, list):
            imaging_findings = [str(f) for f in raw_findings if f and str(f).strip()]
        elif isinstance(raw_findings, str) and raw_findings.strip():
            imaging_findings = [raw_findings.strip()]

    return {
        "report_id": report.report_id,
        "report_type": report.report_type,
        "ocr_text": report.ocr_text,
        "summary": summary_text,
        "findings": api_findings,
        "imaging_findings": imaging_findings,
        "trends": trends,
        "structured_data": active_data,
        "generated_at": summary_row.generated_at if summary_row else None,
    }

    return {
        "report_id": report.report_id,
        "report_type": report.report_type,
        "ocr_text": report.ocr_text,
        "summary": summary_text,
        "findings": api_findings,
        "imaging_findings": imaging_findings,
        "trends": trends,
        "structured_data": verified_data or structured_data,
        "generated_at": summary_row.generated_at if summary_row else None,
    }


@router.post("/ai-summary/chat", response_model=AIChatResponse)
def ai_summary_chat(
    data: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    report = db.query(LabReport).filter(
        LabReport.report_id == data.report_id,
        LabReport.patient_id == patient.patient_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    ocr_text = report.ocr_text or ""
    structured_data = None
    existing_summary = db.query(AISummary).filter(AISummary.report_id == report.report_id).first()
    if existing_summary and existing_summary.structured_data:
        try:
            structured_data = json.loads(existing_summary.structured_data)
        except (json.JSONDecodeError, TypeError):
            structured_data = None

    reply = generate_chat_reply(data.question, ocr_text, report.report_type or "Medical Report", patient.patient_id, structured_data)
    logger.info("[CHAT] question=%r reply_length=%d", data.question, len(reply) if reply else 0)

    if not reply and is_rag_available():
        try:
            patient_reports = rag_service.search(
                data.question,
                top_k=3,
                where={"type": "patient_report", "patient_id": patient.patient_id}
            )
            if patient_reports:
                report_contexts = "\n\n".join([chunk.text for chunk in patient_reports])
                reply = generate_chat_reply(data.question, report_contexts, report.report_type or "Medical Report", patient.patient_id)
                logger.info("[CHAT] RAG fallback reply_length=%d", len(reply) if reply else 0)
        except Exception as e:
            logger.error("[CHAT] RAG retrieval failed: %s", e)

    if not reply:
        reply = (
            "I'm sorry, the AI assistant is currently unavailable. "
            "Please consult your doctor for medical advice."
        )

    db.add(AIChat(
        patient_id=patient.patient_id,
        question=data.question,
        response=reply,
    ))
    db.commit()

    return {"response": reply}


# ── Disease Prediction ────────────────────────────────────────────────────────

@router.post("/disease-prediction", response_model=list[DiseasePredictionResponse], status_code=status.HTTP_201_CREATED)
def create_disease_prediction(
    data: DiseasePredictionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    symptoms = data.symptoms
    key = next((k for k in DISEASE_DB if k != "default" and any(s in k for s in symptoms)), None)
    diseases = DISEASE_DB[key or "default"]
    max_prob = diseases[0]["prob"]
    risk = "HIGH" if max_prob >= 70 else "MEDIUM" if max_prob >= 40 else "LOW"
    recommendation = RECOMMENDATIONS[risk]
    symptoms_str = ", ".join(symptoms)

    saved = []
    for d in diseases:
        pred = DiseasePrediction(
            patient_id=patient.patient_id,
            predicted_disease=d["name"],
            probability=d["prob"],
            risk_level=risk,
            recommendation=recommendation,
        )
        db.add(pred)
        db.flush()
        saved.append(pred)
    db.commit()

    return [
        DiseasePredictionResponse(
            prediction_id=p.prediction_id,
            predicted_disease=p.predicted_disease,
            probability=p.probability,
            risk_level=p.risk_level,
            recommendation=p.recommendation,
            prediction_date=p.prediction_date,
            symptoms=symptoms_str,
        )
        for p in saved
    ]


@router.get("/disease-predictions", response_model=list[DiseasePredictionResponse])
def get_disease_predictions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    return [
        DiseasePredictionResponse(
            prediction_id=p.prediction_id,
            predicted_disease=p.predicted_disease,
            probability=p.probability,
            risk_level=p.risk_level,
            recommendation=p.recommendation,
            prediction_date=p.prediction_date,
        )
        for p in db.query(DiseasePrediction)
        .filter(DiseasePrediction.patient_id == patient.patient_id)
        .order_by(DiseasePrediction.prediction_date.desc())
        .limit(20)
        .all()
    ]


# ── Drug Interactions ─────────────────────────────────────────────────────────

@router.get("/drug-list", response_model=list[str])
def get_drug_list():
    interaction_drugs = sorted({d for entry in INTERACTION_DB for d in entry.get("drugs", [])})
    all_drugs = sorted(set(interaction_drugs) | set(COMMON_DRUGS))
    return all_drugs


@router.post("/drug-interaction", response_model=list[DrugInteractionResponse], status_code=status.HTTP_201_CREATED)
def check_drug_interaction(
    data: DrugInteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    filled = [m.strip() for m in data.medicines if m.strip()]
    if len(filled) < 2:
        raise HTTPException(status_code=400, detail="At least 2 medicines required")

    saved = []
    checked: set = set()
    for i in range(len(filled)):
        for j in range(i + 1, len(filled)):
            pair = tuple(sorted([filled[i].lower(), filled[j].lower()]))
            if pair in checked:
                continue
            checked.add(pair)
            match = next(
                (e for e in INTERACTION_DB if all(d in filled[i].lower() or d in filled[j].lower() for d in e["drugs"])),
                None,
            )
            description = match["desc"] if match else "No known significant interaction between these medicines."
            suggested_alternative = match.get("alt") if match else None
            level = match["level"] if match else "Safe"

            if is_rag_available():
                try:
                    rag_query = f"drug interaction between {filled[i]} and {filled[j]}"
                    rag_results = rag_service.search(rag_query, top_k=2, where={"type": "drug_db"})
                    if rag_results:
                        rag_context = "\n".join([chunk.text for chunk in rag_results])
                        if is_ollama_available():
                            prompt = (
                                "You are a medical assistant. Explain the following drug interaction in simple terms for a patient.\n"
                                "- Use the retrieved drug interaction information as the primary source of truth.\n"
                                "- State the risk level clearly.\n"
                                "- Explain what to do in plain language.\n"
                                "- Do not diagnose. Always remind the patient to consult their doctor before changing medications.\n\n"
                                f"Retrieved information:\n{rag_context}\n\n"
                                f"Drug 1: {filled[i]}\nDrug 2: {filled[j]}\n\n"
                                "Return a concise, patient-friendly explanation."
                            )
                            response = _client.generate(model=LLM_MODEL, prompt=prompt, options=GENERATE_OPTIONS)
                            llm_text = response.get("response", "").strip()
                            if llm_text:
                                description = llm_text
                except Exception as e:
                    print(f"[RAG] Drug interaction retrieval failed: {e}")

            interaction = DrugInteraction(
                patient_id=patient.patient_id,
                medicine1=filled[i],
                medicine2=filled[j],
                interaction_level=level,
                description=description,
                suggested_alternative=suggested_alternative,
            )
            db.add(interaction)
            db.flush()
            saved.append(interaction)
    db.commit()

    return [
        DrugInteractionResponse(
            interaction_id=x.interaction_id,
            medicine1=x.medicine1,
            medicine2=x.medicine2,
            interaction_level=x.interaction_level,
            description=x.description,
            suggested_alternative=x.suggested_alternative,
        )
        for x in saved
    ]


# ── Timeline ──────────────────────────────────────────────────────────────────

@router.get("/timeline", response_model=list[TimelineEventResponse])
def get_timeline(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    return (
        db.query(MedicalTimeline)
        .filter(MedicalTimeline.patient_id == patient.patient_id)
        .order_by(MedicalTimeline.event_date.desc())
        .all()
    )


# ── Consent Sharing ───────────────────────────────────────────────────────────

@router.post("/consent-sharing", response_model=list[ConsentSharingResponse], status_code=status.HTTP_201_CREATED)
def create_consent_sharing(
    data: ConsentSharingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    shared_user = db.query(User).filter(User.user_id == data.shared_with_user_id).first()
    if not shared_user:
        raise HTTPException(status_code=404, detail="User not found")

    expiry = date.today() + timedelta(days=data.expiry_days)
    saved = []
    for report_id in data.record_ids:
        c = ConsentSharing(
            patient_id=patient.patient_id,
            shared_with=data.shared_with_user_id,
            record_id=None,
            lab_report_id=report_id,
            permission=data.permission,
            expiry_date=expiry,
            status="Active",
        )
        db.add(c)
        db.flush()
        saved.append(c)

    db.add(Notification(
        user_id=data.shared_with_user_id,
        title="Medical Records Shared",
        message=f"{current_user.full_name} shared {len(data.record_ids)} record(s) with you. Expires {expiry}.",
    ))
    db.commit()

    return [
        ConsentSharingResponse(
            consent_id=c.consent_id,
            shared_with=c.shared_with,
            shared_with_name=shared_user.full_name,
            record_id=c.lab_report_id or 0,
            permission=c.permission,
            expiry_date=c.expiry_date,
            status=c.status,
        )
        for c in saved
    ]


@router.get("/consent-sharing", response_model=list[ConsentSharingResponse])
def get_consent_sharings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    today = date.today()
    rows = (
        db.query(ConsentSharing, User)
        .join(User, User.user_id == ConsentSharing.shared_with)
        .filter(ConsentSharing.patient_id == patient.patient_id)
        .order_by(ConsentSharing.expiry_date.desc())
        .all()
    )
    result = []
    for c, u in rows:
        if c.expiry_date and c.expiry_date < today and c.status == "Active":
            c.status = "Expired"
        result.append(ConsentSharingResponse(
            consent_id=c.consent_id,
            shared_with=c.shared_with,
            shared_with_name=u.full_name,
            record_id=c.lab_report_id or c.record_id or 0,
            permission=c.permission,
            expiry_date=c.expiry_date,
            status=c.status,
        ))
    db.commit()
    return result


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient = get_patient_for_user(db, current_user)
    return {
        "user_id": current_user.user_id,
        "patient_id": patient.patient_id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role,
        "date_of_birth": patient.date_of_birth,
        "gender": patient.gender,
        "blood_group": patient.blood_group,
        "height": patient.height,
        "weight": patient.weight,
        "allergies": patient.allergies,
        "chronic_diseases": patient.chronic_diseases,
        "emergency_contact": patient.emergency_contact,
        "insurance_number": patient.insurance_number,
    }


@router.put("/profile")
def update_profile(
    profile_in: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    patient = get_patient_for_user(db, current_user)
    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name
    if profile_in.email is not None:
        current_user.email = profile_in.email
    if profile_in.phone is not None:
        current_user.phone = profile_in.phone
    for field in ["date_of_birth", "gender", "blood_group", "height", "weight",
                  "allergies", "chronic_diseases", "emergency_contact", "insurance_number"]:
        val = getattr(profile_in, field)
        if val is not None:
            setattr(patient, field, val)
    db.commit()
    return {"message": "Profile updated successfully"}


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationResponse])
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.user_id)
        .order_by(Notification.created_at.desc())
        .limit(10)
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


# ── Doctors ───────────────────────────────────────────────────────────────────

@router.get("/doctors")
def get_doctors(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [
        {
            "doctor_id": d.doctor_id,
            "user_id": d.user_id,
            "name": u.full_name,
            "specialization": d.specialization,
            "hospital_name": d.hospital_name,
            "qualification": d.qualification,
            "experience": d.experience,
        }
        for d, u in db.query(Doctor, User).join(User, User.user_id == Doctor.user_id).all()
    ]


@router.get("/doctors-by-department")
def get_doctors_by_department(
    department: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (
        db.query(Doctor, User)
        .join(User, User.user_id == Doctor.user_id)
        .filter(Doctor.specialization.ilike(f"%{department}%"))
        .all()
    )
    return [
        {
            "doctor_id": d.doctor_id,
            "user_id": d.user_id,
            "name": u.full_name,
            "specialization": d.specialization,
            "hospital_name": d.hospital_name,
            "qualification": d.qualification,
            "experience": d.experience,
        }
        for d, u in rows
    ]


@router.get("/available-slots")
def get_available_slots(
    doctor_id: int,
    date_str: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        slot_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    booked = db.query(Appointment.appointment_time).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == slot_date,
        Appointment.status.notin_(["Cancelled"]),
    ).all()
    booked_times = {str(b[0])[:5] for b in booked}

    slots = []
    for hour in range(9, 17):
        for minute in (0, 30):
            t = f"{hour:02d}:{minute:02d}"
            slots.append({"time": t, "available": t not in booked_times})
    return slots
