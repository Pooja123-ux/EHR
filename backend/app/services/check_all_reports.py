"""
Inspect and verify all patient medical records in the database.
"""
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[2]
load_dotenv(backend_dir / ".env")
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.models import LabReport, AISummary, Patient, User
from app.services.background_processing import process_report

def check_and_reprocess():
    db = SessionLocal()
    reports = db.query(LabReport).order_by(LabReport.report_id.asc()).all()
    print(f"Total records in database: {len(reports)}\n")

    for r in reports:
        patient = db.query(Patient).filter(Patient.patient_id == r.patient_id).first()
        user = db.query(User).filter(User.user_id == patient.user_id).first() if patient else None
        pname = user.full_name if user else "Unknown"

        print("=" * 70)
        print(f"Report ID: {r.report_id} | Type: {r.report_type} | Patient: {pname}")
        print(f"File: {r.report_file}")
        
        # Check if needs reprocessing
        summary = db.query(AISummary).filter(AISummary.report_id == r.report_id).first()
        needs_process = (
            not summary 
            or not summary.summary 
            or "unreadable or empty" in (summary.summary or "").lower()
            or "lacks specific" in (summary.summary or "").lower()
            or r.processing_status != "COMPLETED"
        )
        
        if needs_process:
            print(f"-> Reprocessing Report {r.report_id} with updated OCR & validation engine...")
            try:
                process_report(r.report_id, db)
                summary = db.query(AISummary).filter(AISummary.report_id == r.report_id).first()
            except Exception as e:
                print(f"Error processing report {r.report_id}: {e}")

        print(f"Processing Status: {r.processing_status}")
        if summary:
            print(f"\n--- AI Summary ---")
            print(summary.summary)
            
            raw_data = summary.verified_data or summary.structured_data
            if raw_data:
                try:
                    sd = json.loads(raw_data)
                    params = sd.get("parameters", [])
                    findings = sd.get("findings", [])
                    print(f"\nExtracted Parameters ({len(params)}):")
                    for p in params:
                        name = p.get("name")
                        val = p.get("value")
                        unit = p.get("unit", "")
                        ref = p.get("reference_raw") or p.get("reference_range", "")
                        stat = p.get("status", "NORMAL")
                        print(f"  • {name}: {val} {unit} (Ref: {ref}) -> [{stat}]")
                    if findings:
                        print(f"\nKey Findings ({len(findings)}):")
                        for f in findings:
                            print(f"  • {f}")
                except Exception as e:
                    print(f"Error parsing structured data: {e}")
        else:
            print("No summary available.")
        print()

    db.close()

if __name__ == "__main__":
    check_and_reprocess()

