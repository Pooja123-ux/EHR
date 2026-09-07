from typing import Optional
import base64
import logging
import re
from pathlib import Path

import ollama
from ollama import Client

logger = logging.getLogger(__name__)

OLLAMA_HOST = "http://localhost:11434"
_client = Client(host=OLLAMA_HOST)


def get_vision_model() -> Optional[str]:
    """Auto-detect available vision model, preferring fast 4B models."""
    try:
        models_resp = _client.list()
        if hasattr(models_resp, 'models'):
            model_names = [m.model for m in models_resp.models]
        else:
            model_names = [m.get("name", "") for m in models_resp.get("models", [])]
        for pref in ["gemma3:4b", "gemma3", "llava:13b", "llava"]:
            for name in model_names:
                if pref in name:
                    return name
    except Exception as e:
        logger.warning("[Vision] Failed to list models: %s", e)
    return None


def is_vision_available() -> bool:
    return get_vision_model() is not None


def analyze_image_with_type(image_path: str, prompt: Optional[str] = None) -> Optional[dict]:
    """Analyze image in a single fast multimodal inference call."""
    model_name = get_vision_model()
    if not model_name:
        return None

    try:
        image_bytes = Path(image_path).read_bytes()
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        if not prompt:
            prompt = (
                "You are an expert medical imaging assistant. Analyze this medical image in 2 to 4 concise sentences:\n"
                "1. State the exact modality and body part (e.g., 'Abdominal Ultrasound', 'Knee X-Ray', 'Brain MRI', 'Chest CT').\n"
                "2. Describe the key visual findings in simple, patient-friendly language.\n"
                "3. End with a reminder to consult their healthcare provider for medical interpretation."
            )

        response = _client.generate(
            model=model_name,
            prompt=prompt,
            images=[image_base64],
            options={"num_ctx": 2048, "temperature": 0.1},
        )
        analysis_text = response.get("response", "").strip()
        if not analysis_text:
            return None

        # Detect modality and body part from response
        detected_type = "Medical Imaging"
        for mod in ["Ultrasound", "X-Ray", "MRI", "CT Scan", "CT", "Echocardiogram", "Mammogram"]:
            if re.search(rf"\b{mod}\b", analysis_text, re.IGNORECASE):
                detected_type = mod
                break

        return {
            "detected_type": detected_type,
            "analysis": analysis_text,
        }
    except Exception as e:
        logger.error("[Vision] Image analysis failed: %s", e)
        return None


def analyze_image(image_path: str, prompt: Optional[str] = None) -> Optional[str]:
    """Legacy function for backward compatibility - returns just the analysis text."""
    result = analyze_image_with_type(image_path, prompt)
    return result.get("analysis") if result else None
