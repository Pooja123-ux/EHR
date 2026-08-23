"""
backend/app/services/report_parsing.py

Minimal report-parsing utilities. All hard-coded medical reference ranges
and parameter extraction rules have been removed. The LLM now handles
dynamic extraction of whatever parameters or findings are present in each
individual report.
"""
import re


IMAGING_TYPES = {"X-Ray", "MRI", "CT Scan", "Ultrasound"}


def classify_report_type(report_type: str) -> str:
    """Bucket a free-text report_type into broad categories."""
    rt = (report_type or "").strip()
    rt_lower = rt.lower()

    if rt in IMAGING_TYPES or any(m in rt for m in ["X-ray", "MRI", "CT", "Ultrasound", "Sonography", "Radiograph"]):
        return "imaging"
    if any(k in rt_lower for k in ["ecg", "ekg", "electrocardiogram"]):
        return "ecg"
    if any(k in rt_lower for k in ["biopsy", "histopath", "cytology", "pathology"]):
        return "biopsy"
    if any(k in rt_lower for k in ["prescription", "medication"]):
        return "prescription"
    if any(k in rt_lower for k in ["blood", "cbc", "urine", "lipid", "glucose", "thyroid", "lab", "panel", "test"]):
        return "lab"
    return "general"


def build_summary_text(report_type: str, findings: list[dict], ocr_text: str = "", uploaded_at=None) -> str:
    """Deterministic, non-LLM fallback summary — used when Ollama is
    unavailable or returns nothing usable."""
    category = classify_report_type(report_type)

    if findings:
        abnormal = [f for f in findings if f.get("status", "UNKNOWN") not in {"NORMAL", "UNKNOWN"}]
        normal = [f for f in findings if f.get("status", "UNKNOWN") == "NORMAL"]
        lines = [f"AI Analysis — {report_type}\n"]
        if not abnormal:
            lines.append("All tested parameters are within normal reference ranges.")
        else:
            lines.append(f"{len(abnormal)} parameter(s) outside normal range:")
            for f in abnormal:
                arrow = "▲" if f.get("status") == "HIGH" else "▼"
                lines.append(f"  {arrow} {f.get('parameter', '')}: {f.get('value', '')} {f.get('unit', '')} (Ref: {f.get('reference', '')})")
        if normal:
            lines.append(f"\n{len(normal)} parameter(s) within normal range.")
        lines.append("\n\nPlease consult your doctor for personalised medical advice.")
        return "\n".join(lines)

    lines = [f"AI Analysis — {report_type}\n"]
    if uploaded_at:
        lines.append(f"Report Date: {uploaded_at.strftime('%d %B %Y')}")

    text = (ocr_text or "").strip()
    if text:
        lines.append(f"\n{text[:500]}{'...' if len(text) > 500 else ''}")
    else:
        lines.append("\nNo readable text was found in this report.")

    lines.append("\n\nPlease consult your doctor for personalised medical advice.")
    return "\n".join(lines)
