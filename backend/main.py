from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from app.api import auth, patient, doctor, lab, admin
from app.core.database import Base, engine, get_db
import app.models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="EHR AI System", version="1.0.0")

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
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


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
