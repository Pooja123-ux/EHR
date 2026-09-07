
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Date,
    Time,
    DateTime,
    Boolean,
    DECIMAL,
    ForeignKey,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String(20), nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    phone = Column(String(15))
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=True)
    password_hash = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default="Active")

    __table_args__ = (
        CheckConstraint("role IN ('Patient', 'Doctor', 'Lab', 'Admin')", name="check_user_role"),
    )
    patient = relationship("Patient", back_populates="user", uselist=False)
    doctor = relationship("Doctor", back_populates="user", uselist=False)
    lab = relationship("Laboratory", back_populates="user", uselist=False)
    hospital = relationship("Hospital", back_populates="admins")
    notifications = relationship("Notification", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


class Patient(Base):
    __tablename__ = "patients"

    patient_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True)
    date_of_birth = Column(Date)
    gender = Column(String(10))
    blood_group = Column(String(5))
    height = Column(DECIMAL(5, 2))
    weight = Column(DECIMAL(5, 2))
    allergies = Column(Text)
    chronic_diseases = Column(Text)
    emergency_contact = Column(String(15))
    insurance_number = Column(String(50))

    user = relationship("User", back_populates="patient")
    appointments = relationship("Appointment", back_populates="patient")
    medical_records = relationship("MedicalRecord", back_populates="patient")
    lab_reports = relationship("LabReport", back_populates="patient")
    disease_predictions = relationship("DiseasePrediction", back_populates="patient")
    drug_interactions = relationship("DrugInteraction", back_populates="patient")
    medical_timeline = relationship("MedicalTimeline", back_populates="patient")
    documents = relationship("Document", back_populates="patient")
    consent_sharings = relationship("ConsentSharing", back_populates="patient")
    ai_chats = relationship("AIChat", back_populates="patient")


class Doctor(Base):
    __tablename__ = "doctors"

    doctor_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True)
    specialization = Column(String(100))
    qualification = Column(String(100))
    experience = Column(Integer)
    license_number = Column(String(50), unique=True)
    hospital_name = Column(String(100))
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=True)

    user = relationship("User", back_populates="doctor")
    hospital = relationship("Hospital", back_populates="doctors")
    appointments = relationship("Appointment", back_populates="doctor")
    medical_records = relationship("MedicalRecord", back_populates="doctor")
    lab_reports = relationship("LabReport", back_populates="doctor")
    availabilities = relationship("DoctorAvailability", back_populates="doctor")


class Laboratory(Base):
    __tablename__ = "laboratories"

    lab_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True)
    lab_name = Column(String(100))
    registration_number = Column(String(50), unique=True)
    address = Column(Text)
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"), nullable=True)

    user = relationship("User", back_populates="lab")
    lab_reports = relationship("LabReport", back_populates="lab")


class Appointment(Base):
    __tablename__ = "appointments"

    appointment_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    doctor_id = Column(Integer, ForeignKey("doctors.doctor_id"))
    hospital_id = Column(Integer, ForeignKey("hospitals.hospital_id"))
    department = Column(String(100))
    visit_type = Column(String(50), default="In-Person")
    appointment_date = Column(Date)
    appointment_time = Column(Time)
    reason = Column(Text)
    status = Column(String(20), default="Pending")

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")
    hospital = relationship("Hospital", back_populates="appointments")
    medical_records = relationship("MedicalRecord", back_populates="appointment")


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    record_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    doctor_id = Column(Integer, ForeignKey("doctors.doctor_id"))
    appointment_id = Column(Integer, ForeignKey("appointments.appointment_id"))
    diagnosis = Column(Text)
    symptoms = Column(Text)
    doctor_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="medical_records")
    doctor = relationship("Doctor", back_populates="medical_records")
    appointment = relationship("Appointment", back_populates="medical_records")
    prescriptions = relationship("Prescription", back_populates="medical_record")


class Prescription(Base):
    __tablename__ = "prescriptions"

    prescription_id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("medical_records.record_id", ondelete="CASCADE"))
    medicine_name = Column(String(100))
    dosage = Column(String(50))
    frequency = Column(String(50))
    duration = Column(String(50))
    instructions = Column(Text)

    medical_record = relationship("MedicalRecord", back_populates="prescriptions")


