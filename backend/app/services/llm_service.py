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
  Structured extraction (LLM + regex parameter extractor fallback)
    ↓
  Validation & Normalization layer
    ↓
  Patient-friendly summary generation
    ↓
  RAG-assisted interactive chat
"""
import json
import logging
import re
import time
from typing import Optional, List, Dict, Any
import ollama
from ollama import Client
from app.services.rag_service import rag_service, build_rag_prompt, is_rag_available
from app.services.report_validation import validate_extracted_data, _is_unit_consistent, _parse_reference_range, _status_from_reference

logger = logging.getLogger(__name__)

OLLAMA_HOST = "http://localhost:11434"
LLM_MODEL = "llama3.2:latest"
EMBEDDING_MODEL = "nomic-embed-text"

GENERATE_OPTIONS = {
    "num_ctx": 4096,
    "temperature": 0.1,
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
        logger.warning("[LLM] Ollama unavailable: %s", e)
        _ollama_available = False
        _ollama_checked_at = now
        return False


def _safe_generate(prompt: str) -> Optional[str]:
    try:
        response = _client.generate(model=LLM_MODEL, prompt=prompt, options=GENERATE_OPTIONS)
        text = response.get("response", "").strip()
        return text if text else None
    except Exception as e:
        logger.error("[LLM] generate failed: %s", e)
        return None


def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    # Strip markdown code fencing if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return None
    json_str = match.group(0)
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # Try fixing common json flaws (trailing commas before } or ])
        try:
            fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
            return json.loads(fixed)
        except Exception:
            return None


def _chunk_text(text: str, chunk_size: int = 3500, overlap: int = 300) -> List[str]:
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


_IMAGING_STUDY_MARKER = "Medical Imaging Study:"


def _fast_path_imaging_classification(ocr_text: str) -> Optional[Dict[str, Any]]:
    """
    text_extraction.py tags pure radiology/clinical images (no printed text, e.g.
    an X-ray/MRI/CT photo) with a 'Medical Imaging Study: <Modality - Body Part>'
    header before handing the vision model's description into this pipeline. When
    present, trust it directly instead of re-classifying via another LLM call —
    it's already a direct read of the image, for any modality/body part, not a
    fixed list of report types.
    """
    if not ocr_text or _IMAGING_STUDY_MARKER not in ocr_text[:200]:
        return None
    first_line = ocr_text.strip().splitlines()[0]
    header = first_line.split(_IMAGING_STUDY_MARKER, 1)[-1].strip()
    title = header if header and header.lower() != "medical image" else "Medical Imaging Study"
    return {"document_type": "imaging_report", "title": title, "subtype": header or None}


def classify_document(ocr_text: str, fallback_type: str = "Medical Report") -> Dict[str, Any]:
    """Dynamically classify the document type and descriptive title from its content."""
    default_res = {"document_type": "other_medical_report", "title": fallback_type, "subtype": None}
    if not ocr_text:
        return default_res

    fast_path = _fast_path_imaging_classification(ocr_text)
    if fast_path:
        return fast_path

    if not is_ollama_available():
        return default_res

    source_text = ocr_text.strip()[:3500]
    prompt = (
        "You are a medical document classifier. Read the text and identify the medical test or document type.\n"
        "Return ONLY a JSON object with this format:\n"
        "{\n"
        '  "document_type": "laboratory_report|imaging_report|ecg_report|pathology_report|prescription|discharge_summary|other_medical_report",\n'
        '  "title": "Clean standard test title like Urine Routine Examination, Complete Blood Count, Lipid Profile, Chest X-Ray, etc.",\n'
        '  "subtype": "CBC|Urinalysis|Lipid Profile|Thyroid|KFT|LFT|X-Ray|MRI|CT|etc or null"\n'
        "}\n\n"
        "Document text:\n" + source_text + "\n\nJSON:"
    )
    raw = _safe_generate(prompt)
    data = _extract_json_from_text(raw) if raw else None
    if data:
        title = data.get("title") or fallback_type
        # Sanitize title so it's not a registration/invoice number
        if any(bad in title.lower() for bad in ["regd", "reg.no", "xxxx", "letterhead", "page", "mr.", "dummy", "patient"]):
            title = fallback_type if fallback_type != "Medical Report" else "Laboratory Report"
        return {
            "document_type": data.get("document_type", "laboratory_report"),
            "title": title,
            "subtype": data.get("subtype"),
        }
    return default_res


def _extract_parameters_regex(ocr_text: str) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based lab parameter extractor.
    Acts as a high-precision backup/supplement to LLM extraction.
    """
    if not ocr_text:
        return []

    items = []
    lines = [line.strip() for line in ocr_text.splitlines() if line.strip()]

    # Patterns for qualitative parameters: (e.g. "COLOUR Pale Yellow", "TRANSPARENCY Clear", "BLOOD Absent")
    qualitative_keys = [
        "colour", "color", "transparency", "appearance", "sp gravity", "specific gravity",
        "reaction", "ph", "albumin", "protein", "sugar", "glucose", "ketone bodies", "ketones",
        "bile salts", "bile pigments", "urobilinogen", "leukocytes", "blood", "nitrite",
        "pus cells", "epithelial cells", "red blood cells", "rbc", "casts", "crystals",
        "bacteria", "yeast cells", "mucus threads", "amorphous urates", "amorphous phosphates",
    ]

    for line in lines:
        line_clean = line.strip()
        line_lower = line_clean.lower()

        # Skip headers / metadata
        if any(h in line_lower for h in ["regd.no", "reg.no", "patient", "dr.", "reported on", "received on", "examination"]):
            continue

        # Check qualitative lab parameters
        for qk in qualitative_keys:
            if line_lower.startswith(qk + " ") or line_lower.startswith(qk + ":") or line_lower.startswith(qk + "\t"):
                remainder = line_clean[len(qk):].lstrip(" :\t-")
                if remainder:
                    # Split into value and optional ref
                    parts = remainder.split()
                    val = parts[0] if len(parts) == 1 else " ".join(parts[:2])
                    ref = " ".join(parts[2:]) if len(parts) > 2 else ""
                    items.append({
                        "name": qk.title(),
                        "type": "qualitative",
                        "value": val,
                        "unit": "",
                        "reference_range": ref or ("Absent" if val.lower() == "absent" else ("Clear" if val.lower() == "clear" else "")),
                        "source_text": line_clean,
                    })
                break

        # Check numeric lab parameters: e.g. "Hemoglobin 14.5 g/dL 13.0 - 17.0" or "WBC 6500 /cumm 4000-11000"
        num_pattern = r"^([A-Za-z\s\(\)/_-]{2,30})\s+([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z/%µuLg/dLcm3\-]*)\s*([0-9\.\s\-–—<>]+)?$"
        match = re.match(num_pattern, line_clean)
        if match:
            p_name = match.group(1).strip()
            p_val = match.group(2).strip()
            p_unit = match.group(3).strip()
            p_ref = (match.group(4) or "").strip()
            p_name_lower = p_name.lower()
            if not any(h in p_name_lower for h in ["page", "age", "phone", "date", "sample", "test", "value", "unit", "reference"]):
                items.append({
                    "name": p_name,
                    "type": "numeric",
                    "value": p_val,
                    "unit": p_unit,
                    "reference_range": p_ref,
                    "source_text": line_clean,
                })

    return items


