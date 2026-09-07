"""
Apply clean validation, accurate parameter status checking, and clean summaries to all reports in the database.
"""
import json
import re
import sys
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[2]
load_dotenv(backend_dir / ".env")
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.models import LabReport, AISummary
from app.services.text_extraction import extract_text
from app.services.report_validation import validate_extracted_data
from app.services.llm_service import extract_document_structure, _generate_summary_from_structure

def clean_and_update_all():
    db = SessionLocal()
    reports = db.query(LabReport).order_by(LabReport.report_id.asc()).all()
    print(f"Applying clean validation & accurate summaries to {len(reports)} reports...")

    for r in reports:
        print(f"\n=======================================================")
        print(f"Report ID {r.report_id}: {r.report_type} | File: {r.report_file}")
        
        file_path = backend_dir / r.report_file
        if not file_path.exists():
            print(f"File not found: {file_path}")
            continue

        raw_text = extract_text(str(file_path))
        r.ocr_text = raw_text
        
        # Check if pure imaging study
        if raw_text.startswith("Medical Imaging Study:"):
            findings_text = raw_text.replace("Medical Imaging Study:", "").strip()
            lines = [l.strip() for l in findings_text.split("\n") if l.strip() and not l.startswith("Findings (AI visual")]
            summary_text = findings_text
            verified_data = {
                "document_type": "imaging_report",
                "title": r.report_type or "Medical Imaging Report",
                "findings": lines or [findings_text],
                "parameters": [],
                "uncertain_items": [],
                "impression": "Visual imaging study completed. Consult radiologist for clinical correlation.",
                "summary": summary_text,
            }
        else:
            struct = extract_document_structure(raw_text, r.report_type or "Medical Report")
            if not struct:
                struct = {
                    "document_type": "laboratory_report",
                    "title": r.report_type or "Medical Report",
                    "sections": [],
                    "parameters": [],
                    "findings": [],
                }
            verified_data = validate_extracted_data(struct, raw_text)
            
            # Generate clean, truthful summary
            summary_text = _generate_summary_from_structure(
                doc_type=verified_data.get("document_type", "laboratory_report"),
                title=verified_data.get("title", r.report_type or "Medical Report"),
                sections=verified_data.get("sections", []),
                findings=verified_data.get("findings", []),
                measurements=verified_data.get("parameters", []),
                source_text=raw_text,
                impression=verified_data.get("impression", ""),
                recommendations=verified_data.get("recommendations", []),
            )

        r.processing_status = "COMPLETED"
        r.processing_error = None
        db.commit()

        existing_summary = db.query(AISummary).filter(AISummary.report_id == r.report_id).first()
        active_json = json.dumps(verified_data)
        doc_type = verified_data.get("document_type") or r.report_type

        if existing_summary:
            existing_summary.summary = summary_text
            existing_summary.report_type = doc_type
            existing_summary.structured_data = active_json
            existing_summary.verified_data = active_json
            existing_summary.processing_version = "2.0"
        else:
            db.add(AISummary(
                report_id=r.report_id,
                summary=summary_text,
                report_type=doc_type,
                structured_data=active_json,
                verified_data=active_json,
                processing_version="2.0",
            ))
        db.commit()
        print(f"-> Successfully updated Report {r.report_id}")
        print("Summary Preview:\n", summary_text[:250].encode('ascii', 'ignore').decode(), "...\n")

    db.close()
    print("All reports updated successfully!")

if __name__ == "__main__":
    clean_and_update_all()

