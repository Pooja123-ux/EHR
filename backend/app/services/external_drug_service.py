"""
External drug interaction evidence service.

Provides fallback interaction evidence from external APIs:
1. OpenFDA drug label API
2. RxNav interaction API

All results are cached locally to minimize external API calls.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional
import requests

logger = logging.getLogger(__name__)

# Configuration
OPENFDA_BASE_URL = "https://api.fda.gov/drug/label.json"
RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov/REST"
TIMEOUT = 15  # seconds

# Local cache
_CACHE_DIR = Path(__file__).resolve().parent / "cache"
_CACHE_DIR.mkdir(exist_ok=True)
_EXTERNAL_CACHE_FILE = _CACHE_DIR / "external_drug_cache.json"
_EXTERNAL_CACHE_TTL = 24 * 60 * 60  # 24 hours

_external_cache: dict[str, dict] = {}
_external_cache_loaded = False


def _load_external_cache() -> None:
    """Load external API cache from disk."""
    global _external_cache_loaded, _external_cache
    if _external_cache_loaded:
        return
    try:
        if _EXTERNAL_CACHE_FILE.exists():
            with open(_EXTERNAL_CACHE_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                cutoff = time.time() - _EXTERNAL_CACHE_TTL
                _external_cache = {
                    k: v for k, v in raw.items()
                    if v.get("cached_at", 0) > cutoff
                }
    except Exception:
        _external_cache = {}
    _external_cache_loaded = True


def _save_external_cache() -> None:
    """Persist external API cache to disk."""
    try:
        with open(_EXTERNAL_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_external_cache, f)
    except Exception:
        pass


def _cache_key(drug1: str, drug2: str) -> str:
    """Generate cache key for a drug pair."""
    return f"{drug1.lower()}||{drug2.lower()}"


def search_open_fda_interactions(drug1: str, drug2: str) -> Optional[dict]:
    """
    Search OpenFDA drug labels for interaction information.

    Returns dict with 'found', 'evidence', 'source' if interaction info found.
    Returns None if no data or API error.
    """
    _load_external_cache()

    cache_key = _cache_key(drug1, drug2)
    if cache_key in _external_cache:
        return _external_cache[cache_key].get("data")

    try:
        # Search for drug labels mentioning both drugs
        # OpenFDA drug label API searches active ingredient field
        search_query = f'active_ingredient:"{drug1}"+active_ingredient:"{drug2}"'
        url = f"{OPENFDA_BASE_URL}?search={search_query}&limit=5"

        resp = requests.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        if not results:
            logger.info("[EXTERNAL] OpenFDA: no joint label found for %s + %s", drug1, drug2)
            _external_cache[cache_key] = {"cached_at": time.time(), "data": None}
            _save_external_cache()
            return None

        # Extract interaction-related sections
        evidence_parts = []
        for result in results:
            # Check for drug interactions section
            interactions = result.get("drug_interactions", [])
            if interactions:
                evidence_parts.append(str(interactions[0])[:500])

            # Check for warnings section
            warnings = result.get("warnings", [])
            if warnings:
                evidence_parts.append(str(warnings[0])[:300])

            # Check for precautions
            precautions = result.get("precautions", [])
            if precautions:
                evidence_parts.append(str(precautions[0])[:300])

        if evidence_parts:
            result = {
                "found": True,
                "evidence": "\n\n".join(evidence_parts[:3]),
                "source": "OpenFDA Drug Labels",
                "note": "This information is from FDA drug labels and is for reference only.",
            }
            _external_cache[cache_key] = {"cached_at": time.time(), "data": result}
            _save_external_cache()
            return result

        logger.info("[EXTERNAL] OpenFDA: no interaction section found for %s + %s", drug1, drug2)
        _external_cache[cache_key] = {"cached_at": time.time(), "data": None}
        _save_external_cache()
        return None

    except Exception as e:
        logger.warning("[EXTERNAL] OpenFDA failed for %s + %s: %s", drug1, drug2, e)
        return None


def search_open_fda_interactions_individual(drug1: str, drug2: str) -> Optional[dict]:
    """
    Search OpenFDA drug labels individually for each drug and look for interactions.

    This is a fallback when joint search returns no results.
    """
    _load_external_cache()

    cache_key = f"openfda_individual_{_cache_key(drug1, drug2)}"
    if cache_key in _external_cache:
        return _external_cache[cache_key].get("data")

    try:
        evidence_parts = []

        # Search for drug1 labels
        for drug in [drug1, drug2]:
            search_query = f'active_ingredient:"{drug}"'
            url = f"{OPENFDA_BASE_URL}?search={search_query}&limit=3"

            resp = requests.get(url, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            for result in results:
                interactions = result.get("drug_interactions", [])
                if interactions:
                    text = str(interactions[0])
                    if drug2.lower() in text.lower() or drug1.lower() in text.lower():
                        evidence_parts.append(f"[{drug}] {text[:400]}")

                warnings = result.get("warnings", [])
                if warnings:
                    text = str(warnings[0])
                    if drug2.lower() in text.lower() or drug1.lower() in text.lower():
                        evidence_parts.append(f"[{drug}] {text[:300]}")

        if evidence_parts:
            result = {
                "found": True,
                "evidence": "\n\n".join(evidence_parts[:4]),
                "source": "OpenFDA Drug Labels (individual)",
                "note": "This information is from FDA drug labels and is for reference only.",
            }
            _external_cache[cache_key] = {"cached_at": time.time(), "data": result}
            _save_external_cache()
            return result

        _external_cache[cache_key] = {"cached_at": time.time(), "data": None}
        _save_external_cache()
        return None

    except Exception as e:
        logger.warning("[EXTERNAL] OpenFDA individual search failed for %s + %s: %s", drug1, drug2, e)
        return None


def search_rxnav_interactions(drug1: str, drug2: str) -> Optional[dict]:
    """
    Search RxNav for known drug interactions.

    Returns dict with interaction info if found, None otherwise.
    """
    _load_external_cache()

    cache_key = f"rxnav_{_cache_key(drug1, drug2)}"
    if cache_key in _external_cache:
        return _external_cache[cache_key].get("data")

    try:
        # RxNav interaction API
        # First get RxCUIs for both drugs
        url1 = f"{RXNORM_BASE_URL}/rxcui.json?name={drug1}"
        url2 = f"{RXNORM_BASE_URL}/rxcui.json?name={drug2}"

        resp1 = requests.get(url1, timeout=TIMEOUT)
        resp2 = requests.get(url2, timeout=TIMEOUT)
        resp1.raise_for_status()
        resp2.raise_for_status()

        rxcui1 = resp1.json().get("idGroup", {}).get("rxnormId", [None])[0]
        rxcui2 = resp2.json().get("idGroup", {}).get("rxnormId", [None])[0]

        if not rxcui1 or not rxcui2:
            logger.info("[EXTERNAL] RxNav: no RxCUI for %s or %s", drug1, drug2)
            return None

        # Check for interactions
        url = f"{RXNORM_BASE_URL}/interaction/interaction.json?rxcui={rxcui1}&rxcui={rxcui2}"
        resp = requests.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        interactions = data.get("interactionTypeGroup", [{}])[0].get("interactionType", [{}])[0].get("interactionPair", [])

        if interactions:
            # Get the most severe interaction
            pair = interactions[0]
            severity = pair.get("severity", "Unknown")
            description = pair.get("description", "")

            result = {
                "found": True,
                "evidence": description,
                "severity": severity,
                "source": "RxNav/NIH",
                "note": "This information is from RxNav (NIH) and is for reference only.",
            }
            _external_cache[cache_key] = {"cached_at": time.time(), "data": result}
            _save_external_cache()
            return result

        logger.info("[EXTERNAL] RxNav: no interaction found for %s + %s", drug1, drug2)
        _external_cache[cache_key] = {"cached_at": time.time(), "data": None}
        _save_external_cache()
        return None

    except Exception as e:
        logger.warning("[EXTERNAL] RxNav failed for %s + %s: %s", drug1, drug2, e)
        return None


def get_external_evidence(drug1: str, drug2: str) -> Optional[dict]:
    """
    Get external evidence for drug interaction from multiple sources.

    Tries RxNav first, then OpenFDA joint search, then individual label search.
    Returns None if no evidence found or all APIs fail.
    """
    # Try RxNav first (most specific for interactions)
    result = search_rxnav_interactions(drug1, drug2)
    if result:
        return result

    # Try OpenFDA joint label search
    result = search_open_fda_interactions(drug1, drug2)
    if result:
        return result

    # Fall back to OpenFDA individual label search
    result = search_open_fda_interactions_individual(drug1, drug2)
    if result:
        return result

    return None


def clear_cache() -> None:
    """Clear external API cache (for testing/debugging)."""
    global _external_cache, _external_cache_loaded
    _external_cache = {}
    _external_cache_loaded = False
    try:
        if _EXTERNAL_CACHE_FILE.exists():
            _EXTERNAL_CACHE_FILE.unlink()
    except Exception:
        pass
