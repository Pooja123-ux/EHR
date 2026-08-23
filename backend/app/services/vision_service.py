from typing import Optional
import base64
from pathlib import Path

import ollama
from ollama import Client

OLLAMA_HOST = "http://localhost:11434"
VISION_MODEL = "llava:13b"
_client = Client(host=OLLAMA_HOST)


def is_vision_available() -> bool:
    try:
        models_resp = _client.list()
        # Handle both dict and ListResponse object formats
        if hasattr(models_resp, 'models'):
            model_names = [m.model for m in models_resp.models]
        else:
            model_names = [m.get("name", "") for m in models_resp.get("models", [])]
        return any(VISION_MODEL in name for name in model_names)
    except Exception:
        return False


def _identify_image_type(image_base64: str) -> str:
    """Identify the medical image type and body part."""
    identification_prompt = (
        "You are a radiology assistant. Identify this medical image.\n"
        "Respond with EXACTLY this format: '<Modality> - <Body Part>'\n"
        "Examples: 'X-ray - Knee', 'X-ray - Chest', 'MRI - Brain', 'CT - Abdomen', 'Ultrasound - Abdomen'\n"
        "If unsure, use 'Unknown - Unknown'. Do not add explanations or extra text."
    )
    try:
        response = _client.generate(
            model=VISION_MODEL,
            prompt=identification_prompt,
            images=[image_base64],
        )
        text = response.get("response", "").strip()
        return text if text else ""
    except Exception:
        return ""


def _normalize_detected_type(detected: str) -> str:
    if not detected or detected.lower() == "unknown - unknown":
        return ""
    if " - " in detected:
        parts = detected.split(" - ", 1)
        modality = parts[0].strip()
        body_part = parts[1].strip()
        if modality and body_part:
            return f"{body_part} {modality}"
    return detected.strip()


def analyze_image_with_type(image_path: str, prompt: Optional[str] = None) -> Optional[dict]:
    """Analyze image and return both detected type and analysis."""
    if not is_vision_available():
        return None

    try:
        image_bytes = Path(image_path).read_bytes()
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        
        detected_type = _identify_image_type(image_base64)
        normalized_type = _normalize_detected_type(detected_type)
        
        if not prompt:
            prompt = (
                "You are a medical imaging assistant. Analyze this medical image.\n"
                "First, explicitly state what type of image and body part this is "
                "(for example: 'Knee X-ray', 'Chest CT', 'Abdominal ultrasound').\n"
                "Then describe any visible findings or abnormalities in simple terms.\n"
                "- Only describe what you actually see; do not assume findings that aren't visible.\n"
                "- Do not give a definitive diagnosis.\n"
                "- Always recommend consulting a radiologist or doctor.\n"
                "- Keep the response concise and patient-friendly."
            )
        
        response = _client.generate(
            model=VISION_MODEL,
            prompt=prompt,
            images=[image_base64],
        )
        analysis_text = response.get("response", "").strip()
        
        if normalized_type and analysis_text and not analysis_text.lower().startswith(normalized_type.lower()):
            analysis_text = f"{normalized_type}. {analysis_text}"
        
        return {
            "detected_type": normalized_type,
            "analysis": analysis_text if analysis_text else None
        }
    except Exception as e:
        print(f"[Vision] Image analysis failed: {e}")
        return None


def analyze_image(image_path: str, prompt: Optional[str] = None) -> Optional[str]:
    """Legacy function for backward compatibility - returns just the analysis text."""
    result = analyze_image_with_type(image_path, prompt)
    return result.get("analysis") if result else None
