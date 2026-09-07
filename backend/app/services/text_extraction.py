"""
backend/app/services/text_extraction.py

High-performance, fully dynamic document text/understanding extraction engine.
Nothing here is hard-coded to a specific report type (blood/urine/x-ray/MRI/CT/etc) —
every branch just tries to recover the richest possible textual representation of
whatever file was uploaded and hands it to the LLM pipeline downstream.

Strategy:
  PDF:
    1. Try native digital text extraction via PyMuPDF (fastest, preserves layout).
    2. If no/low text (scanned PDF), render pages to images and run RapidOCR (fast, high accuracy).
    3. Fallback to pypdf for digital text extraction.
    4. Fallback to a multimodal vision model (transcription, then full descriptive
       analysis) for pages that are pure images (e.g. a scanned film/photo pasted into a PDF).
  Images (jpg/png/etc):
    1. Run RapidOCR — handles photographed/scanned *documents* (printed lab reports,
       prescriptions, discharge summaries, etc.) that happen to be saved as images.
    2. If little/no text is found, try a vision-model OCR transcription pass, in case
       RapidOCR missed low-contrast or handwritten text.
    3. If there is still no usable text, the file is almost certainly a pure
       radiology/clinical image (X-ray, MRI, CT, ultrasound, endoscopy, skin photo,
       etc). Run a full multimodal *visual analysis* (modality + body part + findings)
       and hand that description to the same downstream LLM structuring pipeline as if
       it were OCR text — this is what lets imaging studies get the exact same dynamic,
       parameter-free summarization treatment as a text lab report.
"""
import logging
import re
from pathlib import Path
from typing import Optional, List
import pymupdf

logger = logging.getLogger(__name__)

# Phrases a vision model tends to use when it finds no legible text in an image.
# Used to detect a failed *transcription* attempt so we know to escalate to a full
# visual/diagnostic analysis instead (rather than treating the refusal as "OCR text").
_NO_TEXT_MARKERS = (
    "no text", "no visible text", "no legible text", "cannot see any text",
    "does not contain any text", "doesn't contain any text", "unable to detect any text",
    "i cannot transcribe", "there is no text", "illegible", "not contain text",
)


def _looks_like_missing_text(text: str) -> bool:
    """Detect vision-model responses that are really 'I found no text' in disguise."""
    if not text:
        return True
    stripped = text.strip()
    if len(stripped) < 12:
        return True
    lower = stripped.lower()
    # Only treat as "missing" if the whole response is basically just the refusal,
    # not a long transcription that merely mentions the word "illegible" once.
    if len(stripped) < 80 and any(marker in lower for marker in _NO_TEXT_MARKERS):
        return True
    return False


def _is_meaningful_document_text(text: str, min_length: int = 20) -> bool:
    """
    Guard against false-positive OCR: scan/radiology images often have a few
    stray characters on them (scale markers, orientation letters like 'L'/'R',
    slice numbers, timestamps burned into the image, ultrasound machine telemetry)
    that RapidOCR reads even though the image is NOT a printed document.
    """
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < min_length:
        return False

    # Check for ultrasound / scanner overlay telemetry (e.g., Har-low, Pwr100, Gn -5, C8/M7, P3/E3, SRE1S)
    telemetry_patterns = [
        r"\bPwr\s*\d+", r"\bGn\s*[-+]?\d+", r"\b[CPMSRE]\d+/[CPMSRE]\d+",
        r"\bHar[- ]?low\b", r"\bFPS\b", r"\bMI\s*[\d.]+", r"\bTIS\s*[\d.]+",
        r"\bSRE\d+[A-Z]?\b", r"\b[A-Z]\d+/[A-Z]\d+\b"
    ]
    telemetry_hits = sum(1 for pat in telemetry_patterns if re.search(pat, stripped, re.IGNORECASE))
    if telemetry_hits >= 2 and len(stripped) < 150:
        # It's an ultrasound image overlay, not document text
        return False

    tokens = re.findall(r"[A-Za-z0-9]{2,}", stripped)
    if len(tokens) < 3:
        return False
    token_chars = sum(len(t) for t in tokens)
    if token_chars < max(10, min_length * 0.5):
        return False
    return True

_rapidocr_engine = None


def get_ocr_engine():
    global _rapidocr_engine
    if _rapidocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _rapidocr_engine = RapidOCR()
            logger.info("[OCR] RapidOCR engine initialized successfully")
        except Exception as e:
            logger.warning("[OCR] RapidOCR initialization failed: %s", e)
            _rapidocr_engine = False
    return _rapidocr_engine if _rapidocr_engine is not False else None


