"""
backend/app/services/report_validation.py

Validation engine for LLM-extracted medical report data.

Responsibilities:
  - Source verification: ensure extracted items appear in the raw OCR text
  - Value verification: ensure values are present and parseable
  - Unit verification: ensure units are present and consistent
  - Reference-range verification: ensure ranges come from the report, not the LLM
  - Numeric consistency: ensure numeric values are sensible
  - Duplicate detection: remove duplicate parameters
  - Confidence calculation: assign HIGH/MEDIUM/LOW confidence to each item
  - Status calculation: determine NORMAL/HIGH/LOW/UNKNOWN strictly from report data
  - Measurement type handling: numeric, compound, text, categorical, qualitative, imaging_finding, medication
"""
import json
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


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


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
    value_numeric = re.sub(r"[^\d.]", "", value_str)
    if value_numeric and re.sub(r"[^\d.]", "", source_norm.replace(" ", "")):
        return value_numeric in re.sub(r"[^\d.]", "", source_norm.replace(" ", ""))
    return False


def _parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.]", "", str(value))
    if not cleaned or cleaned == ".":
        return None
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _parse_reference_range(range_str: Any) -> Dict[str, Optional[float]]:
    result = {"low": None, "high": None, "raw": None}
    if not range_str or not str(range_str).strip():
        return result
    raw = str(range_str).strip()
    result["raw"] = raw
    cleaned = raw.replace(" ", "").replace("–", "-").replace("—", "-")
    match = re.match(r"^(\d+(?:\.\d+)?)[\-–](\d+(?:\.\d+)?)$", cleaned)
    if match:
        try:
            result["low"] = float(match.group(1))
            result["high"] = float(match.group(2))
        except (ValueError, TypeError):
            pass
    return result


def _is_unit_consistent(value_str: str, unit_str: str, source_text: str) -> bool:
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
    if name and name in source_norm:
        confidence_score += 2

    value = item.get("value")
    if value is not None and _is_value_in_source(value, source_text):
        confidence_score += 2

    unit = item.get("unit")
    if unit and str(unit).strip():
        if _is_unit_consistent(str(value), str(unit), source_text):
            confidence_score += 1
        else:
            confidence_score -= 1

    ref = item.get("reference_range")
    if ref and str(ref).strip() and str(ref).strip() not in {"null", "None", "N/A", ""}:
        if _normalize_text(str(ref)) in source_norm:
            confidence_score += 1
        else:
            confidence_score -= 2

    source_text_evidence = item.get("source_text") or ""
    if source_text_evidence and _normalize_text(source_text_evidence) in source_norm:
        confidence_score += 1

    if confidence_score >= 4:
        return "HIGH"
    if confidence_score >= 2:
        return "MEDIUM"
    return "LOW"


def _validate_compound(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    systolic = item.get("systolic")
    diastolic = item.get("diastolic")
    if systolic is None or diastolic is None:
        return None
    try:
        s = float(systolic)
        d = float(diastolic)
    except (ValueError, TypeError):
        return None
    compound_value = f"{int(s)}/{int(d)}"
    if not _is_value_in_source(compound_value, source_text):
        return None
    return {
        "type": "compound",
        "value": compound_value,
        "systolic": s,
        "diastolic": d,
        "unit": item.get("unit") or "mmHg",
        "reference_low": None,
        "reference_high": None,
        "status": "UNKNOWN",
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def _validate_numeric(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    value = item.get("value")
    parsed_value = _parse_number(value)
    if parsed_value is None:
        return None
    if not _is_value_in_source(parsed_value, source_text):
        return None
    unit = item.get("unit") or ""
    if unit and not _is_unit_consistent(str(parsed_value), str(unit), source_text):
        return None
    ref = _parse_reference_range(item.get("reference_range"))
    status = _calculate_status(parsed_value, ref.get("low"), ref.get("high"), unit_mismatch=False)
    return {
        "type": "numeric",
        "value": parsed_value,
        "unit": unit,
        "reference_low": ref.get("low"),
        "reference_high": ref.get("high"),
        "reference_raw": ref.get("raw"),
        "status": status,
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def _validate_text_like(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    value = item.get("value")
    if not value or not str(value).strip():
        return None
    if not _is_value_in_source(value, source_text):
        return None
    return {
        "type": item.get("type", "text"),
        "value": str(value).strip(),
        "unit": item.get("unit") or "",
        "reference_low": None,
        "reference_high": None,
        "reference_raw": None,
        "status": "UNKNOWN",
        "confidence": _calculate_confidence(item, source_text),
        "source_text": item.get("source_text") or "",
    }


def _calculate_status(value: Optional[float], low: Optional[float], high: Optional[float], unit_mismatch: bool) -> str:
    if value is None:
        return "UNKNOWN"
    if low is None or high is None:
        return "UNKNOWN"
    if unit_mismatch:
        return "UNKNOWN"
    try:
        if value < low:
            return "LOW"
        if value > high:
            return "HIGH"
        return "NORMAL"
    except (TypeError, ValueError):
        return "UNKNOWN"


def validate_measurement(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    if not source_text or not source_text.strip():
        return None
    measurement_type = (item.get("type") or "numeric").lower()
    if measurement_type not in VALID_MEASUREMENT_TYPES:
        measurement_type = "numeric"
    name = (item.get("name") or item.get("parameter") or "").strip()
    if not name:
        return None
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
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def validate_extracted_data(candidate: Dict[str, Any], source_text: str) -> Dict[str, Any]:
    if not candidate:
        return {
            "document_type": "other_medical_report",
            "title": "Medical Report",
            "sections": [],
            "parameters": [],
            "findings": [],
            "impression": "",
            "recommendations": [],
            "uncertain_items": ["No structured data was extracted from the report."],
            "confidence": "LOW",
        }
    source = source_text or ""
    validated_sections = []
    all_parameters: List[Dict[str, Any]] = []
    all_findings = []
    for section in candidate.get("sections", []) or []:
        section_name = section.get("name") or "Unnamed Section"
        section_content = section.get("content") or ""
        validated_items = []
        for item in section.get("items", []) or []:
            validated = validate_measurement(item, source)
            if validated:
                validated_items.append(validated)
                all_parameters.append(validated)
        if section_content:
            all_findings.append(section_content)
        if validated_items:
            validated_sections.append({"name": section_name, "items": validated_items, "content": section_content})
    raw_findings = candidate.get("findings", []) or []
    for finding in raw_findings:
        if finding and str(finding).strip():
            all_findings.append(str(finding).strip())
    all_parameters = _deduplicate(all_parameters)
    high = sum(1 for p in all_parameters if p.get("confidence") == "HIGH")
    medium = sum(1 for p in all_parameters if p.get("confidence") == "MEDIUM")
    low = sum(1 for p in all_parameters if p.get("confidence") == "LOW")
    if high >= 2:
        overall_confidence = "HIGH"
    elif high + medium >= 2:
        overall_confidence = "MEDIUM"
    else:
        overall_confidence = "LOW"
    uncertain_items = candidate.get("uncertain_items", []) or []
    if not validated_sections and not all_parameters and not all_findings:
        uncertain_items.append("No verifiable parameters or findings could be extracted from the report.")
        overall_confidence = "LOW"
    return {
        "document_type": candidate.get("document_type") or "other_medical_report",
        "title": candidate.get("title") or "Medical Report",
        "sections": validated_sections,
        "parameters": all_parameters,
        "findings": all_findings,
        "impression": candidate.get("impression") or "",
        "recommendations": candidate.get("recommendations", []) or [],
        "uncertain_items": uncertain_items,
        "confidence": overall_confidence,
    }
