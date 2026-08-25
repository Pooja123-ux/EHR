"""
backend/app/services/text_extraction.py

High-performance document text extraction and OCR engine.

Strategy:
  PDF:
    1. Try native digital text extraction via PyMuPDF (fastest, preserves layout).
    2. If no/low text (scanned PDF), render pages to images and run RapidOCR (fast, high accuracy).
    3. Fallback to pypdf / vision models if needed.
  Images:
    1. Run RapidOCR on image files.
    2. Fallback to vision model (LLaVA / Gemma) if image contains radiological scan data.
"""
import logging
from pathlib import Path
from typing import Optional, List
import pymupdf

logger = logging.getLogger(__name__)

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
    """Fallback to multimodal vision model for radiological image analysis."""
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
                "If text is illegible, write '[illegible]' instead of guessing. "
                "Format as plain text with line breaks."
            ),
        )
        if result and result.get("analysis"):
            text = result["analysis"].strip()
            if text and len(text) > 5:
                logger.info("[OCR] Vision model extracted %d chars from %s", len(text), image_path)
                return text
    except Exception as e:
        logger.error("[OCR] Vision model OCR failed for %s: %s", image_path, e)
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

    # Tier 4: Vision model fallback
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


def extract_text_from_image(image_path: str) -> str:
    """Extract text from an image file using RapidOCR, with vision model fallback."""
    path = Path(image_path)
    if not path.exists():
        logger.warning("[OCR] Image not found: %s", image_path)
        return ""

    # Tier 1: RapidOCR on image
    engine = get_ocr_engine()
    if engine:
        try:
            image_bytes = path.read_bytes()
            text = _ocr_image_bytes(image_bytes)
            if text and len(text.strip()) > 10:
                logger.info("[OCR] RapidOCR extracted %d chars from image %s", len(text), image_path)
                return text
        except Exception as e:
            logger.warning("[OCR] RapidOCR failed on image %s: %s", image_path, e)

    # Tier 2: Vision model for image
    text = _ocr_image_with_llava(str(path))
    if text:
        return text

    logger.warning("[OCR] No text extracted from image %s", image_path)
    return ""


def extract_text(file_path: str, content_type: Optional[str] = None) -> str:
    """Universal text extraction entry point for PDFs and images."""
    if not file_path:
        return ""
    path = Path(file_path)
    if not path.exists():
        logger.warning("[OCR] File not found: %s", file_path)
        return ""

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}:
        return extract_text_from_image(file_path)
    logger.warning("[OCR] Unsupported file type: %s", file_path)
    return ""
