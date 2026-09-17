"""
Drug name normalization service.

Normalizes user-entered drug names to canonical forms using:
1. Local alias dictionary (brand -> generic, common misspellings)
2. RxNorm API (NIH) for authoritative normalization
3. Local in-memory + file cache
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional
import requests

# Local synonym dictionary: lowercased alias -> canonical name
LOCAL_ALIASES: dict[str, str] = {
    # Common brand -> generic mappings
    "tylenol": "paracetamol",
    "acetaminophen": "paracetamol",
    "panadol": "paracetamol",
    "calpol": "paracetamol",
    "advil": "ibuprofen",
    "motrin": "ibuprofen",
    "nurofen": "ibuprofen",
    "brufen": "ibuprofen",
    "aspirin": "aspirin",
    "bayer aspirin": "aspirin",
    "ecotrin": "aspirin",
    "lipitor": "atorvastatin",
    "crestor": "rosuvastatin",
    "zocor": "simvastatin",
    "plavix": "clopidogrel",
    "effient": "prasugrel",
    "brilinta": "ticagrelor",
    "nexium": "esomeprazole",
    "prilosec": "omeprazole",
    "prevacid": "lansoprazole",
    "protonix": "pantoprazole",
    "zantac": "ranitidine",
    "pepcid": "famotidine",
    "glucophage": "metformin",
    "januvia": "sitagliptin",
    "ostrin": "insulin",
    "lantus": "insulin",
    "humulin": "insulin",
    "novolin": "insulin",
    "levoxyl": "levothyroxine",
    "synthroid": "levothyroxine",
    "eltroxin": "levothyroxine",
    "cozaar": "losartan",
    "diovan": "valsartan",
    "norvasc": "amlodipine",
    "cardizem": "diltiazem",
    "tenormin": "atenolol",
    "lopressor": "metoprolol",
    "toprol": "metoprolol",
    "coreg": "carvedilol",
    "zestril": "lisinopril",
    "prinivil": "lisinopril",
    "lasix": "furosemide",
    "aldactone": "spironolactone",
    "hydrodiuril": "hydrochlorothiazide",
    "microzide": "hydrochlorothiazide",
    "keppra": "levetiracetam",
    "neurontin": "gabapentin",
    "lyrica": "pregabalin",
    "dilantin": "phenytoin",
    "tegretol": "carbamazepine",
    "lamictal": "lamotrigine",
    "trileptal": "oxcarbazepine",
    "seroquel": "quetiapine",
    "risperdal": "risperidone",
    "zyprexa": "olanzapine",
    "abilify": "aripiprazole",
    "celexa": "citalopram",
    "lexapro": "escitalopram",
    "prozac": "fluoxetine",
    "sarafem": "fluoxetine",
    "paxil": "paroxetine",
    "zoloft": "sertraline",
    "effexor": "venlafaxine",
    "cymbalta": "duloxetine",
    "wellbutrin": "bupropion",
    "cymbalta": "duloxetine",
    "ativan": "lorazepam",
    "valium": "diazepam",
    "xanax": "alprazolam",
    "klonopin": "clonazepam",
    "ambien": "zolpidem",
    "benadryl": "diphenhydramine",
    "zyrtec": "cetirizine",
    "claritin": "loratadine",
    "allegra": "fexofenadine",
    "singulair": "montelukast",
    "flonase": "fluticasone",
    "nasonex": "mometasone",
    "albuterol": "salbutamol",
    "proair": "salbutamol",
    "ventolin": "salbutamol",
    "atrovent": "ipratropium",
    "spiriva": "tiotropium",
    "cozaar": "losartan",
    "hyzaar": "losartan",
    "diovan hct": "valsartan",
    "microzide": "hydrochlorothiazide",
    "accupril": "quinapril",
    "aceon": "perindopril",
    "lotensin": "benazepril",
    "vasotec": "enalapril",
    "altace": "ramipril",
    "mavik": "trandolapril",
    "univasc": "moexipril",
    "fosinopril": "fosinopril",
    "monopril": "fosinopril",
    "betapace": "sotalol",
    "cordarone": "amiodarone",
    "pacerone": "amiodarone",
    "multaq": "dronedarone",
    "tikosyn": "flecainide",
    "propafenone": "propafenone",
    "lanoxin": "digoxin",
    "coumadin": "warfarin",
    "jantoven": "warfarin",
    "pradaxa": "dabigatran",
    "eliquis": "apixaban",
    "xarelto": "rivaroxaban",
    "savaysa": "edoxaban",
    "lovenox": "enoxaparin",
    "fragmin": "dalteparin",
    "innohep": "tinzaparin",
    "reclast": "zoledronic acid",
    "actonel": "risedronate",
    "fosamax": "alendronate",
    "boniva": "ibandronate",
    "prolia": "denosumab",
    "evista": "raloxifene",
    "prempro": "conjugated estrogens",
    "estrace": "estradiol",
    "prometrium": "progesterone",
    "viagra": "sildenafil",
    "cialis": "tadalafil",
    "levitra": "vardenafil",
    "staxyn": "vardenafil",
    "comviq": "vardenafil",
    "kamagra": "sildenafil",
    "caverject": "alprostadil",
    "cialis": "tadalafil",
    "addyi": "flibanserin",
    "vyleesi": "bremelanotide",
    "nexplanon": "etonogestrel",
    "implanon": "etonogestrel",
    "mirena": "levonorgestrel",
    "skyla": "levonorgestrel",
    "paragard": "copper",
    "yaz": "drospirenone",
    "yasmin": "drospirenone",
    "alyacen": "norethindrone",
    "femcon": "norethindrone",
    "norgestrel": "norgestrel",
    "ovrette": "norgestrel",
    "plan b": "levonorgestrel",
    "ella": "ulipristal",
    "depo-provera": "medroxyprogesterone",
    "depo-subq": "medroxyprogesterone",
    "lumigan": "bimatoprost",
    "restasis": "cyclosporine",
    "xalatan": "latanoprost",
    "travatan": "travoprost",
    "zioptan": "tafluprost",
    "combigan": "brimonidine",
    "alphagan": "brimonidine",
    "cosopt": "dorzolamide",
    "trusopt": "dorzolamide",
    "azopt": "brinzolamide",
    "pilopine": "pilocarpine",
    "isoptocarpine": "pilocarpine",
    "ocuclear": "naphazoline",
    "opcon": "naphazoline",
    "vasoconstrictor": "naphazoline",
    "blephamide": "sulfacetamide",
    "bacitracin": "bacitracin",
    "polymyxin b": "polymyxin b",
    "neosporin": "neomycin",
    "terramycin": "oxytetracycline",
    "cipro": "ciprofloxacin",
    "levaquin": "levofloxacin",
    "avelox": "moxifloxacin",
    "floxin": "ofloxacin",
    "noroxin": "norfloxacin",
    "macrodantin": "nitrofurantoin",
    "macrobid": "nitrofurantoin",
    "septra": "trimethoprim",
    "bactrim": "trimethoprim",
    "septra ds": "trimethoprim",
    "bactrim ds": "trimethoprim",
    "keflex": "cephalexin",
    "cefalea": "cephalexin",
    "duracef": "cefadroxil",
    "duricef": "cefadroxil",
    "suprax": "cefixime",
    "rocephin": "ceftriaxone",
    "claforan": "cefotaxime",
    "fortaz": "ceftazidime",
    "tazicef": "ceftazidime",
    "ceptaz": "ceftazidime",
    "cefuroxime": "cefuroxime",
    "zinacef": "cefuroxime",
    "cefepime": "cefepime",
    "maxipime": "cefepime",
    "azithromycin": "azithromycin",
    "zithromax": "azithromycin",
    "zmax": "azithromycin",
    "clarithromycin": "clarithromycin",
    "biaxin": "clarithromycin",
    "erythromycin": "erythromycin",
    "ery-tab": "erythromycin",
    "eryped": "erythromycin",
    "clindamycin": "clindamycin",
    "cleocin": "clindamycin",
    "vancomycin": "vancomycin",
    "vancocin": "vancomycin",
    "fucidin": "fusidic acid",
    "fusidic acid": "fusidic acid",
    "fucidin hc": "fusidic acid",
    "gentamicin": "gentamicin",
    "garamycin": "gentamicin",
    "tobramycin": "tobramycin",
    "nebcin": "tobramycin",
    "amikacin": "amikacin",
    "amikin": "amikacin",
    "streptomycin": "streptomycin",
    "kanamycin": "kanamycin",
    "neomycin": "neomycin",
    "neosporin": "neomycin",
    "colistin": "colistin",
    "polymyxin": "polymyxin b",
    "bacitracin": "bacitracin",
    "gramicidin": "gramicidin",
    "neomycin": "neomycin",
    "nystatin": "nystatin",
    "mycostatin": "nystatin",
    "nilstat": "nystatin",
    "nystat": "nystatin",
    "clotrimazole": "clotrimazole",
    "lotrimin": "clotrimazole",
    "mycelex": "clotrimazole",
    "miconazole": "miconazole",
    "monistat": "miconazole",
    "desenex": "miconazole",
    "ketoconazole": "ketoconazole",
    "nizoral": "ketoconazole",
    "fluconazole": "fluconazole",
    "diflucan": "fluconazole",
    "itraconazole": "itraconazole",
    "sporanox": "itraconazole",
    "voriconazole": "voriconazole",
    "vfend": "voriconazole",
    "posaconazole": "posaconazole",
    "posanol": "posaconazole",
    "caspofungin": "caspofungin",
    "cancidas": "caspofungin",
    "micafungin": "micafungin",
    "mycamine": "micafungin",
    "amphotericin": "amphotericin b",
    "fungizone": "amphotericin b",
    "abelcet": "amphotericin b",
    "amphotec": "amphotericin b",
    "nystatin": "nystatin",
    "flucytosine": "flucytosine",
    "ancobon": "flucytosine",
    "griseofulvin": "griseofulvin",
    "grifulvin": "griseofulvin",
    "terbinafine": "terbinafine",
    "lamisil": "terbinafine",
    "terbinafine hcl": "terbinafine",
    "ciclopirox": "ciclopirox",
    "loprox": "ciclopirox",
    "penlac": "ciclopirox",
    "amorolfine": "amorolfine",
    "loceryl": "amorolfine",
    "econazole": "econazole",
    "spectazole": "econazole",
    "haloprogin": "haloprogin",
    "halotex": "haloprogin",
    "tolnaftate": "tolnaftate",
    "tinactin": "tolnaftate",
    "gentian violet": "gentian violet",
    "methylene blue": "methylene blue",
    "potassium permanganate": "potassium permanganate",
    "acetic acid": "acetic acid",
    "acetic acid otic": "acetic acid",
    "carbamide peroxide": "carbamide peroxide",
    "debrox": "carbamide peroxide",
    "cerumenex": "carbamide peroxide",
    "waxsol": "docusate sodium",
    "docusate": "docusate sodium",
    "colace": "docusate sodium",
    "surfak": "docusate sodium",
    "dulcolax": "bisacodyl",
    "correctol": "bisacodyl",
    "senokot": "sennosides",
    "senna": "sennosides",
    "senna laxative": "sennosides",
    "castor oil": "castor oil",
    "milk of magnesia": "magnesium hydroxide",
    "milk of magnesia laxative": "magnesium hydroxide",
    "magnesium citrate": "magnesium citrate",
    "citroma": "magnesium citrate",
    "magnesium hydroxide": "magnesium hydroxide",
    "phillips milk of magnesia": "magnesium hydroxide",
    "polyethylene glycol": "polyethylene glycol",
    "miralax": "polyethylene glycol",
    "glycolax": "polyethylene glycol",
    "lactulose": "lactulose",
    "cephulac": "lactulose",
    "generlac": "lactulose",
    "enulose": "lactulose",
    "rifaximin": "rifaximin",
    "xifaxan": "rifaximin",
    "loperamide": "loperamide",
    "imodium": "loperamide",
    "kaopectate": "attapulgite",
    "kaolin": "attapulgite",
    "pectin": "pectin",
    "diphenoxylate": "diphenoxylate",
    "lomotil": "diphenoxylate",
    "atropine sulfate": "atropine sulfate",
    "atropine": "atropine sulfate",
    "atropine injection": "atropine sulfate",
    "atropine ophthalmic": "atropine sulfate",
    "atropine rectal": "atropine sulfate",
    "atropine ophthalmic ointment": "atropine sulfate",
    "atropine ophthalmic solution": "atropine sulfate",
    "atropine sulfate injection": "atropine sulfate",
    "atropine sulfate ophthalmic": "atropine sulfate",
    "atropine sulfate rectal": "atropine sulfate",
    "atropine sulfate ophthalmic ointment": "atropine sulfate",
    "atropine sulfate ophthalmic solution": "atropine sulfate",
}

# RxNorm API configuration
RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov/REST"
RXNORM_TIMEOUT = 10  # seconds

# Local cache file
_CACHE_DIR = Path(__file__).resolve().parent / "cache"
_CACHE_DIR.mkdir(exist_ok=True)
_RXNORM_CACHE_FILE = _CACHE_DIR / "rxnorm_cache.json"
_RXNORM_CACHE_TTL = 7 * 24 * 60 * 60  # 7 days in seconds

_rxnorm_cache: dict[str, dict] = {}
_rxnorm_cache_loaded = False


def _load_rxnorm_cache() -> None:
    """Load RxNorm cache from disk."""
    global _rxnorm_cache_loaded, _rxnorm_cache
    if _rxnorm_cache_loaded:
        return
    try:
        if _RXNORM_CACHE_FILE.exists():
            with open(_RXNORM_CACHE_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                cutoff = time.time() - _RXNORM_CACHE_TTL
                _rxnorm_cache = {
                    k: v for k, v in raw.items()
                    if v.get("cached_at", 0) > cutoff
                }
    except Exception:
        _rxnorm_cache = {}
    _rxnorm_cache_loaded = True


def _save_rxnorm_cache() -> None:
    """Persist RxNorm cache to disk."""
    try:
        with open(_RXNORM_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_rxnorm_cache, f)
    except Exception:
        pass


def _normalize_text(text: str) -> str:
    """Basic normalization: lowercase, collapse whitespace, strip."""
    if not text:
        return ""
    return " ".join(str(text).strip().lower().split())


def normalize_drug_name(name: str) -> str:
    """
    Normalize a drug name to canonical form.

    Steps:
    1. Basic text normalization
    2. Local alias lookup
    3. RxNorm API lookup (if available)
    4. Return best available canonical name
    """
    if not name or not str(name).strip():
        return ""

    normalized = _normalize_text(name)

    # Step 1: Local alias dictionary
    if normalized in LOCAL_ALIASES:
        return LOCAL_ALIASES[normalized]

    # Step 2: Check if already canonical (exists in local dataset)
    # This avoids unnecessary API calls for known drugs
    try:
        from app.api.patient import _ALL_DRUGS
        if normalized in [d.lower() for d in _ALL_DRUGS]:
            return normalized
    except Exception:
        pass

    # Step 3: RxNorm API lookup
    rxnorm_name = _lookup_rxnorm(normalized)
    if rxnorm_name:
        return rxnorm_name

    # Step 4: Return normalized input as fallback
    return normalized


def _lookup_rxnorm(name: str) -> Optional[str]:
    """
    Query RxNorm API for canonical drug name.
    Returns the primary RxNorm name if found, None otherwise.
    """
    _load_rxnorm_cache()

    # Check cache first
    if name in _rxnorm_cache:
        entry = _rxnorm_cache[name]
        if entry.get("cached_at", 0) > time.time() - _RXNORM_CACHE_TTL:
            return entry.get("canonical")

    try:
        # RxNorm exact match API
        url = f"{RXNORM_BASE_URL}/rxcui.json?name={name}"
        resp = requests.get(url, timeout=RXNORM_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        # Extract RxCUI
        rxcui = data.get("idGroup", {}).get("rxnormId", [None])[0]
        if not rxcui:
            # Try approximate match
            url = f"{RXNORM_BASE_URL}/approximateTerm.json?term={name}&maxEntries=1"
            resp = requests.get(url, timeout=RXNORM_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            rxcui = data.get("approximateGroup", {}).get("candidate", [{}])[0].get("rxcui")

        if not rxcui:
            _rxnorm_cache[name] = {"cached_at": time.time(), "canonical": None}
            _save_rxnorm_cache()
            return None

        # Get canonical name from RxCUI
        url = f"{RXNORM_BASE_URL}/rxcui/{rxcui}/properties.json"
        resp = requests.get(url, timeout=RXNORM_TIMEOUT)
        resp.raise_for_status()
        props = resp.json().get("properties", {})
        canonical = props.get("name")

        if canonical:
            canonical = _normalize_text(canonical)
            _rxnorm_cache[name] = {"cached_at": time.time(), "canonical": canonical}
            _save_rxnorm_cache()
            return canonical

        _rxnorm_cache[name] = {"cached_at": time.time(), "canonical": None}
        _save_rxnorm_cache()
        return None

    except Exception:
        return None


def get_normalization_info(name: str) -> dict:
    """
    Get detailed normalization information for debugging/display.
    Returns dict with original, normalized, source, and rxnorm_id if available.
    """
    original = name
    normalized = normalize_drug_name(name)
    source = "unknown"

    if _normalize_text(name) in LOCAL_ALIASES:
        source = "local_alias"
    elif normalized != _normalize_text(name):
        source = "rxnorm"
    elif normalized == _normalize_text(name):
        source = "passthrough"

    return {
        "original": original,
        "normalized": normalized,
        "source": source,
    }
