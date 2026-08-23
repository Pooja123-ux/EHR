"""
backend/app/services/text_extraction.py

Document text extraction utilities.

PDF:
  - Try direct text extraction first (text-based PDFs).
  - If that yields little/no text, try pdf2image OCR fallback if available.
  - Final fallback: render pages to images using pymupdf and use LLaVA to transcribe.

Images:
  - Use the existing LLaVA vision model to transcribe text from the image.
"""
import logging
from pathlib import Path
from typing import Optional

from app.services.vision_service import analyze_image_with_type, is_vision_available

logger = logging.getLogger(__name__)


def _ocr_image_with_llava(image_path: str) -> str:
    if not is_vision_available():
        logger.warning("[OCR] Vision model not available for image %s", image_path)
        return ""
    try:
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
                logger.info("[OCR] LLaVA extracted %d chars from %s", len(text), image_path)
                return text
            else:
                logger.warning("[OCR] LLaVA returned too little text (%d chars) from %s", len(text) if text else 0, image_path)
        else:
            logger.warning("[OCR] LLaVA returned no analysis for %s", image_path)
    except Exception as e:
        logger.error("[OCR] LLaVA failed for %s: %s", image_path, e)
    return ""


def _ocr_pdf_with_pdf2image(pdf_path: str, dpi: int = 300) -> str:
    try:
        from pdf2image import convert_from_path
    except Exception as e:
        logger.warning("[OCR] pdf2image not available: %s", e)
        return ""

    try:
        logger.info("[OCR] Converting PDF pages to images with pdf2image: %s", pdf_path)
        images = convert_from_path(pdf_path, dpi=dpi)
        text_parts = []
        for i, image in enumerate(images):
            tmp_path = Path(pdf_path).parent / f"_pdf2image_page_{i}.png"
            try:
                image.save(str(tmp_path))
                text = _ocr_image_with_llava(str(tmp_path))
                if text:
                    text_parts.append(text)
            except Exception as e:
                logger.error("[OCR] pdf2image page %d OCR failed: %s", i, e)
                continue
            finally:
                if tmp_path.exists():
                    try:
                        tmp_path.unlink()
                    except Exception:
                        pass

        result = "\n\n".join(text_parts).strip()
        if result:
            logger.info("[OCR] pdf2image OCR complete: %d chars from %d pages", len(result), len(text_parts))
        return result
    except Exception as e:
        logger.error("[OCR] pdf2image failed for %s: %s", pdf_path, e)
        return ""


def _ocr_pdf_with_llava(pdf_path: str, dpi: int = 200) -> str:
    try:
        import fitz  # pymupdf

        logger.info("[OCR] Opening PDF with pymupdf: %s", pdf_path)
        doc = fitz.open(pdf_path)
        logger.info("[OCR] PDF has %d pages", len(doc))

        text_parts = []
        for i, page in enumerate(doc):
            tmp_path = Path(pdf_path).parent / f"_vision_page_{i}.png"
            try:
                pix = page.get_pixmap(dpi=dpi)
                pix.save(str(tmp_path))
                text = _ocr_image_with_llava(str(tmp_path))
                if text:
                    text_parts.append(text)
            except Exception as e:
                logger.error("[OCR] Failed to process page %d: %s", i, e)
                continue
            finally:
                if tmp_path.exists():
                    try:
                        tmp_path.unlink()
                    except Exception:
                        pass

        doc.close()
        result = "\n\n".join(text_parts).strip()
        if result:
            logger.info("[OCR] PDF OCR complete: %d chars from %d pages", len(result), len(text_parts))
        return result
    except Exception as e:
        logger.error("[OCR] pymupdf failed for %s: %s", pdf_path, e)
        return ""


def extract_text_from_pdf(pdf_path: str, min_text_length: int = 30) -> str:
    path = Path(pdf_path)
    if not path.exists():
        logger.warning("[OCR] PDF not found: %s", pdf_path)
        return ""

    text_parts = []
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            if page_text.strip():
                text_parts.append(page_text.strip())
    except Exception as e:
        logger.warning("[OCR] pypdf failed for %s: %s", pdf_path, e)

    full_text = "\n\n".join(text_parts).strip()
    if len(full_text) >= min_text_length:
        logger.info("[OCR] pypdf extracted %d chars from %s", len(full_text), pdf_path)
        return full_text

    logger.info("[OCR] pypdf found no text in %s, trying pdf2image OCR", pdf_path)
    ocr_text = _ocr_pdf_with_pdf2image(str(path))
    if ocr_text and len(ocr_text) >= min_text_length:
        return ocr_text

    logger.info("[OCR] pdf2image failed or unavailable for %s, trying LLaVA OCR with pymupdf", pdf_path)
    ocr_text = _ocr_pdf_with_llava(str(path))
    if ocr_text and len(ocr_text) >= min_text_length:
        return ocr_text

    logger.warning("[OCR] All methods failed for %s", pdf_path)
    return ""


def extract_text_from_image(image_path: str) -> str:
    path = Path(image_path)
    if not path.exists():
        logger.warning("[OCR] Image not found: %s", image_path)
        return ""

    text = _ocr_image_with_llava(str(path))
    if text:
        return text

    logger.warning("[OCR] LLaVA returned no text for image %s", image_path)
    return ""


def extract_text(file_path: str, content_type: Optional[str] = None) -> str:
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