def _build_extraction_prompt(chunk: str, doc_type: str, title: str, subtype: Optional[str] = None) -> str:
    """Build a structured prompt to extract parameters and findings verbatim."""
    subtype_info = f"Subtype: {subtype}\n" if subtype else ""
    return (
        "You are an expert medical document parser. Read this medical report text and extract all lab tests, values, units, reference ranges, and findings.\n"
        "Return ONLY a valid JSON object matching this schema:\n"
        "{\n"
        f'  "document_type": "{doc_type}",\n'
        f'  "title": "{title}",\n'
        '  "sections": [\n'
        "    {\n"
        '      "name": "Section Name (e.g. Physical Examination, Chemical Examination, CBC, etc.)",\n'
        '      "items": [\n'
        "        {\n"
        '          "name": "Test/Parameter name (e.g. Hemoglobin, Specific Gravity, Blood Glucose, Protein, pH)",\n'
        '          "type": "numeric|qualitative|compound|imaging_finding",\n'
        '          "value": "verbatim value (e.g. 14.5, Absent, Pale Yellow, Clear, Positive, 1.025)",\n'
        '          "unit": "verbatim unit (e.g. g/dL, mg/dL, /cumm) or empty string",\n'
        '          "reference_range": "verbatim reference range from text (e.g. 13.0 - 17.0, 1.005-1.030, Absent) or empty string",\n'
        '          "source_text": "verbatim snippet from document"\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ],\n"
        '  "findings": ["bullet observations or imaging notes explicitly written in the report"],\n'
        '  "impression": "summary impression or conclusion if present in report, else empty string",\n'
        '  "recommendations": ["recommendations explicitly stated in report"],\n'
        '  "uncertain_items": []\n'
        "}\n\n"
        "CRITICAL RULES:\n"
        "1. DO NOT include column headers (like 'Parameter', 'Test Name', 'Value', 'Unit', 'Reference', 'Status', 'Clinical Pathology', 'Method') as items.\n"
        "2. Extract ALL test parameters present in the text verbatim.\n"
        "3. For qualitative tests (Color, Appearance, Ketones, Glucose, Nitrite, Bile), use type 'qualitative' with verbatim value.\n"
        "4. DO NOT invent test results that do not appear in the text.\n"
        "5. If the text is a narrative description of an imaging study (X-ray, MRI, CT, "
        "ultrasound, endoscopy, dermatology photo, etc.) rather than a table of numeric "
        "values, there may be NO numeric parameters at all — that is expected and fine. "
        "In that case, leave 'sections'/'items' empty or minimal, and instead put each "
        "distinct observation as its own string in 'findings' (type 'imaging_finding' if "
        "you do add it as an item), and put the overall conclusion in 'impression'.\n\n"
        f"Document text:\n{chunk}\n\nJSON:"
    )


