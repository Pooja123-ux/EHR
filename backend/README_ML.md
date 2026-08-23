# Disease Prediction ML Setup

This repository now includes a simple disease prediction model based on symptoms.

## Train the model

1. Install dependencies:

   ```powershell
   cd backend
   pip install pandas scikit-learn joblib
   ```

2. Train the model:

   ```powershell
   python train_disease_model.py
   ```

3. Start the backend after training:

   ```powershell
   uvicorn main:app --reload
   ```

## Dataset

The dataset lives at `backend/datasets/disease_symptoms.csv` and must contain two columns:
- `disease`
- `symptoms`

Symptoms are comma-separated.
