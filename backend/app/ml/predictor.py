from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder

MODEL_PATH = Path(__file__).resolve().parent / "disease_prediction_model.joblib"
DATASET_PATH = Path(__file__).resolve().parents[2] / "datasets" / "disease_symptoms.csv"
MIN_SYMPTOMS_FOR_PREDICTION = 1
MIN_CONFIDENCE = 0.5


def normalize_symptom(symptom: str) -> str:
    if symptom is None:
        return ""
    cleaned = str(symptom).strip().lower()
    cleaned = cleaned.replace("-", " ")
    cleaned = cleaned.replace("/", " ")
    cleaned = cleaned.replace("_", " ")
    return " ".join(cleaned.split())


def parse_symptoms(value: str) -> list[str]:
    if value is None:
        return []
    cleaned = str(value).replace(";", ",").replace("\n", ",").replace("|", ",")
    tokens = [normalize_symptom(item) for item in cleaned.split(",") if item and item.strip()]
    return [token for token in tokens if token]


def build_symptom_text(symptoms: list[str]) -> str:
    return " ".join(parse_symptoms(", ".join(symptoms)))


def load_disease_model() -> dict[str, Any] | None:
    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        if isinstance(model, dict) and {"vectorizer", "clf", "le"}.issubset(model.keys()):
            return model

    if DATASET_PATH.exists():
        return train_disease_model_from_dataset()

    return None


def train_disease_model_from_dataset() -> dict[str, Any]:
    return train_disease_model(DATASET_PATH)


def train_disease_model(dataset_path: Path) -> dict[str, Any]:
    df = pd.read_csv(dataset_path)
    required_columns = {"disease", "symptoms"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(f"Dataset must contain required columns: {sorted(required_columns)}. Missing: {sorted(missing_columns)}")

    df = df[["disease", "symptoms"]].copy()
    df = df.dropna(subset=["disease", "symptoms"]).copy()
    df["disease"] = df["disease"].astype(str).str.strip()
    df["symptoms"] = df["symptoms"].astype(str).str.strip()
    df = df[df["disease"].ne("") & df["symptoms"].ne("")].copy()

    if df.empty:
        raise ValueError("The disease dataset contains no usable disease/symptom records.")

    df["symptom_list"] = df["symptoms"].apply(parse_symptoms)
    df = df[df["symptom_list"].map(len) > 0].copy()

    if df.empty:
        raise ValueError("The disease dataset contains no valid symptom entries after parsing.")

    df["symptom_text"] = df["symptom_list"].apply(lambda items: " ".join(items))
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        min_df=1,
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z\-]*\b",
    )
    X = vectorizer.fit_transform(df["symptom_text"])

    le = LabelEncoder()
    y = le.fit_transform(df["disease"].astype(str))

    clf = LogisticRegression(max_iter=5000, multi_class="auto")
    clf.fit(X, y)

    model = {"vectorizer": vectorizer, "le": le, "clf": clf}
    joblib.dump(model, MODEL_PATH)
    return model


def predict_disease(symptoms: list[str], top_n: int = 3, min_confidence: float = MIN_CONFIDENCE) -> list[dict[str, Any]]:
    model = load_disease_model()
    if not model:
        raise RuntimeError(
            "Disease prediction model unavailable. Train it first with `python train_disease_model.py`."
        )

    normalized = [normalize_symptom(s) for s in symptoms if str(s).strip()]
    if not normalized:
        raise ValueError("At least one symptom is required.")
    if len(normalized) < MIN_SYMPTOMS_FOR_PREDICTION:
        return []

    symptom_text = build_symptom_text(normalized)

    if "vectorizer" in model and "clf" in model:
        features = model["vectorizer"].transform([symptom_text])
        probabilities = model["clf"].predict_proba(features)[0]
        top_indices = sorted(range(len(probabilities)), key=lambda i: probabilities[i], reverse=True)[:top_n]
        predictions = []
        for idx in top_indices:
            prob = float(probabilities[idx]) * 100
            if prob < min_confidence:
                continue
            predictions.append(
                {
                    "name": model["le"].inverse_transform([idx])[0],
                    "prob": round(prob, 2),
                }
            )
        return predictions

    if "mlb" in model:
        features = model["mlb"].transform([normalized])
        probabilities = model["clf"].predict_proba(features)[0]
        top_indices = sorted(range(len(probabilities)), key=lambda i: probabilities[i], reverse=True)[:top_n]
        predictions = []
        for idx in top_indices:
            prob = float(probabilities[idx]) * 100
            if prob < min_confidence:
                continue
            predictions.append(
                {
                    "name": model["le"].inverse_transform([idx])[0],
                    "prob": round(prob, 2),
                }
            )
        return predictions

    raise RuntimeError("Unsupported disease model format.")
