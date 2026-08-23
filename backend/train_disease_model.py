from pathlib import Path

from app.ml.predictor import train_disease_model


def main() -> None:
    root = Path(__file__).resolve().parent
    dataset_path = root / "datasets" / "disease_symptoms.csv"

    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Please add disease_symptoms.csv to the backend/datasets folder."
        )

    model = train_disease_model(dataset_path)
    print(f"Training complete. Model saved to {Path(__file__).resolve().parent / 'app' / 'ml' / 'disease_prediction_model.joblib'}")


if __name__ == "__main__":
    main()
