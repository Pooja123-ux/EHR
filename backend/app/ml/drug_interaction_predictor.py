from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

MODEL_PATH = Path(__file__).resolve().parent / "drug_interaction_model.joblib"
DATASET_PATH = Path(__file__).resolve().parents[2] / "datasets" / "drug_interactions.csv"

SAFE_PHRASES = [
    "no significant",
    "no known",
    "no interaction",
    "no direct interaction",
    "can be alternated",
    "safe",
]
HIGH_RISK_PHRASES = [
    "significantly",
    "greatly increases",
    "risk or severity",
    "serotonin syndrome",
    "bleeding",
    "cardiotoxic",
    "fatal",
    "life-threatening",
    "heart block",
    "av block",
    "severe",
]
MODERATE_PHRASES = [
    "may increase",
    "may decrease",
    "can be increased",
    "can be decreased",
    "metabolism",
    "serum concentration",
    "reduce the effectiveness",
    "may reduce",
    "increase the effectiveness",
    "monitor",
    "effectiveness",
]

_MODEL: dict[str, Any] | None = None


def normalize_medicine_value(value: str) -> str:
    return " ".join(value.strip().lower().split())


def build_drug_pair_key(first: str, second: str) -> tuple[str, str]:
    normalized = sorted([normalize_medicine_value(first), normalize_medicine_value(second)])
    return normalized[0], normalized[1]


def get_distinct_drugs() -> list[str]:
    df = _load_dataset()
    values = set(df["drug1"].tolist() + df["drug2"].tolist())
    return sorted([value.title() for value in values if value.strip()])


def infer_interaction_level(description: str) -> str:
    text = description.lower()

    if any(phrase in text for phrase in SAFE_PHRASES):
        return "Safe"
    if any(phrase in text for phrase in HIGH_RISK_PHRASES):
        return "High Risk"
    if any(phrase in text for phrase in MODERATE_PHRASES):
        return "Moderate"
    return "Moderate"


def _load_dataset() -> pd.DataFrame:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Drug interaction dataset not found at {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)
    required = {"Drug 1", "Drug 2", "Interaction Description"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"Dataset must contain columns: {sorted(required)}")

    df = df.rename(columns={"Drug 1": "drug1", "Drug 2": "drug2", "Interaction Description": "description"})
    df["drug1"] = df["drug1"].astype(str).map(normalize_medicine_value)
    df["drug2"] = df["drug2"].astype(str).map(normalize_medicine_value)
    df["description"] = df["description"].astype(str).str.strip()
    df["interaction_level"] = df["description"].apply(infer_interaction_level)
    return df


def train_drug_interaction_model() -> dict[str, Any]:
    df = _load_dataset()
    dataset_map: dict[tuple[str, str], dict[str, str]] = {}

    for _, row in df.iterrows():
        key = build_drug_pair_key(row["drug1"], row["drug2"])
        dataset_map[key] = {
            "description": row["description"],
            "level": row["interaction_level"],
        }

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), token_pattern=r"(?u)\b\w+\b")
    classifier = LogisticRegression(max_iter=5000)
    pipeline = Pipeline([
        ("vectorizer", vectorizer),
        ("classifier", classifier),
    ])

    features = df["drug1"] + " || " + df["drug2"]
    pipeline.fit(features, df["interaction_level"])

    model = {
        "pipeline": pipeline,
        "dataset_map": dataset_map,
    }
    joblib.dump(model, MODEL_PATH)
    return model


def load_drug_interaction_model() -> dict[str, Any]:
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)
    return train_drug_interaction_model()


def get_drug_interaction_model() -> dict[str, Any]:
    global _MODEL
    if _MODEL is None:
        _MODEL = load_drug_interaction_model()
    return _MODEL


def _format_prediction(drug1: str, drug2: str, level: str, description: str, alternative: str | None = None) -> dict[str, str | None]:
    return {
        "medicine1": drug1.strip(),
        "medicine2": drug2.strip(),
        "interaction_level": level,
        "description": description,
        "suggested_alternative": alternative,
    }


def predict_drug_interaction(drug1: str, drug2: str) -> dict[str, str | None]:
    model = get_drug_interaction_model()
    key = build_drug_pair_key(drug1, drug2)
    dataset_map = model["dataset_map"]

    if key in dataset_map:
        record = dataset_map[key]
        alternative = None
        if record["level"] == "High Risk":
            alternative = "Ask your healthcare provider before taking these medicines together."
        elif record["level"] == "Moderate":
            alternative = "Talk to a pharmacist or doctor before combining these medicines."

        return _format_prediction(drug1.title(), drug2.title(), record["level"], record["description"], alternative)

    text = f"{normalize_medicine_value(drug1)} || {normalize_medicine_value(drug2)}"
    level = model["pipeline"].predict([text])[0]
    description = (
        f"Estimated interaction risk based on trained dataset knowledge: {level}. "
        "No exact match was found in the drug interactions database."
    )
    alternative = (
        None if level == "Safe"
        else "Speak to a clinician before combining these medicines."
    )
    return _format_prediction(drug1.title(), drug2.title(), level, description, alternative)


def predict_drug_interaction_with_confidence(drug1: str, drug2: str) -> dict[str, Any]:
    model = get_drug_interaction_model()
    key = build_drug_pair_key(drug1, drug2)
    dataset_map = model["dataset_map"]

    if key in dataset_map:
        record = dataset_map[key]
        alternative = None
        if record["level"] == "High Risk":
            alternative = "Ask your healthcare provider before taking these medicines together."
        elif record["level"] == "Moderate":
            alternative = "Talk to a pharmacist or doctor before combining these medicines."
        return {
            "level": record["level"],
            "description": record["description"],
            "confidence": 1.0,
            "source": "verified_dataset",
            "alt": alternative,
        }

    text = f"{normalize_medicine_value(drug1)} || {normalize_medicine_value(drug2)}"
    pipeline = model["pipeline"]
    level = pipeline.predict([text])[0]
    proba = pipeline.predict_proba([text])[0]
    confidence = float(max(proba))

    return {
        "level": level,
        "description": (
            f"Estimated interaction risk based on trained dataset knowledge: {level}. "
            "No exact match was found in the drug interactions database."
        ),
        "confidence": confidence,
        "source": "ml_estimate",
        "alt": None,
    }


def predict_drug_interactions(medicines: list[str]) -> list[dict[str, str | None]]:
    normalized = [m.strip() for m in medicines if m.strip()]
    seen: set[tuple[str, str]] = set()
    results = []

    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            first, second = normalized[i], normalized[j]
            if normalize_medicine_value(first) == normalize_medicine_value(second):
                continue
            key = build_drug_pair_key(first, second)
            if key in seen:
                continue
            seen.add(key)
            results.append(predict_drug_interaction(first, second))

    return results


def predict_drug_interactions_with_confidence(medicines: list[str]) -> list[dict[str, Any]]:
    normalized = [m.strip() for m in medicines if m.strip()]
    seen: set[tuple[str, str]] = set()
    results = []

    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            first, second = normalized[i], normalized[j]
            if normalize_medicine_value(first) == normalize_medicine_value(second):
                continue
            key = build_drug_pair_key(first, second)
            if key in seen:
                continue
            seen.add(key)
            results.append(predict_drug_interaction_with_confidence(first, second))

    return results
