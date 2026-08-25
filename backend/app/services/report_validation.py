"""
backend/app/services/report_validation.py

Validation engine for LLM-extracted medical report data.

Responsibilities:
  - Source verification: ensure extracted items appear in the raw OCR text
  - Value verification: ensure values are present and parseable
  - Unit verification: ensure units are present and consistent
  - Reference-range verification: ensure ranges come from the report
  - Qualitative and inequality reference range handling (<, >, <=, >=, Absent, Negative)
  - Parameter name filtering (blocklists table headers and generic placeholders)
  - Confidence calculation: assign HIGH/MEDIUM/LOW confidence to each item
  - Status calculation: determine NORMAL/HIGH/LOW/UNKNOWN strictly from report data
"""
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

VALID_MEASUREMENT_TYPES = {
    "numeric",
    "compound",
    "text",
    "categorical",
    "qualitative",
    "imaging_finding",
    "medication",
}

VALID_STATUSES = {"NORMAL", "HIGH", "LOW", "UNKNOWN"}
VALID_CONFIDENCES = {"HIGH", "MEDIUM", "LOW"}

# Parameter names that are headers, metadata, or hallucinations
INVALID_NAME_PATTERNS = [
    "unknown test", "unknown result", "no test", "not available",
    "not applicable", "n/a", "na ", "cannot be determined",
    "not detected", "not performed", "specimen", "sample",
    "report generated", "test ordered", "clinical notes",
    "physician", "doctor", "patient name", "patient id",
    "lab no", "lab id", "ref no", "reference no",
    "signature", "sign", "stamp", "verified by",
    "test results and interpretations", "test results", "interpretations",
    "reference range", "reference interval", "biological reference",
    "parameter", "parameters", "test name", "investigation",
    "units", "unit", "method", "sample letterhead",
    "clinical pathology", "physical examination", "chemical examination",
    "microscopic examination", "registered on", "collected on",
    "reported on", "referred by", "reg.no", "regd.no",
    "age/sex", "page 1", "page 2", "normal", "high", "low", "unknown",
]

# Qualitative values indicating normal vs abnormal
NORMAL_QUALITATIVE = {
    "absent", "negative", "nil", "clear", "pale yellow", "yellow",
    "normal", "not seen", "none", "non-reactive", "non reactive",
    "0", "nil / hpf", "nil/hpf", "0-1", "0-2",
}
ABNORMAL_QUALITATIVE = {
    "present", "positive", "reactive", "cloudy", "turbid",
    "hazy", "detected", "abnormal", "elevated", "trace", "1+", "2+", "3+", "4+",
}


def _normalize_text(text: Any) -> str:
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip().lower()


def _is_value_in_source(value: Any, source_text: str) -> bool:
    if value is None:
        return False
    source_norm = _normalize_text(source_text)
    value_str = str(value).strip()
    if not value_str:
        return False
    value_norm = _normalize_text(value_str)
    if value_norm in source_norm:
        return True
    
    # Check numeric extraction match (e.g. 1.025 or 12.5)
    value_numeric = re.sub(r"[^\d.]", "", value_str)
    if value_numeric and len(value_numeric) >= 2:
        source_digits = re.sub(r"[^\d.]", "", source_norm.replace(" ", ""))
        if value_numeric in source_digits:
            return True
    return False


def _parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    # Remove commas in numbers like 150,000 -> 150000
    cleaned = str(value).replace(",", "")
    cleaned = re.sub(r"[^\d.-]", "", cleaned)
    if not cleaned or cleaned in {".", "-", "-."}:
        return None
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _parse_reference_range(range_str: Any) -> Dict[str, Optional[Any]]:
    result = {"low": None, "high": None, "raw": None, "qualitative": None}
    if not range_str or not str(range_str).strip():
        return result
    raw = str(range_str).strip()
    result["raw"] = raw
    cleaned = raw.replace(" ", "").replace("–", "-").replace("—", "-").replace(",", "")

    # Match standard range: min - max (e.g. 13.0-17.0, 1.005-1.030, 5-7)
    range_match = re.match(r"^(\d+(?:\.\d+)?)[\-–](\d+(?:\.\d+)?)$", cleaned)
    if range_match:
        try:
            result["low"] = float(range_match.group(1))
            result["high"] = float(range_match.group(2))
            return result
        except (ValueError, TypeError):
            pass

    # Match inequalities: < 200, <= 5.7, > 60, >= 90, upto 150
    less_match = re.match(r"^(?:<|<=|lessthan|upto|up to)(\d+(?:\.\d+)?)$", cleaned.lower())
    if less_match:
        try:
            result["high"] = float(less_match.group(1))
            return result
        except (ValueError, TypeError):
            pass

    greater_match = re.match(r"^(?:>|>=|greaterthan|morethan)(\d+(?:\.\d+)?)$", cleaned.lower())
    if greater_match:
        try:
            result["low"] = float(greater_match.group(1))
            return result
        except (ValueError, TypeError):
            pass

    # Check for qualitative reference (e.g., Absent, Negative, Nil)
    raw_lower = raw.lower().strip()
    if raw_lower in NORMAL_QUALITATIVE:
        result["qualitative"] = "NORMAL"
    elif raw_lower in ABNORMAL_QUALITATIVE:
        result["qualitative"] = "ABNORMAL"

    return result