def extract_document_structure(ocr_text: str, report_type: str = "Medical Report") -> Optional[Dict[str, Any]]:
    """Extract structured medical information using LLM + deterministic regex parser."""
    if not ocr_text or not ocr_text.strip():
        logger.warning("[LLM] Empty OCR text")
        return None

    source_text = ocr_text.strip()
    classification = classify_document(source_text, fallback_type=report_type)
    doc_type = classification.get("document_type", "laboratory_report")
    title = classification.get("title", report_type)
    subtype = classification.get("subtype")

    combined_sections = []
    all_findings = []
    all_recommendations = []
    all_uncertain = []
    all_impressions = []

    if is_ollama_available():
        chunks = _chunk_text(source_text, chunk_size=3500, overlap=300)
        for i, chunk in enumerate(chunks):
            prompt = _build_extraction_prompt(chunk, doc_type, title, subtype)
            raw = _safe_generate(prompt)
            if not raw:
                continue
            data = _extract_json_from_text(raw)
            if not data:
                continue

            if data.get("sections"):
                combined_sections.extend(data["sections"])
            if data.get("findings"):
                if isinstance(data["findings"], list):
                    all_findings.extend(data["findings"])
                elif isinstance(data["findings"], str) and data["findings"].strip():
                    all_findings.append(data["findings"].strip())
            if data.get("recommendations"):
                if isinstance(data["recommendations"], list):
                    all_recommendations.extend(data["recommendations"])
                elif isinstance(data["recommendations"], str) and data["recommendations"].strip():
                    all_recommendations.append(data["recommendations"].strip())
            if data.get("uncertain_items"):
                if isinstance(data["uncertain_items"], list):
                    all_uncertain.extend(data["uncertain_items"])
                elif isinstance(data["uncertain_items"], str) and data["uncertain_items"].strip():
                    all_uncertain.append(data["uncertain_items"].strip())
            impression = data.get("impression")
            if impression and isinstance(impression, str) and impression.strip():
                all_impressions.append(impression.strip())

    # Supplementary deterministic extraction to ensure 100% parameter recall
    regex_items = _extract_parameters_regex(source_text)
    if regex_items:
        # Check if we need to add regex items
        existing_names = set()
        for sec in combined_sections:
            for it in sec.get("items", []):
                existing_names.add(it.get("name", "").lower())

        supplementary = [it for it in regex_items if it.get("name", "").lower() not in existing_names]
        if supplementary:
            combined_sections.append({
                "name": "Laboratory Parameters",
                "items": supplementary,
            })

    if not combined_sections and not all_findings:
        logger.warning("[LLM] No structure could be extracted from report")
        return None

    return {
        "document_type": doc_type,
        "title": title,
        "subtype": subtype,
        "sections": combined_sections,
        "findings": all_findings,
        "impression": " ".join(all_impressions).strip(),
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
    impression: str = "",
    recommendations: Optional[List[str]] = None,
) -> str:
    """
    Generate a clear, patient-friendly summary purely from whatever was verified
    for THIS report — no assumptions about report type. Works identically whether
    `measurements` holds numeric lab values, `findings`/`impression` hold narrative
    imaging observations, or some mix of both.
    """
    recommendations = recommendations or []
    abnormal = [m for m in measurements if m.get("status") in {"HIGH", "LOW"}]
    normal = [m for m in measurements if m.get("status") == "NORMAL"]
    unknown = [m for m in measurements if m.get("status") not in {"HIGH", "LOW", "NORMAL"}]

    # Build prompt context
    meas_lines = []
    for m in measurements[:25]:
        status = m.get("status", "NORMAL")
        ref_display = m.get("reference_raw") or m.get("reference_range") or (f"{m.get('reference_low')}-{m.get('reference_high')}" if m.get("reference_low") is not None else "")
        ref_text = f" (Ref: {ref_display} {m.get('unit', '')})" if ref_display else ""
        meas_lines.append(f"- {m.get('name')}: {m.get('value')} {m.get('unit', '')}{ref_text} — Status: {status}")

    findings_text = "\n".join(f"- {f}" for f in findings[:10]) if findings else "None"
    impression_text = impression.strip() if impression else ""
    recs_text = "\n".join(f"- {r}" for r in recommendations[:5]) if recommendations else ""

    if is_ollama_available() and (meas_lines or findings or impression_text):
        prompt = (
            "You are a helpful and compassionate medical communicator explaining a patient's medical report "
            "(blood test, urine analysis, X-ray, MRI, CT scan, ultrasound, etc.) in simple, reassuring, and clear terms.\n\n"
            f"Report Title: {title}\n"
            f"Report Type: {doc_type}\n\n"
            "Extracted & Verified Results:\n" + ("\n".join(meas_lines) if meas_lines else "None") + "\n\n"
            f"Key Clinical Findings:\n{findings_text}\n\n"
            f"Overall Impression (if any):\n{impression_text or 'None stated'}\n\n"
            "CRITICAL RULES:\n"
            "1. STRICT TRUTH TO TABLE: If a parameter in the Extracted & Verified Results table is marked 'Status: NORMAL' or 'Absent' (such as Protein, Glucose, Leukocytes, Blood, etc.), you MUST state that it is normal / negative / absent. NEVER say it is elevated or abnormal.\n"
            "2. DO NOT use the word 'unfortunately' when describing normal findings, clear scans, or the absence of disease.\n"
            "3. If there are abnormal (HIGH/LOW) parameters, clearly point them out in simple, non-alarmist words.\n"
            "4. For imaging scans (X-ray, MRI, CT, Ultrasound), explain the visual findings in clear plain English.\n"
            "5. Keep the response to 3 to 5 clear sentences and end with: Please consult your doctor for personalized medical advice.\n\n"
            "Patient Summary:"
        )
        text = _safe_generate(prompt)
        if text and not _is_refusal(text) and len(text.strip()) > 30:
            # Post-cleanup of inadvertent "unfortunately" on normal scans
            cleaned_text = re.sub(r"\bUnfortunately,\s*the scan (didn't|did not) show any abnormalities\b", "The scan showed no abnormalities", text, flags=re.IGNORECASE)
            cleaned_text = re.sub(r"\bUnfortunately,\s*the scan is normal\b", "The scan is normal", cleaned_text, flags=re.IGNORECASE)
            return cleaned_text.strip()

    # Deterministic high-quality fallback summary
    summary_lines = [f"AI Analysis — {title}\n"]
    if measurements:
        if not abnormal:
            summary_lines.append("✅ All tested parameters are within normal reference ranges.")
        else:
            summary_lines.append(f"⚠️ {len(abnormal)} parameter(s) outside reference range:")
            for m in abnormal:
                arrow = "▲ High" if m.get("status") == "HIGH" else "▼ Low"
                ref_info = m.get("reference_raw") or m.get("reference_range") or ""
                ref_str = f" (Normal: {ref_info} {m.get('unit', '')})" if ref_info else ""
                summary_lines.append(f"  • {m.get('name')}: {m.get('value')} {m.get('unit', '')}{ref_str} — {arrow}")
        if normal:
            summary_lines.append(f"\n{len(normal)} parameter(s) tested normal (including {', '.join(m.get('name', '') for m in normal[:5])}).")
        if findings:
            summary_lines.append("\nAdditional findings:")
            for f in findings:
                summary_lines.append(f"  • {f}")
    elif findings:
        summary_lines.append("Key findings identified from the report:")
        for f in findings:
            summary_lines.append(f"  • {f}")
    elif impression_text:
        summary_lines.append(f"Impression: {impression_text}")
    else:
        summary_lines.append("This report has been reviewed. Specific values were processed and stored.")

    if recs_text:
        summary_lines.append(f"\nRecommendations noted in the report:\n{recs_text}")

    summary_lines.append("\nPlease consult your doctor for personalised medical advice.")
    return "\n".join(summary_lines)


