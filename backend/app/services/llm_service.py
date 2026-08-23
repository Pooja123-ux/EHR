"""
backend/app/services/llm_service.py

Document-understanding pipeline for medical report summarization.

Architecture:
  OCR text
    ↓
  Document chunking
    ↓
  Dynamic document classification
    ↓
  Dynamic structured extraction (universal schema)
    ↓
  Validation layer
    ↓
  Patient-friendly summary
    ↓
  Optional RAG explanation
"""
import json
import logging
import re
import time
from typing import Optional, List, Dict, Any
import ollama
from ollama import Client
from app.services.rag_service import rag_service, build_rag_prompt, is_rag_available
from app.services.report_validation import validate_extracted_data, _is_unit_consistent

logger = logging.getLogger(__name__)


OLLAMA_HOST = "http://localhost:11434"
LLM_MODEL = "llama3.2:latest"
EMBEDDING_MODEL = "nomic-embed-text"

GENERATE_OPTIONS = {
    "num_ctx": 8192,
    "temperature": 0.2,
}

_client = Client(host=OLLAMA_HOST)
_ollama_available: Optional[bool] = None
_ollama_checked_at = 0.0
_OLLAMA_CHECK_TTL = 10.0


def is_ollama_available() -> bool:
    global _ollama_available, _ollama_checked_at
    now = time.monotonic()
    if _ollama_available is not None and now - _ollama_checked_at < _OLLAMA_CHECK_TTL:
        return _ollama_available
    try:
        _client.list()
        _ollama_available = True
        _ollama_checked_at = now
        return True
    except Exception as e:
        print(f"[LLM] Ollama unavailable: {e}")
        _ollama_available = False
        _ollama_checked_at = now
        return False


def _safe_generate(prompt: str) -> Optional[str]:
    try:
        response = _client.generate(model=LLM_MODEL, prompt=prompt, options=GENERATE_OPTIONS)
        text = response.get("response", "").strip()
        return text if text else None
    except Exception as e:
        print(f"[LLM] generate failed: {e}")
        return None