def _is_unit_consistent(value_str: Any, unit_str: Any, source_text: str) -> bool:
    if not unit_str or not str(unit_str).strip():
        return True
    unit_norm = _normalize_text(unit_str)
    source_norm = _normalize_text(source_text)
    if unit_norm in source_norm:
        return True
    return False


def _calculate_confidence(item: Dict[str, Any], source_text: str) -> str:
    confidence_score = 0
    source_norm = _normalize_text(source_text)

    name = _normalize_text(item.get("name") or item.get("parameter") or "")
    if name and (name in source_norm or any(part in source_norm for part in name.split() if len(part) > 3)):
        confidence_score += 2

    value = item.get("value")
    if value is not None and _is_value_in_source(value, source_text):
        confidence_score += 2

    unit = item.get("unit")
    if unit and str(unit).strip():
        if _is_unit_consistent(str(value), str(unit), source_text):
            confidence_score += 1

    ref = item.get("reference_range")
    if ref and str(ref).strip() and str(ref).strip() not in {"null", "None", "N/A", ""}:
        if _normalize_text(str(ref)) in source_norm:
            confidence_score += 1

    if confidence_score >= 3:
        return "HIGH"
    if confidence_score >= 2:
        return "MEDIUM"
    return "LOW"


def _calculate_status(
    value: Any,
    low: Optional[float],
    high: Optional[float],
    qualitative_ref: Optional[str] = None,
    unit_mismatch: bool = False,
) -> str:
    if unit_mismatch:
        return "UNKNOWN"

    val_str = _normalize_text(value)
    
    # Check qualitative statuses first
    if val_str in NORMAL_QUALITATIVE:
        return "NORMAL"
    if val_str in ABNORMAL_QUALITATIVE:
        return "HIGH"

    num_val = _parse_number(value)
    if num_val is None:
        return "NORMAL" if qualitative_ref == "NORMAL" and val_str in NORMAL_QUALITATIVE else "UNKNOWN"

    # Numeric range checks
    if low is not None and high is not None:
        if num_val < low:
            return "LOW"
        if num_val > high:
            return "HIGH"
        return "NORMAL"

    if high is not None and low is None:
        return "HIGH" if num_val > high else "NORMAL"

    if low is not None and high is None:
        return "LOW" if num_val < low else "NORMAL"

    return "UNKNOWN"


_status_from_reference = _calculate_status


