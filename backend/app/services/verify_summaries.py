"""
Helper script to test and reprocess all reports in the database.
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
from app.models.models import LabReport, AISummary
from app.services.background_processing import process_report

def run_verification():
    db = SessionLocal()
    reports = db.query(LabReport).order_by(LabReport.report_id.asc()).all()
    print(f"Starting processing for {len(reports)} reports in database...", flush=True)

    for r in reports:
        print(f"\n==================================================", flush=True)
        print(f"Report ID: {r.report_id} | Type: {r.report_type} | File: {r.report_file}", flush=True)
        try:
            process_report(r.report_id, db)
            summary = db.query(AISummary).filter(AISummary.report_id == r.report_id).first()
            print(f"Processing Status: {r.processing_status}", flush=True)
            if summary and summary.summary:
                print(f"Summary preview:\n{summary.summary[:300]}...\n", flush=True)
                if summary.verified_data:
                    vd = json.loads(summary.verified_data)
                    params = vd.get("parameters", [])
                    print(f"Parameters ({len(params)}):", flush=True)
                    for p in params[:10]:
                        name = p.get("name")
                        val = p.get("value")
                        unit = p.get("unit", "")
                        ref = p.get("reference_raw") or p.get("reference_range", "")
                        stat = p.get("status", "")
                        print(f"  * {name}: {val} {unit} (Ref: {ref}) -> {stat}", flush=True)
                if summary.structured_data:
                    sd = json.loads(summary.structured_data)
                    findings = sd.get("findings", [])
                    if findings:
                        print(f"Findings ({len(findings)}): {findings[:3]}", flush=True)
            else:
                print(f"No summary generated for report {r.report_id}", flush=True)
        except Exception as e:
            print(f"Error processing report {r.report_id}: {e}", flush=True)

    db.close()
    print("\nAll reports successfully verified and processed!", flush=True)

if __name__ == "__main__":
    run_verification()

