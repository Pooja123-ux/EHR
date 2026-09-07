from datetime import date
import json
import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Optional

logger = logging.getLogger(__name__)

from ..core.database import get_db
from ..models.models import (
    AISummary, Doctor, LabReport, Laboratory,
    MedicalTimeline, Notification, Patient, User,
)
from ..schemas.schemas import LabReportCreate, LabSummaryResponse, LabUpdate
from .deps import get_current_user
from ..services.llm_service import generate_summary, extract_document_structure, is_ollama_available, _is_refusal
from ..services.report_parsing import build_summary_text as _build_summary_text
from ..services.text_extraction import extract_text
from ..services.background_processing import _process_report_background

router = APIRouter(prefix="/api/lab", tags=["lab"])


def get_lab_for_user(db: Session, user: User) -> Laboratory:
    lab = db.query(Laboratory).filter(Laboratory.user_id == user.user_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratory profile not found")
    return lab


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=LabSummaryResponse)
def get_lab_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lab = get_lab_for_user(db, current_user)

    # Pending = Requested/Collected/Processing assigned to this lab OR unassigned (lab_id is NULL)
    pending_count = (
        db.query(LabReport)
        .filter(
            LabReport.status.in_(["Requested", "Collected", "Processing"]),
            (LabReport.lab_id == lab.lab_id) | (LabReport.lab_id.is_(None)),
        )
        .count()
    )

    # Reports completed by this lab today
    completed_today = (
        db.query(LabReport)
        .filter(
            LabReport.lab_id == lab.lab_id,
            LabReport.status == "Completed",
        )
        .all()
    )
    uploaded_today = sum(1 for r in completed_today if r.uploaded_at and r.uploaded_at.date() == date.today())

    recent = (
        db.query(LabReport)
        .filter(LabReport.lab_id == lab.lab_id)
        .order_by(LabReport.uploaded_at.desc())
        .limit(10)
        .all()
    )

    return LabSummaryResponse(
        lab_id=lab.lab_id,
        lab_name=lab.lab_name,
        pending_tests=pending_count,
        uploaded_today=uploaded_today,
        recent_reports=[
            {"report_id": r.report_id, "report_type": r.report_type, "uploaded_at": r.uploaded_at}
            for r in recent
        ],
    )


# ── Pending Tests (doctor-requested, visible to all labs) ─────────────────────