def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    match = re.search(r'\{[\s\S]*\}', text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _chunk_text(text: str, chunk_size: int = 3000, overlap: int = 300) -> List[str]:
    """Split long reports into overlapping chunks for analysis."""
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks


def classify_document(ocr_text: str) -> Dict[str, Any]:
    """Dynamically classify the document type from its content, not from report_type."""
    if not is_ollama_available():
        return {"document_type": "other_medical_report", "title": "Medical Report", "subtype": None}

    source_text = ocr_text.strip()[:4000]
    prompt = (
        "Analyze this medical document text and identify what kind of document it is.\n"
        "Return ONLY a valid JSON object:\n"
        '{\n'
        '  "document_type": "laboratory_report|imaging_report|ecg_report|pathology_report|prescription|discharge_summary|consultation_note|other_medical_report",\n'
        '  "title": "brief descriptive title",\n'
        '  "confidence": "high|medium|low",\n'
        '  "subtype": "optional subtype like CBC, LFT, KFT, Lipid Profile, Thyroid, Urinalysis, MRI, CT, X-Ray, etc. or null"\n'
        '}\n\n'
        "Document text:\n" + source_text + "\n\nJSON:"
    )
    raw = _safe_generate(prompt)
    data = _extract_json_from_text(raw) if raw else None
    if data:
        return {
            "document_type": data.get("document_type", "other_medical_report"),
            "title": data.get("title", "Medical Report"),
            "confidence": data.get("confidence", "low"),
            "subtype": data.get("subtype"),
        }
    return {"document_type": "other_medical_report", "title": "Medical Report", "confidence": "low", "subtype": None}


def _build_extraction_prompt(chunk: str, doc_type: str, title: str, subtype: Optional[str] = None) -> str:
    """Build a strict extraction prompt: only extract what is explicitly present in the text."""
    subtype_info = f"Subtype: {subtype}\n" if subtype else ""
    return (
        "You are a strict medical document extraction assistant. "
        "Your ONLY job is to read the provided report text and extract information that is EXPLICITLY written in it. "
        "You MUST NOT invent, guess, or import information from general medical knowledge. "
        "Discover the structure of this document from its content.\n\n"
        f"Document type: {doc_type}\n"
        f"Document title: {title}\n"
        f"{subtype_info}"
        "Return ONLY a valid JSON object with this universal schema:\n"
        "{\n"
        '  "document_type": "' + doc_type + '",\n'
        '  "title": "' + title + '",\n'
        '  "sections": [\n'
        "    {\n"
        '      "name": "section name from the document",\n'
        '      "content": "full text of narrative sections like Findings or Impression, or empty string",\n'
        '      "items": [\n'
        "        {\n"
        '          "name": "exact parameter/test name as written",\n'
        '          "type": "numeric|compound|text|categorical|qualitative|imaging_finding|medication",\n'
        '          "value": "exact value as written. For compound use object {systolic: 120, diastolic: 80}",\n'
        '          "unit": "exact unit as written, or empty string if none shown",\n'
        '          "reference_range": "exact reference range from the document, or empty string if none shown",\n'
        '          "source_text": "the exact text snippet from the document that contained this item"\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ],\n"
        '  "findings": ["bullet observations only if explicitly stated in the document"],\n'
        '  "impression": "exact conclusion or impression text if stated, else empty string",\n'
        '  "recommendations": ["exact recommendations if stated, else empty string"],\n'
        '  "uncertain_items": ["anything unclear, illegible, or missing from the document"]\n'
        "}\n\n"
        "STRICT RULES:\n"
        "- ONLY include items whose name, value, and unit appear verbatim in the document text.\n"
        "- Do NOT include standard medical parameters just because they are common for this document type.\n"
        "- Do NOT use outside knowledge to fill missing values or invent reference ranges.\n"
        "- For numeric values, extract the exact number shown. Do not convert units.\n"
        "- For compound values like blood pressure, use value: {systolic: 120, diastolic: 80} and type: compound.\n"
        "- For qualitative results like Negative / Positive, use type: qualitative.\n"
        "- For imaging findings, use type: imaging_finding and put the finding text in value.\n"
        "- For medications, use type: medication and put the drug name in name, details in value.\n"
        "- Status must NOT be included. The backend will calculate status from the reference range.\n"
        "- reference_range must be copied EXACTLY from the document. If the document does not show a reference range, leave it empty.\n"
        "- Include source_text for each item so we can verify it came from the document.\n"
        "- If the document is unreadable or empty, set uncertain_items and leave other fields minimal.\n\n"
        f"Document text:\n{chunk}\n\n"
        "JSON:"
    )


def _validate_measurement(item: Dict[str, Any], source_text: str) -> Optional[Dict[str, Any]]:
    """Validate a single extracted measurement against source text."""
    name = (item.get("name") or "").strip()
    value = (item.get("value") or "").strip()
    source = (item.get("source_text") or "").strip()

    if not name and not value:
        return None

    name_lower = name.lower()
    source_lower = source_text.lower()

    invalid_patterns = [
        "unknown test", "unknown result", "no test", "not available",
        "not applicable", "n/a", "na ", "cannot be determined",
        "not detected", "not performed", "specimen", "sample",
        "report generated", "test ordered", "clinical notes",
        "physician", "doctor", "patient name", "patient id",
        "lab no", "lab id", "ref no", "reference no",
        "signature", "sign", "stamp", "verified by",
    ]
    if any(p in name_lower for p in invalid_patterns):
        logger.info("[LLM] Filtered invalid measurement: %s", name)
        return None

    in_source = (
        name_lower in source_lower
        or (value and value.lower() in source_lower)
        or (source and source_lower in source_lower)
    )
    if not in_source:
        logger.info("[LLM] Measurement not found in source: %s = %s", name, value)
        return None

    validated = dict(item)
    validated.setdefault("unit", "")
    validated.setdefault("reference_range", "")
    validated.setdefault("source_text", source)
    return validated


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
    result = {"low": None, "high": None}
    if not range_str or not str(range_str).strip():
        return result
    cleaned = str(range_str).replace(" ", "").replace("–", "-").replace("—", "-")
    match = re.match(r"^(\d+(?:\.\d+)?)[\-–](\d+(?:\.\d+)?)$", cleaned)
    if match:
        try:
            result["low"] = float(match.group(1))
            result["high"] = float(match.group(2))
        except (ValueError, TypeError):
            pass
    return result


def _status_from_reference(value_str: Any, reference_str: Any, unit_mismatch: bool = False) -> str:
    """Determine Normal/High/Low from value and reference range strictly. Returns Unknown if can't determine."""
    if unit_mismatch:
        return "UNKNOWN"
    value = _parse_number(value_str)
    if value is None:
        return "UNKNOWN"
    ref = _parse_reference_range(reference_str)
    low = ref.get("low")
    high = ref.get("high")
    if low is None or high is None:
        return "UNKNOWN"
    try:
        if value < low:
            return "LOW"
        if value > high:
            return "HIGH"
        return "NORMAL"
    except (TypeError, ValueError):
        return "UNKNOWN"


def extract_document_structure(ocr_text: str, report_type: str = "Medical Report") -> Optional[Dict[str, Any]]:
    """
    Main entry point for document understanding — EXTRACTION ONLY.
    Chunks long documents, classifies them, and extracts raw structured data.
    Status, confidence, and verification are performed by the validation layer.
    """
    if not is_ollama_available():
        logger.warning("[LLM] Ollama unavailable")
        return None
    if not ocr_text or not ocr_text.strip():
        logger.warning("[LLM] Empty OCR text")
        return None

    source_text = ocr_text.strip()
    chunks = _chunk_text(source_text, chunk_size=3000, overlap=300)
    logger.info("[LLM] Document split into %d chunks", len(chunks))

    classification = classify_document(source_text)
    doc_type = classification.get("document_type", "other_medical_report")
    title = classification.get("title", report_type)
    subtype = classification.get("subtype")
    logger.info("[LLM] Document classified as: %s (%s) subtype=%s", doc_type, classification.get("confidence", "unknown"), subtype)

    combined_sections = []
    all_findings = []
    all_recommendations = []
    all_uncertain = []

    for i, chunk in enumerate(chunks):
        logger.info("[LLM] Analyzing chunk %d/%d", i + 1, len(chunks))
        prompt = _build_extraction_prompt(chunk, doc_type, title, subtype)
        raw = _safe_generate(prompt)
        if not raw:
            logger.warning("[LLM] No response for chunk %d", i + 1)
            continue

        data = _extract_json_from_text(raw)
        if not data:
            logger.warning("[LLM] Could not parse JSON for chunk %d", i + 1)
            continue

        if data.get("sections"):
            combined_sections.extend(data["sections"])
        if data.get("findings"):
            all_findings.extend(data["findings"])
        if data.get("recommendations"):
            all_recommendations.extend(data["recommendations"])
        if data.get("uncertain_items"):
            all_uncertain.extend(data["uncertain_items"])

    if not combined_sections and not all_findings:
        logger.warning("[LLM] No structure extracted from any chunk")
        return None

    return {
        "document_type": doc_type,
        "title": title,
        "subtype": subtype,
        "sections": combined_sections,
        "findings": all_findings,
        "impression": "",
        "recommendations": all_recommendations,
        "uncertain_items": all_uncertain,
    }


def _generate_summary_from_structure(
    doc_type: str,
    title: str,
    sections: List[Dict[str, Any]],
    findings: List[str],
    measurements: List[Dict[str, Any]],
    source_text: str,
) -> str:
    """Stage 2: Generate patient-friendly summary from VERIFIED structured data only."""
    if not is_ollama_available():
        return ""

    measurements_summary = []
    for m in measurements[:20]:
        status = m.get("status", "UNKNOWN")
        confidence = m.get("confidence", "LOW")
        measurements_summary.append(
            f"- {m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')} "
            f"(Ref: {m.get('reference_low', 'N/A')}-{m.get('reference_high', 'N/A')} {m.get('unit', '')}) — {status} ({confidence})"
        )

    findings_summary = "\n".join(f"- {f}" for f in findings[:10]) if findings else "None"

    context = (
        f"Document type: {doc_type}\n"
        f"Title: {title}\n\n"
        f"VERIFIED measurements extracted:\n" + "\n".join(measurements_summary) + "\n\n"
        f"Findings:\n{findings_summary}\n\n"
        "INSTRUCTIONS:\n"
        "- Summarize ONLY the verified information provided below.\n"
        "- Do not introduce values, units, reference ranges, diagnoses, or findings that are not present.\n"
        "- If a measurement is UNKNOWN, explicitly say its status could not be determined from the report.\n"
        "- Keep it to 3-5 sentences.\n"
        "- Be reassuring but accurate.\n"
        "- End with: Please consult your doctor for personalised medical advice.\n\n"
        f"Original document text (first 3000 chars for context only):\n{source_text[:3000]}"
    )

    prompt = (
        "You are a medical communication assistant. Write a brief, clear, patient-facing summary of this medical report.\n"
        "- Use ONLY the verified information provided below. Do not invent details.\n"
        "- If measurements are present, mention the key values and whether they are normal, high, or low.\n"
        "- If findings are present, mention them clearly.\n"
        "- Keep it to 3-5 sentences.\n"
        "- Be reassuring but accurate.\n"
        "- End with: Please consult your doctor for personalised medical advice.\n\n"
        f"{context}\n\n"
        "Patient-friendly summary:"
    )

    text = _safe_generate(prompt)
    if text and not _is_refusal(text):
        return text.strip()

    if measurements:
        abnormal = [m for m in measurements if m.get("status") != "NORMAL"]
        normal = [m for m in measurements if m.get("status") == "NORMAL"]
        lines = [f"AI Analysis — {title}\n"]
        if not abnormal:
            lines.append("All tested parameters are within normal reference ranges.")
        else:
            lines.append(f"{len(abnormal)} parameter(s) outside normal range:")
            for m in abnormal:
                arrow = "▲" if m.get("status") == "HIGH" else "▼"
                lines.append(f"  {arrow} {m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')} (Ref: {m.get('reference_low', '')}-{m.get('reference_high', '')} {m.get('unit', '')})")
        if normal:
            lines.append(f"\n{len(normal)} parameter(s) within normal range.")
        if findings:
            lines.append("\nKey findings:")
            for f in findings:
                lines.append(f"  • {f}")
        lines.append("\nPlease consult your doctor for personalised medical advice.")
        return "\n".join(lines)

    if findings:
        return (
            f"AI Analysis — {title}\n\n"
            "Key findings:\n"
            + "\n".join(f"• {f}" for f in findings)
            + "\n\nPlease consult your doctor for personalised medical advice."
        )

    return (
        f"AI Analysis — {title}\n\n"
        "This report has been processed, but specific values could not be automatically extracted. "
        "Please consult your doctor for a detailed interpretation of your results.\n\n"
        "Please consult your doctor for personalised medical advice."
    )


def generate_summary(ocr_text: str, report_type: str = "Medical Report") -> Optional[str]:
    """Public API: generate summary from OCR text using extraction → validation → summary."""
    if not is_ollama_available():
        return None
    if not ocr_text or not ocr_text.strip():
        return None

    structured = extract_document_structure(ocr_text, report_type)
    if not structured:
        return None

    verified = validate_extracted_data(structured, ocr_text)
    for param in verified.get("parameters", []):
        if param.get("type") == "compound":
            ref = {"low": None, "high": None}
        else:
            ref = _parse_reference_range(param.get("reference_range"))
        unit_mismatch = False
        if param.get("type") == "numeric" and param.get("unit"):
            source_text = ocr_text or ""
            if not _is_unit_consistent(str(param.get("value", "")), str(param.get("unit", "")), source_text):
                unit_mismatch = True
        param["status"] = _status_from_reference(
            param.get("value"),
            param.get("reference_range"),
            unit_mismatch=unit_mismatch,
        )
        if unit_mismatch:
            param["status"] = "UNKNOWN"
            param["unit_mismatch"] = True

    return _generate_summary_from_structure(
        doc_type=verified.get("document_type", "other_medical_report"),
        title=verified.get("title", "Medical Report"),
        sections=verified.get("sections", []),
        findings=verified.get("findings", []),
        measurements=verified.get("parameters", []),
        source_text=ocr_text,
    )


def _is_refusal(text: str) -> bool:
    if not text:
        return True
    lower = text.lower()
    refusal_markers = [
        "no summary provided",
        "i cannot provide a summary",
        "i cannot summarize",
        "i am unable to summarize",
        "i'm unable to summarize",
        "cannot provide a summary",
        "i cannot give a summary",
        "i cannot generate a summary",
        "i can't fulfill this request",
        "can't fulfill this request",
        "i am not able to",
        "i'm not able to",
        "i must decline",
        "i must refuse",
        "as an ai",
        "as an assistant",
        "i cannot assist",
        "i cannot help",
        "i will not",
        "i won't",
    ]
    return any(marker in lower for marker in refusal_markers)


def _should_use_report_context(question: str) -> bool:
    q = (question or "").lower()
    if not q:
        return False

    report_indicators = [
        "report", "lab", "blood test", "x-ray", "xray", "mri", "ct scan",
        "scan", "results", "result", "normal", "high", "low", "range",
        "value", "values", "parameter", "cholesterol", "glucose", "platelet",
        "interpret", "what does this mean", "explain my report",
        "what do my results mean", "is my report", "is this normal",
        "ecg", "ekg", "biopsy", "prescription", "medicine", "dosage",
    ]
    if any(indicator in q for indicator in report_indicators):
        return True

    general_symptom_keywords = [
        "cold", "fever", "cough", "flu", "sore throat", "headache", "body ache",
        "fatigue", "infection", "stomach pain", "dizziness", "nausea"
    ]
    return not any(keyword in q for keyword in general_symptom_keywords)


def generate_chat_reply(question: str, ocr_text: str, report_type: str = "Medical Report", patient_id: Optional[int] = None, structured_data: Optional[Dict[str, Any]] = None) -> str:
    if not is_ollama_available():
        return "I'm currently unable to connect to the AI service. Please consult your doctor for medical advice."

    use_report_context = False
    context = ""

    if structured_data:
        measurements = structured_data.get("parameters", []) or structured_data.get("measurements", []) or []
        findings = structured_data.get("findings", []) or []
        if measurements or findings:
            use_report_context = True
            lines = [
                f"Document type: {structured_data.get('document_type', report_type)}",
                f"Title: {structured_data.get('title', report_type)}",
            ]
            if measurements:
                lines.append("Measurements:")
                for m in measurements[:20]:
                    lines.append(
                        f"- {m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')} "
                        f"(Ref: {m.get('reference_range', 'N/A')}) — {m.get('status', 'Unknown')}"
                    )
            if findings:
                lines.append("Findings:")
                for f in findings[:10]:
                    lines.append(f"- {f}")
            context = "\n".join(lines)

    if not use_report_context:
        q = (question or "").lower()
        report_indicators = [
            "report", "lab", "blood test", "x-ray", "xray", "mri", "ct scan",
            "scan", "results", "result", "normal", "high", "low", "range",
            "value", "values", "parameter", "cholesterol", "glucose", "platelet",
            "interpret", "what does this mean", "explain my report",
            "what do my results mean", "is my report", "is this normal",
            "ecg", "ekg", "biopsy", "prescription", "medicine", "dosage",
        ]
        use_report_context = any(indicator in q for indicator in report_indicators)

    if use_report_context:
        if not context and ocr_text:
            report_context_raw = ocr_text.strip()[:6000]
            context = f"Report type: {report_type}\nReport text:\n{report_context_raw}"
        elif not context:
            context = (
                "The user is asking about their medical report, but no structured data is available. "
                "Answer in simple language and advise consulting their doctor for specific results."
            )
    else:
        context = (
            "The user is asking for general health guidance about symptoms. "
            "Answer in simple language, keep it practical, and do not diagnose. "
            "If symptoms are severe, worsening, or there are red flags, advise seeing a doctor."
        )

    retrieved = []
    if is_rag_available():
        query = question
        where = None
        if patient_id is not None:
            if use_report_context:
                where = {
                    "$or": [
                        {"type": {"$in": ["reference", "general", "drug_db"]}},
                        {"type": "patient_report", "patient_id": patient_id},
                    ]
                }
            else:
                where = {"type": {"$in": ["reference", "general", "drug_db"]}}
        retrieved = rag_service.search(query, top_k=4, where=where)

    prompt = build_rag_prompt(
        question=question,
        retrieved=retrieved,
        context=context,
    )

    if use_report_context:
        prompt += (
            "\n\nAnswer the patient's question based on their report and the retrieved medical information.\n"
            "- Explain only what is explicitly stated in the report.\n"
            "- Do not invent a diagnosis.\n"
        )
    else:
        prompt += "\n\nAnswer the patient's general health question with simple, practical guidance.\n"

    prompt += (
        "- Use simple language.\n"
        "- Do not tell the patient whether they have a disease or condition beyond what the report explicitly states.\n"
        "- Always encourage consulting a doctor for medical decisions.\n\n"
        "Answer:"
    )

    text = _safe_generate(prompt)
    if text and not _is_refusal(text):
        return text

    if use_report_context:
        return (
            "Based on the information available in your report, I can't provide a specific answer to that question. "
            "Please consult your doctor for a detailed explanation of your results."
        )
    return (
        "For general health questions like this, it's best to consult with a healthcare professional. "
        "They can provide personalized advice based on your specific situation."
    )