def generate_summary(ocr_text: str, report_type: str = "Medical Report") -> Optional[str]:
    """Public API: end-to-end extraction -> validation -> summary."""
    if not ocr_text or not ocr_text.strip():
        return None

    structured = extract_document_structure(ocr_text, report_type)
    if not structured:
        return None

    verified = validate_extracted_data(structured, ocr_text)
    return _generate_summary_from_structure(
        doc_type=verified.get("document_type", "laboratory_report"),
        title=verified.get("title", report_type),
        sections=verified.get("sections", []),
        findings=verified.get("findings", []),
        measurements=verified.get("parameters", []),
        source_text=ocr_text,
        impression=verified.get("impression", ""),
        recommendations=verified.get("recommendations", []),
    )


def _is_refusal(text: str) -> bool:
    """Detect if the LLM output is a refusal or unhelpful generic disclaimer."""
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
        "unable to fulfill this request",
        "i'm unable to fulfill this request",
        "unable to fulfill",
        "cannot fulfill",
        "lacks specific medical",
        "i am not able to",
        "i'm not able to",
        "i must decline",
        "i must refuse",
        "as an ai",
        "as a large language model",
        "as an assistant",
        "i cannot assist",
        "i cannot help",
        "i will not",
        "i won't",
        "i can't provide medical advice",
        "i cannot provide medical advice",
        "i recommend consulting",
        "i recommend seeing",
        "consult a qualified healthcare professional",
        "consult a licensed medical professional",
        "i'm not a doctor",
        "i am not a doctor",
        "not qualified to provide",
        "not authorized to provide",
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
        "ecg", "ekg", "biopsy", "prescription", "medicine", "dosage", "urine",
    ]
    return any(indicator in q for indicator in report_indicators)


