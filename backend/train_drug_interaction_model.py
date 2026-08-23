from pathlib import Path

from app.ml.drug_interaction_predictor import train_drug_interaction_model


def main() -> None:
    root = Path(__file__).resolve().parent
    dataset_path = root / 'datasets' / 'drug_interactions.csv'

    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Please place drug_interactions.csv in backend/datasets."
        )

    model = train_drug_interaction_model()
    print(f"Training complete. Drug interaction model saved to {Path(__file__).resolve().parent / 'app' / 'ml' / 'drug_interaction_model.joblib'}")


if __name__ == '__main__':
    main()