class LabReport(Base):
    __tablename__ = "lab_reports"

    report_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    doctor_id = Column(Integer, ForeignKey("doctors.doctor_id"))
    lab_id = Column(Integer, ForeignKey("laboratories.lab_id"))
    report_type = Column(String(100))
    report_file = Column(Text)
    ocr_text = Column(Text)
    status = Column(String(20), default="Requested")
    doctor_notes = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    processing_status = Column(String(20), default="PENDING")
    processing_error = Column(Text)

    patient = relationship("Patient", back_populates="lab_reports")
    doctor = relationship("Doctor", back_populates="lab_reports")
    lab = relationship("Laboratory", back_populates="lab_reports")
    ai_summaries = relationship("AISummary", back_populates="lab_report")

    __table_args__ = (
        CheckConstraint("status IN ('Requested', 'Collected', 'Processing', 'Completed', 'Reviewed')", name="check_report_status"),
        CheckConstraint("processing_status IN ('PENDING','EXTRACTING','STRUCTURING','VALIDATING','SUMMARIZING','COMPLETED','FAILED_OCR','FAILED_EXTRACTION','FAILED_VALIDATION','FAILED_SUMMARY','FAILED')", name="check_processing_status"),
    )


class Hospital(Base):
    __tablename__ = "hospitals"

    hospital_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    address = Column(Text)
    phone = Column(String(15))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    admins = relationship("User", back_populates="hospital")
    doctors = relationship("Doctor", back_populates="hospital")
    appointments = relationship("Appointment", back_populates="hospital")


class Department(Base):
    __tablename__ = "departments"

    department_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DoctorAvailability(Base):
    __tablename__ = "doctor_availability"

    availability_id = Column(Integer, primary_key=True, autoincrement=True)
    doctor_id = Column(Integer, ForeignKey("doctors.doctor_id"))
    day_of_week = Column(Integer, nullable=False)  # 0=Monday ... 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_available = Column(Boolean, default=True)

    doctor = relationship("Doctor", back_populates="availabilities")


class AISummary(Base):
    __tablename__ = "ai_summaries"

    summary_id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("lab_reports.report_id", ondelete="CASCADE"))
    summary = Column(Text)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    report_type = Column(String(50), nullable=True)
    structured_data = Column(Text, nullable=True)
    verified_data = Column(Text, nullable=True)
    processing_version = Column(String(20), nullable=True)

    lab_report = relationship("LabReport", back_populates="ai_summaries")


class DiseasePrediction(Base):
    __tablename__ = "disease_predictions"

    prediction_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    predicted_disease = Column(String(100))
    probability = Column(DECIMAL(5, 2))
    risk_level = Column(String(20))
    recommendation = Column(Text)
    prediction_date = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="disease_predictions")


class DrugInteraction(Base):
    __tablename__ = "drug_interactions"

    interaction_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    medicine1 = Column(String(100))
    medicine2 = Column(String(100))
    interaction_level = Column(String(20))
    description = Column(Text)
    suggested_alternative = Column(String(100))

    patient = relationship("Patient", back_populates="drug_interactions")


class MedicalTimeline(Base):
    __tablename__ = "medical_timeline"

    timeline_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    event_type = Column(String(50))
    event_name = Column(String(100))
    description = Column(Text)
    event_date = Column(Date)

    patient = relationship("Patient", back_populates="medical_timeline")


class Document(Base):
    __tablename__ = "documents"

    document_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    document_name = Column(String(100))
    document_type = Column(String(50))
    file_path = Column(Text)
    uploaded_by = Column(Integer, ForeignKey("users.user_id"))
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="documents")


class ConsentSharing(Base):
    __tablename__ = "consent_sharing"

    consent_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    shared_with = Column(Integer, ForeignKey("users.user_id"))
    record_id = Column(Integer, nullable=True)  # medical_records id (optional)
    lab_report_id = Column(Integer, ForeignKey("lab_reports.report_id"), nullable=True)
    permission = Column(String(20))
    expiry_date = Column(Date)
    status = Column(String(20))

    patient = relationship("Patient", back_populates="consent_sharings")


class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"))
    title = Column(String(200))
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")


class AIChat(Base):
    __tablename__ = "ai_chat"

    chat_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey("patients.patient_id"))
    question = Column(Text)
    response = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="ai_chats")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"))
    action = Column(String(200))
    module = Column(String(100))
    log_time = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")


class Medicine(Base):
    __tablename__ = "medicines"

    medicine_id = Column(Integer, primary_key=True, autoincrement=True)
    medicine_name = Column(String(100))
    generic_name = Column(String(100))
    side_effects = Column(Text)
    contraindications = Column(Text)


class Disease(Base):
    __tablename__ = "diseases"

    disease_id = Column(Integer, primary_key=True, autoincrement=True)
    disease_name = Column(String(100))
    symptoms = Column(Text)
    prevention = Column(Text)
    treatment = Column(Text)