@router.get("/pending")
def get_pending_tests(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lab = get_lab_for_user(db, current_user)

    rows = (
        db.query(LabReport, Patient, User, Doctor)
        .join(Patient, Patient.patient_id == LabReport.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .outerjoin(Doctor, Doctor.doctor_id == LabReport.doctor_id)
        .filter(
            LabReport.status.in_(["Requested", "Collected", "Processing"]),
            (LabReport.lab_id == lab.lab_id) | (LabReport.lab_id.is_(None)),
        )
        .order_by(LabReport.uploaded_at.desc())
        .all()
    )

    result = []
    for r, p, u, d in rows:
        doc_user = None
        if d:
            doc_user = db.query(User).filter(User.user_id == d.user_id).first()

        # Previous tests for this patient (last 5, excluding current)
        prev_tests = (
            db.query(LabReport)
            .filter(
                LabReport.patient_id == p.patient_id,
                LabReport.report_id != r.report_id,
            )
            .order_by(LabReport.uploaded_at.desc())
            .limit(5)
            .all()
        )

        result.append({
            "report_id": r.report_id,
            "patient_id": p.patient_id,
            "patient_name": u.full_name,
            "patient_gender": p.gender,
            "patient_blood_group": p.blood_group,
            "report_type": r.report_type,
            "status": r.status,
            "requested_by": doc_user.full_name if doc_user else None,
            "doctor_specialization": d.specialization if d else None,
            "requested_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "assigned_to_me": r.lab_id == lab.lab_id,
            "previous_tests": [
                {
                    "report_id": pt.report_id,
                    "report_type": pt.report_type,
                    "status": pt.status,
                    "uploaded_at": pt.uploaded_at.isoformat() if pt.uploaded_at else None,
                }
                for pt in prev_tests
            ],
        })
    return result


# ── Update status of a pending test ──────────────────────────────────────────

@router.put("/pending/{report_id}/status")
def update_pending_status(
    report_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lab = get_lab_for_user(db, current_user)
    report = db.query(LabReport).filter(LabReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    new_status = body.get("status")
    valid = ["Requested", "Collected", "Processing", "Completed"]
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    # Assign this lab when collecting
    if new_status in ("Collected", "Processing", "Completed"):
        report.lab_id = lab.lab_id

    report.status = new_status

    # Notify patient on status change
    patient = db.query(Patient).filter(Patient.patient_id == report.patient_id).first()
    if patient:
        status_msgs = {
            "Collected": f"Your {report.report_type} sample has been collected by the lab.",
            "Processing": f"Your {report.report_type} sample is being processed.",
            "Completed": f"Your {report.report_type} results are ready. Check your Health Records.",
        }
        if new_status in status_msgs:
            db.add(Notification(
                user_id=patient.user_id,
                title=f"Lab Test {new_status}",
                message=status_msgs[new_status],
            ))
            db.add(MedicalTimeline(
                patient_id=patient.patient_id,
                event_type="lab",
                event_name=f"{report.report_type} — {new_status}",
                description=status_msgs[new_status],
                event_date=date.today(),
            ))

    db.commit()
    return {"message": f"Status updated to {new_status}", "report_id": report_id}


# ── All reports for this lab ──────────────────────────────────────────────────

@router.get("/reports")
def get_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lab = get_lab_for_user(db, current_user)
    rows = (
        db.query(LabReport, Patient, User, AISummary)
        .join(Patient, Patient.patient_id == LabReport.patient_id)
        .join(User, User.user_id == Patient.user_id)
        .outerjoin(AISummary, AISummary.report_id == LabReport.report_id)
        .filter(LabReport.lab_id == lab.lab_id)
        .order_by(LabReport.uploaded_at.desc())
        .all()
    )
    return [
        {
            "report_id": r.report_id,
            "patient_name": u.full_name,
            "patient_id": p.patient_id,
            "report_type": r.report_type,
            "report_file": r.report_file,
            "ocr_text": r.ocr_text,
            "status": r.status,
            "uploaded_at": r.uploaded_at,
            "ai_summary": ai.summary if ai else None,
        }
        for r, p, u, ai in rows
    ]


# ── Upload results for a doctor-requested report ─────────────────────────────

@router.post("/reports/upload", status_code=status.HTTP_201_CREATED)
async def upload_report_file(
    patient_id: int = Form(...),
    report_type: str = Form(...),
    report_id: Optional[int] = Form(None),
    report_file: Optional[UploadFile] = File(None),
    ocr_text: Optional[str] = Form(None),
    ai_summary: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lab = get_lab_for_user(db, current_user)
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    report_file_path = None
    extracted_text = ""
    if report_file:
        if report_file.content_type not in {"application/pdf", "image/jpeg", "image/png"}:
            raise HTTPException(status_code=400, detail="Upload a PDF, JPG, or PNG report.")
        upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "lab_reports"
        upload_dir.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", Path(report_file.filename).name)
        target_path = upload_dir / f"{lab.lab_id}_{patient_id}_{safe_name}"
        counter = 1
        while target_path.exists():
            target_path = upload_dir / f"{lab.lab_id}_{patient_id}_{target_path.stem}_{counter}{target_path.suffix}"
            counter += 1
        target_path.write_bytes(await report_file.read())
        report_file_path = f"uploads/lab_reports/{target_path.name}"
        extracted_text = extract_text(str(target_path), report_file.content_type)

    if extracted_text.strip():
        effective_ocr = extracted_text.strip()
        if (ocr_text or "").strip():
            effective_ocr += "\n\n--- Lab Notes ---\n" + (ocr_text or "").strip()
    else:
        effective_ocr = (ocr_text or "").strip()

    # If report_id provided, update the existing doctor-requested report
    if report_id:
        report = db.query(LabReport).filter(LabReport.report_id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report request not found")
        report.lab_id = lab.lab_id
        report.status = "Completed"
        if report_file_path:
            report.report_file = report_file_path
        if effective_ocr:
            report.ocr_text = effective_ocr
    else:
        # New report not linked to a doctor request
        report = LabReport(
            patient_id=patient_id,
            doctor_id=None,
            lab_id=lab.lab_id,
            report_type=report_type,
            report_file=report_file_path,
            ocr_text=effective_ocr if effective_ocr and not effective_ocr.startswith("[") else None,
            status="Completed",
            processing_status="EXTRACTING",
        )
        db.add(report)
        db.flush()

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

    # Notify patient
    db.add(Notification(
        user_id=patient.user_id,
        title="Lab Report Ready",
        message=f"Your {report_type} results are now available in your Health Records.",
    ))
    db.add(MedicalTimeline(
        patient_id=patient.patient_id,
        event_type="lab",
        event_name=f"{report_type} — Completed",
        description=f"Lab results uploaded by {lab.lab_name}.",
        event_date=date.today(),
    ))

    # Notify requesting doctor if any
    if report.doctor_id:
        doctor = db.query(Doctor).filter(Doctor.doctor_id == report.doctor_id).first()
        if doctor:
            db.add(Notification(
                user_id=doctor.user_id,
                title="Lab Results Ready",
                message=f"{lab.lab_name} has uploaded {report_type} results for patient #{patient_id}.",
            ))

    db.commit()
    return {"report_id": report.report_id, "message": "Report uploaded successfully", "status": report.processing_status}


@router.get("/reports/{report_id}/processing-status")
def get_report_processing_status(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lab = get_lab_for_user(db, current_user)
    report = db.query(LabReport).filter(LabReport.report_id == report_id, LabReport.lab_id == lab.lab_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "report_id": report.report_id,
        "processing_status": report.processing_status,
        "processing_error": report.processing_error,
        "has_summary": db.query(AISummary).filter(AISummary.report_id == report_id).first() is not None,
    }


# ── JSON upload (legacy) ──────────────────────────────────────────────────────

@router.post("/reports", status_code=status.HTTP_201_CREATED)
def upload_report(
    data: LabReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lab = get_lab_for_user(db, current_user)
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    report = LabReport(
        patient_id=data.patient_id,
        doctor_id=data.doctor_id,
        lab_id=lab.lab_id,
        report_type=data.report_type,
        report_file=data.report_file,
        ocr_text=data.ocr_text,
        status="Completed",
    )
    db.add(report)
    db.flush()

    summary_text = data.ai_summary
    structured_data = None
    if data.ocr_text and not summary_text:
        if is_ollama_available():
            structured_data = extract_document_structure(data.ocr_text, data.report_type or "Medical Report")
            if structured_data and structured_data.get("summary"):
                summary_text = structured_data["summary"]
        if not summary_text:
            summary_text = generate_summary(data.ocr_text, data.report_type or "Medical Report")
        if not summary_text:
            summary_text = _build_summary_text(data.report_type or "Report", [])
    if summary_text:
        existing = db.query(AISummary).filter(AISummary.report_id == report.report_id).first()
        if not existing:
            db.add(AISummary(
                report_id=report.report_id,
                summary=summary_text,
                report_type=data.report_type,
                structured_data=json.dumps(structured_data) if structured_data else None,
            ))

    db.commit()
    db.refresh(report)
    return {"report_id": report.report_id, "message": "Report uploaded successfully"}


# ── Patients ──────────────────────────────────────────────────────────────────

@router.get("/patients")
def get_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_lab_for_user(db, current_user)
    # Return all patients who have any lab report (requested or completed)
    rows = (
        db.query(Patient, User)
        .join(User, User.user_id == Patient.user_id)
        .join(LabReport, LabReport.patient_id == Patient.patient_id)
        .distinct(Patient.patient_id)
        .all()
    )
    return [
        {
            "patient_id": p.patient_id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "gender": p.gender,
            "blood_group": p.blood_group,
        }
        for p, u in rows
    ]


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lab = get_lab_for_user(db, current_user)
    return {
        "user_id": current_user.user_id,
        "lab_id": lab.lab_id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "lab_name": lab.lab_name,
        "registration_number": lab.registration_number,
        "address": lab.address,
    }


@router.put("/profile")
def update_profile(
    data: LabUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lab = get_lab_for_user(db, current_user)
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        current_user.phone = data.phone
    for field in ["lab_name", "address"]:
        val = getattr(data, field)
        if val is not None:
            setattr(lab, field, val)
    db.commit()
    return {"message": "Profile updated"}
