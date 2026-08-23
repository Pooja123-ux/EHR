"""
backend/app/services/background_processing.py

Background processing for uploaded medical reports.
Handles extraction, analysis, and summary generation asynchronously.
"""
import json
import logging
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.models import LabReport, AISummary, Base
from app.services.text_extraction import extract_text
from app.services.llm_service import extract_document_structure, _generate_summary_from_structure, is_ollama_available, _status_from_reference, _parse_reference_range
from app.services.report_validation import validate_extracted_data, _is_unit_consistent
from app.services.rag_service import rag_service, is_rag_available
from app.services.report_parsing import build_summary_text as _build_summary_text

logger = logging.getLogger(__name__)

_engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _process_report_background(report_id: int) -> None:
    db = _SessionLocal()
    try:
        process_report(report_id, db)
    finally:
        db.close()


def process_report(report_id: int, db) -> None:
    """Process an uploaded report: extract text, structure, validate, summarize."""
    report = db.query(LabReport).filter(LabReport.report_id == report_id).first()
    if not report:
        logger.error("[BG] Report %d not found", report_id)
        return

    report.processing_status = "EXTRACTING"
    db.commit()

    try:
        file_path = Path(__file__).resolve().parents[2] / report.report_file
        if not file_path.exists():
            raise FileNotFoundError(f"Report file not found: {report.report_file}")

        extracted_text = extract_text(str(file_path))
        logger.info("[BG] Extracted %d chars from report %d", len(extracted_text), report_id)

        if not extracted_text:
            report.ocr_text = None
            report.processing_status = "FAILED_OCR"
            report.processing_error = "Could not extract text from this file. The file may be corrupted, password-protected, or contain only images that could not be processed."
            db.commit()
            return

        report.ocr_text = extracted_text
        report.processing_status = "STRUCTURING"
        db.commit()

        structured_data = None
        verified_data = None
        summary_text = None

        if is_ollama_available():
            structured_data = extract_document_structure(extracted_text, report.report_type or "Medical Report")
            if structured_data:
                report.processing_status = "VALIDATING"
                db.commit()

                verified_data = validate_extracted_data(structured_data, extracted_text)
                for param in verified_data.get("parameters", []):
                    if param.get("type") == "compound":
                        ref = {"low": None, "high": None}
                    else:
                        ref = _parse_reference_range(param.get("reference_range"))
                    unit_mismatch = False
                    if param.get("type") == "numeric" and param.get("unit"):
                        if not _is_unit_consistent(str(param.get("value", "")), str(param.get("unit", "")), extracted_text):
                            unit_mismatch = True
                    param["status"] = _status_from_reference(
                        param.get("value"),
                        param.get("reference_range"),
                        unit_mismatch=unit_mismatch,
                    )
                    if unit_mismatch:
                        param["status"] = "UNKNOWN"
                        param["unit_mismatch"] = True

                logger.info("[BG] Validated %d parameters, %d findings",
                           len(verified_data.get("parameters", [])),
                           len(verified_data.get("findings", [])))

        if verified_data:
            report.processing_status = "SUMMARIZING"
            db.commit()
            summary_text = _generate_summary_from_structure(
                doc_type=verified_data.get("document_type", "other_medical_report"),
                title=verified_data.get("title", "Medical Report"),
                sections=verified_data.get("sections", []),
                findings=verified_data.get("findings", []),
                measurements=verified_data.get("parameters", []),
                source_text=extracted_text,
            )

        if not summary_text:
            summary_text = _build_summary_text(report.report_type or "Report", [], extracted_text, report.uploaded_at)

        report.processing_status = "COMPLETED"
        db.commit()

        if summary_text:
            existing = db.query(AISummary).filter(AISummary.report_id == report.report_id).first()
            if existing:
                existing.summary = summary_text
                existing.report_type = report.report_type
                existing.structured_data = json.dumps(structured_data) if structured_data else None
                existing.verified_data = json.dumps(verified_data) if verified_data else None
                existing.processing_version = "2.0"
            else:
                db.add(AISummary(
                    report_id=report.report_id,
                    summary=summary_text,
                    report_type=report.report_type,
                    structured_data=json.dumps(structured_data) if structured_data else None,
                    verified_data=json.dumps(verified_data) if verified_data else None,
                    processing_version="2.0",
                ))

        if extracted_text and is_rag_available():
            try:
                rag_service.add_document(
                    text=extracted_text,
                    source=f"patient_report_{report.report_id}",
                    metadata={"type": "patient_report", "patient_id": report.patient_id, "report_id": report.report_id, "report_type": report.report_type},
                )
            except Exception as e:
                logger.error("[RAG] Failed to ingest report %d: %s", report_id, e)

        db.commit()
        logger.info("[BG] Processing completed for report %d", report_id)

    except Exception as e:
        logger.error("[BG] Processing failed for report %d: %s", report_id, e)
        report.processing_status = "FAILED"
        report.processing_error = str(e)
        db.commit()