def _ocr_image_bytes(image_bytes: bytes) -> str:
    """Run RapidOCR on raw image bytes."""
    engine = get_ocr_engine()
    if not engine or not image_bytes:
        return ""
    try:
        results, _ = engine(image_bytes)
        if not results:
            return ""
        lines = [line[1] for line in results if line and len(line) > 1 and line[1].strip()]
        return "\n".join(lines).strip()
    except Exception as e:
        logger.error("[OCR] RapidOCR execution failed: %s", e)
        return ""


def _ocr_image_with_llava(image_path: str) -> str:
    """Fallback to multimodal vision model to transcribe printed/handwritten text
    from an image (used when it's likely a photographed/scanned *document*)."""
    try:
        from app.services.vision_service import analyze_image_with_type, is_vision_available
        if not is_vision_available():
            logger.warning("[OCR] Vision model not available for image %s", image_path)
            return ""
        result = analyze_image_with_type(
            str(image_path),
            prompt=(
                "You are a medical document OCR assistant. Transcribe ALL text visible in this image. "
                "Preserve exact wording, numbers, units, and structure. "
                "If there is no readable text in the image at all (e.g. it is a scan/photo/x-ray "
                "with no printed text), respond with exactly: NO_TEXT_FOUND\n"
                "If some text is illegible, write '[illegible]' for that word only instead of guessing."
            ),
        )
        if result and result.get("analysis"):
            text = result["analysis"].strip()
            if text and "NO_TEXT_FOUND" not in text and not _looks_like_missing_text(text):
                logger.info("[OCR] Vision model transcribed %d chars from %s", len(text), image_path)
                return text
    except Exception as e:
        logger.error("[OCR] Vision model OCR failed for %s: %s", image_path, e)
    return ""


def _vision_full_analysis(image_path: str) -> str:
    """
    Full multimodal visual analysis for images with no extractable printed text —
    i.e. this is almost certainly a radiology/clinical image (X-ray, MRI, CT,
    ultrasound, dermatology photo, endoscopy still, etc) rather than a document.

    Returns a structured plain-text block (modality/body-part + descriptive
    findings) that is deliberately formatted so it can be fed straight into the
    same generic LLM classification/extraction pipeline used for OCR'd text
    reports — no report-type-specific code is involved anywhere in this path.
    """
    try:
        from app.services.vision_service import analyze_image_with_type, is_vision_available
        if not is_vision_available():
            logger.warning("[OCR] Vision model not available for image analysis %s", image_path)
            return ""
        result = analyze_image_with_type(str(image_path))
        if not result:
            return ""
        detected_type = (result.get("detected_type") or "").strip()
        analysis = (result.get("analysis") or "").strip()
        if not analysis:
            return ""

        header = detected_type if detected_type else "Medical Image"
        text = (
            f"Medical Imaging Study: {header}\n\n"
            f"Findings (AI visual analysis of the image):\n{analysis}\n"
        )
        logger.info("[OCR] Vision model produced descriptive analysis (%d chars) for %s: %s",
                    len(text), image_path, header)
        return text
    except Exception as e:
        logger.error("[OCR] Vision full analysis failed for %s: %s", image_path, e)
        return ""