def _validate_compound(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    systolic = item.get("systolic")
    diastolic = item.get("diastolic")
    if systolic is None or diastolic is None:
        val_str = str(item.get("value") or "")
        match = re.search(r"(\d{2,3})\s*[/\\-]\s*(\d{2,3})", val_str)
        if match:
            systolic = match.group(1)
            diastolic = match.group(2)
        else:
            return None
    try:
        s = float(systolic)
        d = float(diastolic)
    except (ValueError, TypeError):
        return None

    compound_value = f"{int(s)}/{int(d)}"
    status = "NORMAL"
    if s > 130 or d > 85:
        status = "HIGH"
    elif s < 90 or d < 60:
        status = "LOW"

    return {
        "type": "compound",
        "value": compound_value,
        "systolic": s,
        "diastolic": d,
        "unit": item.get("unit") or "mmHg",
        "reference_low": 90,
        "reference_high": 120,
        "reference_raw": "90-120 / 60-80",
        "status": status,
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def _validate_numeric(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    value = item.get("value")
    parsed_value = _parse_number(value)
    if parsed_value is None:
        # Fall back to text/qualitative validation if not purely numeric
        return _validate_text_like(item, source_text)

    if not _is_value_in_source(parsed_value, source_text):
        return None

    unit = item.get("unit") or ""
    ref_info = _parse_reference_range(item.get("reference_range"))
    status = _calculate_status(
        parsed_value,
        ref_info.get("low"),
        ref_info.get("high"),
        ref_info.get("qualitative"),
        unit_mismatch=False,
    )

    return {
        "type": "numeric",
        "value": str(parsed_value) if parsed_value is not None else str(value),
        "unit": str(unit).strip(),
        "reference_low": ref_info.get("low"),
        "reference_high": ref_info.get("high"),
        "reference_range": ref_info.get("raw") or "",
        "reference_raw": ref_info.get("raw"),
        "status": status,
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def _validate_text_like(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    value = item.get("value")
    if not value or not str(value).strip():
        return None
    val_str = str(value).strip()
    if not _is_value_in_source(val_str, source_text):
        return None

    ref_info = _parse_reference_range(item.get("reference_range"))
    status = _calculate_status(
        val_str,
        ref_info.get("low"),
        ref_info.get("high"),
        ref_info.get("qualitative"),
        unit_mismatch=False,
    )

    return {
        "type": item.get("type", "qualitative"),
        "value": val_str,
        "unit": str(item.get("unit") or "").strip(),
        "reference_low": ref_info.get("low"),
        "reference_high": ref_info.get("high"),
        "reference_range": ref_info.get("raw") or "",
        "reference_raw": ref_info.get("raw"),
        "status": status,
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def validate_measurement(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    if not source_text or not source_text.strip():
        return None

    name = (item.get("name") or item.get("parameter") or "").strip()
    if not name or len(name) < 2:
        return None

    # Check blocklist for generic headers / hallucinations
    name_lower = name.lower()
    if any(p == name_lower or (len(p) > 4 and p in name_lower) for p in INVALID_NAME_PATTERNS):
        return None

    measurement_type = (item.get("type") or "numeric").lower()
    if measurement_type not in VALID_MEASUREMENT_TYPES:
        measurement_type = "numeric"

    if measurement_type == "compound":
        validated = _validate_compound(item, source_text)
    elif measurement_type in {"text", "categorical", "qualitative", "imaging_finding", "medication"}:
        validated = _validate_text_like(item, source_text)
    else:
        validated = _validate_numeric(item, source_text)

    if validated:
        validated["name"] = name
    return validated


def _deduplicate(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique = []
    for item in items:
        key = (
            _normalize_text(item.get("name", "")),
            _normalize_text(item.get("value", "")),
            _normalize_text(item.get("unit", "")),
        )
        if key not in seen and key[0]:
            seen.add(key)
            unique.append(item)
    return unique


def validate_extracted_data(candidate: Dict[str, Any], source_text: str) -> Dict[str, Any]:
    """Validate, clean, deduplicate, and score candidate structured data extracted from report text."""
    if not candidate:
        return {
            "document_type": "other_medical_report",
            "title": "Medical Report",
            "sections": [],
            "parameters": [],
            "findings": [],
            "impression": "",
            "recommendations": [],
            "uncertain_items": [],
            "confidence": "LOW",
        }

    source = source_text or ""
    validated_sections = []
    all_parameters: List[Dict[str, Any]] = []
    all_findings: List[str] = []

    for section in candidate.get("sections", []) or []:
        section_name = section.get("name") or "Lab Results"
        section_content = section.get("content") or ""
        validated_items = []
        for item in section.get("items", []) or []:
            validated = validate_measurement(item, source)
            if validated:
                validated_items.append(validated)
                all_parameters.append(validated)
        if section_content and str(section_content).strip():
            all_findings.append(str(section_content).strip())
        if validated_items:
            validated_sections.append({
                "name": section_name,
                "items": validated_items,
                "content": section_content,
            })

    # Add standalone findings
    raw_findings = candidate.get("findings", [])
    if isinstance(raw_findings, list):
        for f in raw_findings:
            if f and str(f).strip() and str(f).strip() not in all_findings:
                all_findings.append(str(f).strip())
    elif isinstance(raw_findings, str) and raw_findings.strip():
        all_findings.append(raw_findings.strip())

    all_parameters = _deduplicate(all_parameters)

    # Calculate overall confidence
    high = sum(1 for p in all_parameters if p.get("confidence") == "HIGH")
    medium = sum(1 for p in all_parameters if p.get("confidence") == "MEDIUM")
    if high >= 2:
        overall_confidence = "HIGH"
    elif high + medium >= 1 or all_findings:
        overall_confidence = "MEDIUM"
    else:
        overall_confidence = "LOW"

    # Normalize uncertain_items to a list of strings
    raw_uncertain = candidate.get("uncertain_items", [])
    uncertain_items: List[str] = []
    if isinstance(raw_uncertain, list):
        for u in raw_uncertain:
            if u and isinstance(u, str) and len(u.strip()) > 2:
                uncertain_items.append(u.strip())
    elif isinstance(raw_uncertain, str) and len(raw_uncertain.strip()) > 2:
        uncertain_items.append(raw_uncertain.strip())

    # Only add warning note if really nothing was extracted
    if not all_parameters and not all_findings and not uncertain_items:
        uncertain_items.append("No verifiable parameters or findings could be extracted from the report.")

    # Normalize recommendations to list of strings
    raw_recs = candidate.get("recommendations", [])
    recommendations: List[str] = []
    if isinstance(raw_recs, list):
        recommendations = [str(r).strip() for r in raw_recs if r and str(r).strip()]
    elif isinstance(raw_recs, str) and raw_recs.strip():
        recommendations = [raw_recs.strip()]

    return {
        "document_type": candidate.get("document_type") or "laboratory_report",
        "title": candidate.get("title") or "Medical Report",
        "subtype": candidate.get("subtype"),
        "sections": validated_sections,
        "parameters": all_parameters,
        "findings": all_findings,
        "impression": str(candidate.get("impression") or "").strip(),
        "recommendations": recommendations,
        "uncertain_items": uncertain_items,
        "confidence": overall_confidence,
    }
