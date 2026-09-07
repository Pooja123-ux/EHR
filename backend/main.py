from datetime import date, timedelta
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from app.api import auth, patient, doctor, lab, admin
from app.api.deps import get_current_user
from app.core.database import Base, engine, get_db
from app.models.models import Appointment, Doctor, Notification, Patient, User
import app.models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="EHR AI System", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(patient.router)
app.include_router(doctor.router)
app.include_router(lab.router)
app.include_router(admin.router)

uploads_dir = Path(__file__).resolve().parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)


# ── Authenticated file download ───────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


@app.get("/uploads/{file_path:path}")
def serve_upload(
    file_path: str,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
):
    """Proxy for uploaded files — requires a valid JWT."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    # Validate token (reuse existing dep logic)
    from app.core.security import decode_access_token
    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("user_id"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    target = (uploads_dir / file_path).resolve()
    # Prevent path traversal
    if not str(target).startswith(str(uploads_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(target))


# ── Appointment reminder scheduler ───────────────────────────────────────────

def _send_appointment_reminders() -> None:
    """Runs every hour; sends a notification for appointments happening tomorrow."""
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        tomorrow = date.today() + timedelta(days=1)
        upcoming = (
            db.query(Appointment, Patient, Doctor, User)
            .join(Patient, Patient.patient_id == Appointment.patient_id)
            .join(Doctor, Doctor.doctor_id == Appointment.doctor_id)
            .join(User, User.user_id == Doctor.user_id)
            .filter(
                Appointment.appointment_date == tomorrow,
                Appointment.status.notin_(["Cancelled", "Completed"]),
            )
            .all()
        )
        for appt, pat, doc, doc_user in upcoming:
            already = (
                db.query(Notification)
                .filter(
                    Notification.user_id == pat.user_id,
                    Notification.title == "Appointment Reminder",
                    Notification.message.like(f"%appointment_id={appt.appointment_id}%"),
                )
                .first()
            )
            if not already:
                db.add(Notification(
                    user_id=pat.user_id,
                    title="Appointment Reminder",
                    message=(
                        f"Reminder: You have an appointment with Dr. {doc_user.full_name} "
                        f"tomorrow ({tomorrow}) at {appt.appointment_time}. "
                        f"[appointment_id={appt.appointment_id}]"
                    ),
                ))
        db.commit()
    except Exception as e:
        logging.getLogger(__name__).error("[REMINDER] Failed: %s", e)
    finally:
        db.close()


_scheduler = BackgroundScheduler()
_scheduler.add_job(_send_appointment_reminders, "interval", hours=1, id="appt_reminders")


@app.on_event("startup")
def start_scheduler() -> None:
    _scheduler.start()


@app.on_event("shutdown")
def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS hospital_id INTEGER"))
        conn.execute(text("ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS structured_data TEXT"))
        conn.execute(text("ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS verified_data TEXT"))
        conn.execute(text("ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS processing_version VARCHAR(20)"))
        conn.execute(text("ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'PENDING'"))
        conn.execute(text("ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS processing_error TEXT"))
    try:
        from app.services.rag_service import init_medical_knowledge_base
        init_medical_knowledge_base()
    except Exception as e:
        print(f"[RAG] Startup initialization failed: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/diagnostics/ocr")
def diagnose_ocr(report_id: int, db: Session = Depends(get_db)):
    from app.models.models import LabReport
    from app.services.text_extraction import extract_text
    from app.services.vision_service import is_vision_available

    report = db.query(LabReport).filter(LabReport.report_id == report_id).first()
    if not report:
        return {"error": "Report not found"}

    result = {
        "report_id": report.report_id,
        "report_type": report.report_type,
        "report_file": report.report_file,
        "ocr_text_stored": report.ocr_text,
        "ocr_text_length": len(report.ocr_text) if report.ocr_text else 0,
        "vision_available": is_vision_available(),
    }

    if report.report_file:
        file_path = Path(__file__).resolve().parent / report.report_file
        if file_path.exists():
            result["file_exists"] = True
            result["file_size"] = file_path.stat().st_size
            extracted = extract_text(str(file_path))
            result["extracted_length"] = len(extracted)
            result["extracted_preview"] = extracted[:500] if extracted else ""
        else:
            result["file_exists"] = False
            result["file_path_checked"] = str(file_path)

    return result


@app.post("/diagnostics/init-rag")
def init_rag():
    from app.services.rag_service import init_medical_knowledge_base, rag_service

    init_medical_knowledge_base()
    sources = rag_service.get_all_sources()
    return {"status": "ok", "sources": sources}