def extract_text_from_pdf(pdf_path: str, min_text_length: int = 30) -> str:
    """Extract text from a PDF file using digital extraction or RapidOCR fallback."""
    path = Path(pdf_path)
    if not path.exists():
        logger.warning("[OCR] PDF not found: %s", pdf_path)
        return ""

    # Tier 1: PyMuPDF native text extraction
    text_parts: List[str] = []
    scanned_pages: List[int] = []

    try:
        doc = pymupdf.open(str(path))
        for i, page in enumerate(doc):
            page_text = (page.get_text("text") or "").strip()
            if len(page_text) >= min_text_length:
                text_parts.append(page_text)
            else:
                scanned_pages.append(i)

        # If all pages had digital text, return it immediately
        if not scanned_pages and text_parts:
            full_text = "\n\n".join(text_parts).strip()
            logger.info("[OCR] PyMuPDF extracted %d chars from digital PDF %s", len(full_text), pdf_path)
            doc.close()
            return full_text

        # Tier 2: OCR scanned pages using RapidOCR
        engine = get_ocr_engine()
        if engine and scanned_pages:
            logger.info("[OCR] Running RapidOCR on %d scanned pages in %s", len(scanned_pages), pdf_path)
            for page_idx in scanned_pages:
                page = doc[page_idx]
                pix = page.get_pixmap(dpi=200)
                ocr_result = _ocr_image_bytes(pix.tobytes("png"))
                if ocr_result:
                    text_parts.append(ocr_result)

        doc.close()

        combined = "\n\n".join(text_parts).strip()
        if len(combined) >= min_text_length:
            logger.info("[OCR] Extracted %d chars total from PDF %s", len(combined), pdf_path)
            return combined

    except Exception as e:
        logger.warning("[OCR] PyMuPDF / RapidOCR processing failed for %s: %s", pdf_path, e)

    # Tier 3: pypdf fallback for digital text
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        fallback_parts = []
        for page in reader.pages:
            t = (page.extract_text() or "").strip()
            if t:
                fallback_parts.append(t)
        fallback_text = "\n\n".join(fallback_parts).strip()
        if len(fallback_text) >= min_text_length:
            logger.info("[OCR] pypdf fallback extracted %d chars from %s", len(fallback_text), pdf_path)
            return fallback_text
    except Exception as e:
        logger.debug("[OCR] pypdf fallback failed: %s", e)

    # Tier 4: Vision model fallback — try transcription per page first, and if a
    # page has no legible text at all (e.g. a scanned film/photo embedded in the
    # PDF), fall back to a full descriptive visual analysis for that page instead
    # of giving up. Same generic strategy as extract_text_from_image, just applied
    # per rendered page.
    logger.info("[OCR] Trying vision model OCR fallback for %s", pdf_path)
    try:
        doc = pymupdf.open(str(path))
        vision_parts = []
        for i, page in enumerate(doc):
            tmp_path = path.parent / f"_vision_page_{i}_{path.stem}.png"
            try:
                pix = page.get_pixmap(dpi=150)
                pix.save(str(tmp_path))
                txt = _ocr_image_with_llava(str(tmp_path))
                if not _is_meaningful_document_text(txt):
                    txt = _vision_full_analysis(str(tmp_path))
                if txt:
                    vision_parts.append(txt)
            finally:
                if tmp_path.exists():
                    try:
                        tmp_path.unlink()
                    except Exception:
                        pass
        doc.close()
        res = "\n\n".join(vision_parts).strip()
        if res:
            return res
    except Exception as e:
        logger.error("[OCR] Vision PDF fallback failed: %s", e)

    logger.warning("[OCR] All extraction methods yielded insufficient text for %s", pdf_path)
    return ""


def extract_text_from_image(image_path: str, min_text_length: int = 20) -> str:
    """
    Universal image understanding: runs RapidOCR for printed documents,
    and falls back directly to visual analysis for radiological scans.
    """
    path = Path(image_path)
    if not path.exists():
        logger.warning("[OCR] Image not found: %s", image_path)
        return ""

    # Tier 1: RapidOCR for printed/scanned document text (0.1s)
    engine = get_ocr_engine()
    if engine:
        try:
            image_bytes = path.read_bytes()
            text = _ocr_image_bytes(image_bytes)
            if _is_meaningful_document_text(text, min_text_length):
                logger.info("[OCR] RapidOCR extracted %d chars from image %s", len(text), image_path)
                return text
        except Exception as e:
            logger.warning("[OCR] RapidOCR failed on image %s: %s", image_path, e)

    # Tier 2: No printed text — run fast multimodal visual analysis for imaging scans
    text = _vision_full_analysis(str(path))
    if text:
        return text

    logger.warning("[OCR] No text or visual findings could be extracted from image %s", image_path)
    return ""


_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".heic", ".heif"}
_IMAGE_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/bmp", "image/tiff", "image/webp", "image/heic", "image/heif",
}


def extract_text(file_path: str, content_type: Optional[str] = None) -> str:
    """
    Universal, format-agnostic entry point: routes any uploaded medical file — PDF
    or image, printed report or bare scan/photo — to the extraction/analysis
    strategy that fits its actual content. No specific report type (blood, urine,
    x-ray, MRI, CT, etc.) is special-cased here; that classification happens later,
    dynamically, inside the LLM pipeline.
    """
    if not file_path:
        return ""
    path = Path(file_path)
    if not path.exists():
        logger.warning("[OCR] File not found: %s", file_path)
        return ""

    suffix = path.suffix.lower()
    content_type = (content_type or "").lower().strip()

    if suffix == ".pdf" or content_type == "application/pdf":
        return extract_text_from_pdf(file_path)
    if suffix in _IMAGE_SUFFIXES or content_type in _IMAGE_CONTENT_TYPES or content_type.startswith("image/"):
        return extract_text_from_image(file_path)

    logger.warning("[OCR] Unsupported file type: %s (content_type=%s)", file_path, content_type or "unknown")
    return ""