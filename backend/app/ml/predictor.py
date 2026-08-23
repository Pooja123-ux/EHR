from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder, MultiLabelBinarizer

MODEL_PATH = Path(__file__).resolve().parent / "disease_prediction_model.joblib"
DATASET_PATH = Path(__file__).resolve().parents[2] / "datasets" / "disease_symptoms.csv"


def normalize_symptom(symptom: str) -> str:
    return symptom.strip().lower()


def load_disease_model() -> dict[str, Any] | None:
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)

    if DATASET_PATH.exists():
        return train_disease_model_from_dataset()

    return None


def train_disease_model_from_dataset() -> dict[str, Any]:
    return train_disease_model(DATASET_PATH)


def train_disease_model(dataset_path: Path) -> dict[str, Any]:
    df = pd.read_csv(dataset_path)
    if "disease" not in df.columns or "symptoms" not in df.columns:
        raise ValueError("Dataset must contain 'disease' and 'symptoms' columns.")

    df["symptom_list"] = df["symptoms"].astype(str).apply(
        lambda value: [normalize_symptom(item) for item in value.split(",") if item.strip()]
    )

    mlb = MultiLabelBinarizer()
    X = mlb.fit_transform(df["symptom_list"])
    le = LabelEncoder()
    y = le.fit_transform(df["disease"].astype(str))

    clf = LogisticRegression(max_iter=5000)
    clf.fit(X, y)

    model = {"mlb": mlb, "le": le, "clf": clf}
    joblib.dump(model, MODEL_PATH)
    return model


def predict_disease(symptoms: list[str], top_n: int = 3) -> list[dict[str, Any]]:
    model = load_disease_model()
    if not model:
        raise RuntimeError(
            "Disease prediction model unavailable. Train it first with `python train_disease_model.py`."
        )

    normalized = [normalize_symptom(s) for s in symptoms if s.strip()]
    if not normalized:
        raise ValueError("At least one symptom is required.")

    features = model["mlb"].transform([normalized])
    probabilities = model["clf"].predict_proba(features)[0]
    top_indices = sorted(range(len(probabilities)), key=lambda i: probabilities[i], reverse=True)[:top_n]

    predictions = []
    for idx in top_indices:
        predictions.append(
            {
                "name": model["le"].inverse_transform([idx])[0],
                "prob": round(float(probabilities[idx]) * 100, 2),
            }
        )
    return predictions
