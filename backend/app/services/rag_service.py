import re
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

import ollama
from ollama import Client

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    _CHROMA_AVAILABLE = True
except Exception:
    _CHROMA_AVAILABLE = False


OLLAMA_HOST = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-embed-text"
LLM_MODEL = "llama3.2:latest"

_client = Client(host=OLLAMA_HOST)


@dataclass
class RetrievedChunk:
    text: str
    source: str
    score: float


class RAGService:
    def __init__(self, collection_name: str = "medical_knowledge", persist_directory: str = "./chroma_db"):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        self._client = None
        self._collection = None
        self._available = False

    def _init_chroma(self) -> bool:
        if not _CHROMA_AVAILABLE:
            print("[RAG] ChromaDB not available. Install with: pip install chromadb")
            return False
        try:
            self._client = chromadb.PersistentClient(path=self.persist_directory)
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            self._available = True
            return True
        except Exception as e:
            print(f"[RAG] ChromaDB initialization failed: {e}")
            return False

    @property
    def available(self) -> bool:
        if self._collection is None:
            return self._init_chroma()
        return self._available

    def _get_embedding(self, text: str) -> Optional[List[float]]:
        try:
            response = _client.embeddings(model=EMBEDDING_MODEL, prompt=text)
            return response.get("embedding")
        except Exception as e:
            print(f"[RAG] Embedding failed: {e}")
            return None

    def _chunk_text(self, text: str, chunk_size: int = 500, chunk_overlap: int = 100) -> List[str]:
        if not text or not text.strip():
            return []
        text = re.sub(r'\s+', ' ', text.strip())
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if chunk.strip():
                chunks.append(chunk.strip())
            start = end - chunk_overlap
        return chunks

    def add_document(self, text: str, source: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        if not self.available:
            return False
        chunks = self._chunk_text(text)
        if not chunks:
            return False

        ids = []
        documents = []
        embeddings = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            embedding = self._get_embedding(chunk)
            if not embedding:
                continue
            ids.append(f"{source}_{i}")
            documents.append(chunk)
            embeddings.append(embedding)
            meta = {"source": source}
            if metadata:
                meta.update(metadata)
            metadatas.append(meta)

        if not ids:
            return False

        try:
            self._collection.add(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas,
            )
            return True
        except Exception as e:
            print(f"[RAG] Failed to add document: {e}")
            return False

    def search(self, query: str, top_k: int = 5, where: Optional[Dict[str, Any]] = None) -> List[RetrievedChunk]:
        if not self.available:
            return []

        query_embedding = self._get_embedding(query)
        if not query_embedding:
            return []

        try:
            results = self._collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where,
                include=["documents", "metadatas", "distances"]
            )
        except Exception as e:
            print(f"[RAG] Search failed: {e}")
            return []

        chunks = []
        if results and results.get("documents"):
            for doc, meta, dist in zip(
                results["documents"][0],
                results.get("metadatas", [{}])[0],
                results.get("distances", [0])[0]
            ):
                source = meta.get("source", "unknown") if isinstance(meta, dict) else "unknown"
                score = 1.0 - dist if dist is not None else 0.0
                chunks.append(RetrievedChunk(text=doc, source=source, score=score))
        return chunks

    def get_all_sources(self) -> List[str]:
        if not self.available:
            return []
        try:
            results = self._collection.get(include=["metadatas"])
            sources = set()
            for meta in results.get("metadatas", []):
                if isinstance(meta, dict) and "source" in meta:
                    sources.add(meta["source"])
            return sorted(sources)
        except Exception:
            return []

    def delete_by_source(self, source: str) -> bool:
        if not self.available:
            return False
        try:
            results = self._collection.get(where={"source": source}, include=["ids"])
            if results and results.get("ids"):
                self._collection.delete(ids=results["ids"][0])
            return True
        except Exception as e:
            print(f"[RAG] Delete failed: {e}")
            return False


rag_service = RAGService()


def build_rag_prompt(question: str, retrieved: List[RetrievedChunk], context: str = "") -> str:
    context_parts = []
    if context:
        context_parts.append(f"Patient report context:\n{context}\n")
    if retrieved:
        context_parts.append("Relevant medical information:\n")
        for i, chunk in enumerate(retrieved, 1):
            context_parts.append(f"[{i}] ({chunk.source})\n{chunk.text}\n")

    knowledge = "\n".join(context_parts)

    prompt = (
        "You are a helpful medical assistant. Use the provided context to answer the question.\n"
        "- Use simple, patient-friendly language.\n"
        "- Do not give a diagnosis. Always encourage consulting a doctor.\n"
        "- If the context doesn't contain the answer, say so honestly.\n\n"
    )
    if knowledge:
        prompt += f"{knowledge}\n"
    prompt += f"Question: {question}\n\nAnswer:"
    return prompt