def generate_chat_reply(
    question: str,
    ocr_text: str,
    report_type: str = "Medical Report",
    patient_id: Optional[int] = None,
    structured_data: Optional[Dict[str, Any]] = None,
) -> str:
    if not is_ollama_available():
        return "I am currently running in offline mode. Please consult your doctor for medical advice regarding your report."

    context = ""
    use_report_context = False

    if structured_data:
        measurements = structured_data.get("parameters", []) or []
        findings = structured_data.get("findings", []) or []
        if measurements or findings:
            use_report_context = True
            lines = [
                f"Document Type: {structured_data.get('document_type', report_type)}",
                f"Title: {structured_data.get('title', report_type)}",
            ]
            if measurements:
                lines.append("Lab Measurements:")
                for m in measurements[:20]:
                    ref = m.get("reference_raw") or m.get("reference_range") or "N/A"
                    lines.append(f"- {m.get('name')}: {m.get('value')} {m.get('unit', '')} (Ref: {ref}) — {m.get('status', 'NORMAL')}")
            if findings:
                lines.append("Findings:")
                for f in findings[:10]:
                    lines.append(f"- {f}")
            context = "\n".join(lines)

    if not context:
        if ocr_text and len(ocr_text.strip()) > 20:
            context = f"Report Type: {report_type}\nReport Content:\n{ocr_text.strip()[:4000]}"
            use_report_context = True
        else:
            context = "General health query."

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
    prompt += (
        "\n\nInstructions:\n"
        "- Explain concepts clearly in simple language.\n"
        "- Base answers on the patient's verified report details.\n"
        "- Do not diagnose.\n"
        "- Always advise consulting a physician for medical decisions.\n\nAnswer:"
    )

    text = _safe_generate(prompt)
    if text and not _is_refusal(text):
        return text

    return (
        "Based on your report, your doctor is the best person to explain these findings in detail. "
        "Please consult your healthcare provider for personalized guidance."
    )