def is_rag_available() -> bool:
    return rag_service.available


def init_medical_knowledge_base():
    import csv
    from pathlib import Path

    if not rag_service.available:
        print("[RAG] Skipping knowledge base init — ChromaDB not available")
        return

    existing_sources = set(rag_service.get_all_sources())

    # 1. Ingest drug interactions from CSV
    csv_path = Path(__file__).resolve().parents[1] / "datasets" / "drug_interactions.csv"
    if csv_path.exists() and "drug_interactions" not in existing_sources:
        drug_text = "Drug Interactions Database:\n\n"
        try:
            with open(csv_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    drug_text += (
                        f"- {row.get('Drug 1', '')} + {row.get('Drug 2', '')}: "
                        f"{row.get('Interaction Description', '')}\n"
                    )
            rag_service.add_document(drug_text, source="drug_interactions", metadata={"type": "drug_db"})
            print("[RAG] Ingested drug interactions")
        except Exception as e:
            print(f"[RAG] Failed to ingest drug interactions: {e}")

    # 2. Ingest general medical knowledge
    if "medical_knowledge" not in existing_sources:
        medical_kb = """
        Common Medical Knowledge for Patient Education:

        Blood Tests:
        - Hemoglobin: Carries oxygen in blood. Low levels may indicate anemia, causing fatigue and weakness.
        - WBC (White Blood Cells): Fight infection. High levels often mean infection; low levels mean immune suppression.
        - Platelets: Help blood clot. Low platelets increase bleeding risk.
        - Glucose: Blood sugar. High levels may indicate diabetes or prediabetes.
        - Cholesterol: Fatty substance in blood. High LDL increases heart disease risk.

        Imaging Reports:
        - X-Ray: Uses radiation to image bones and chest. Can show fractures, pneumonia, or heart size.
        - MRI: Uses magnetic fields to image soft tissues. Good for brain, joints, and organs.
        - CT Scan: Combines X-rays for detailed cross-sectional images. Used for trauma, abdomen, chest.

        General Health:
        - Always consult a healthcare professional for diagnosis and treatment.
        - AI-generated summaries are for informational purposes only.
        - Do not stop or change medications without doctor approval.
        """
        rag_service.add_document(medical_kb, source="medical_knowledge", metadata={"type": "general"})
        print("[RAG] Ingested general medical knowledge")

    # 3. Ingest disease-symptom reference for contextual explanations
    disease_csv = Path(__file__).resolve().parents[1] / "datasets" / "disease_symptoms.csv"
    if disease_csv.exists() and "disease_symptoms" not in existing_sources:
        disease_text = "Disease Symptom Reference for Patient Education:\n\n"
        try:
            with open(disease_csv, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    disease_text += (
                        f"- {row.get('disease', '')}: {row.get('symptoms', '')}\n"
                    )
            rag_service.add_document(disease_text, source="disease_symptoms", metadata={"type": "reference"})
            print("[RAG] Ingested disease symptom reference")
        except Exception as e:
            print(f"[RAG] Failed to ingest disease symptoms: {e}")

    # 4. Ingest report-type-specific reference guidance
    if "report_type_reference" not in existing_sources:
        report_reference = """
        Medical Report Type Reference:

        Laboratory Reports:
        - CBC (Complete Blood Count): Measures hemoglobin, WBC, RBC, platelets, hematocrit.
        - LFT (Liver Function Test): Measures ALT, AST, bilirubin, ALP, albumin.
        - KFT (Kidney Function Test): Measures creatinine, urea, uric acid, eGFR.
        - Lipid Profile: Measures total cholesterol, LDL, HDL, triglycerides.
        - Thyroid Profile: Measures TSH, T3, T4.
        - Urinalysis: Measures pH, specific gravity, protein, glucose, blood, cells.

        Imaging Reports:
        - X-Ray: Look for fracture lines, lung fields, heart size, bone density.
        - MRI: Look for soft tissue abnormalities, disc issues, tumors, inflammation.
        - CT Scan: Look for bleeding, masses, organ size, fractures, fluid collections.
        - Ultrasound: Look for organ size, cysts, stones, fluid, fetal development.

        Cardiac Reports:
        - ECG: Look for heart rate, rhythm, ST changes, axis, intervals.

        Pathology Reports:
        - Biopsy: Look for malignancy, inflammation, cell type, grading.

        Prescriptions:
        - List medications, dosages, frequency, duration, and instructions.

        General Guidance:
        - Normal ranges vary by lab, age, and sex.
        - Borderline values may need repeat testing.
        - Always correlate findings with clinical symptoms.
        """
        rag_service.add_document(report_reference, source="report_type_reference", metadata={"type": "reference"})
        print("[RAG] Ingested report type reference")
