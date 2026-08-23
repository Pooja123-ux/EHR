from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
import re

password_regex = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$')


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int


class TokenData(BaseModel):
    sub: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserBase(BaseModel):
    role: str
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    hospital_id: Optional[int] = None
    status: Optional[str] = "Active"


class UserCreate(UserBase):
    password: str

    @field_validator('password')
    def validate_password(cls, password: str) -> str:
        if not password_regex.match(password):
            raise ValueError('Password must be at least 6 characters and include uppercase, lowercase, number, and special character.')
        return password

    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    height: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    emergency_contact: Optional[str] = None
    insurance_number: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[int] = None
    license_number: Optional[str] = None
    hospital_name: Optional[str] = None
    lab_name: Optional[str] = None
    registration_number: Optional[str] = None
    address: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None


class UserResponse(UserBase):
    user_id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PatientBase(BaseModel):
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    height: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    emergency_contact: Optional[str] = None
    insurance_number: Optional[str] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(PatientBase):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class PatientResponse(PatientBase):
    patient_id: int
    user_id: int
    user: UserResponse

    model_config = ConfigDict(from_attributes=True)


class DoctorBase(BaseModel):
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[int] = None
    license_number: Optional[str] = None
    hospital_name: Optional[str] = None


class DoctorCreate(DoctorBase):
    pass


class DoctorResponse(DoctorBase):
    doctor_id: int
    user_id: int
    user: UserResponse

    model_config = ConfigDict(from_attributes=True)


class LaboratoryBase(BaseModel):
    lab_name: Optional[str] = None
    registration_number: Optional[str] = None
    address: Optional[str] = None


class LaboratoryCreate(LaboratoryBase):
    pass


class LaboratoryResponse(LaboratoryBase):
    lab_id: int
    user_id: int
    user: UserResponse

    model_config = ConfigDict(from_attributes=True)


class DepartmentResponse(BaseModel):
    department_id: int
    name: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HospitalResponse(BaseModel):
    hospital_id: int
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DoctorDetailResponse(BaseModel):
    doctor_id: int
    name: str
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[int] = None
    hospital_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AvailableSlotResponse(BaseModel):
    time: str
    available: bool

    model_config = ConfigDict(from_attributes=True)


class AppointmentBase(BaseModel):
    doctor_id: int
    appointment_date: date
    appointment_time: time
    reason: Optional[str] = None
    status: Optional[str] = "Pending"


class AppointmentCreate(AppointmentBase):
    hospital_id: Optional[int] = None
    department: Optional[str] = None
    visit_type: Optional[str] = None


class AppointmentResponse(AppointmentBase):
    appointment_id: int
    patient_id: int

    model_config = ConfigDict(from_attributes=True)


class MedicalRecordBase(BaseModel):
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    doctor_notes: Optional[str] = None


class MedicalRecordResponse(MedicalRecordBase):
    record_id: int
    patient_id: int
    doctor_id: Optional[int] = None
    appointment_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PatientDashboardResponse(BaseModel):
    patient_id: int
    full_name: str
    blood_group: Optional[str] = None
    appointments_count: int
    medical_reports_count: int
    prescriptions_count: int
    notifications_count: int
    latest_report: Optional[dict] = None
    upcoming_appointment: Optional[dict] = None


class MedicalRecordListItem(BaseModel):
    report_id: int
    uploaded_at: Optional[datetime] = None
    hospital: Optional[str] = None
    doctor: Optional[str] = None
    report_type: Optional[str] = None
    report_file: Optional[str] = None
    ai_summary: Optional[str] = None


class AppointmentDetailResponse(BaseModel):
    appointment_id: int
    patient_id: int
    doctor_id: int
    doctor_name: Optional[str] = None
    specialization: Optional[str] = None
    hospital_name: Optional[str] = None
    department: Optional[str] = None
    visit_type: Optional[str] = None
    appointment_date: date
    appointment_time: time
    reason: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PrescriptionResponse(BaseModel):
    prescription_id: int
    record_id: int
    medicine_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    diagnosis: Optional[str] = None
    doctor_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TimelineEventResponse(BaseModel):
    timeline_id: int
    event_type: str
    event_name: str
    description: Optional[str] = None
    event_date: date

    model_config = ConfigDict(from_attributes=True)


class DiseasePredictionCreate(BaseModel):
    symptoms: list[str]


class DiseasePredictionResponse(BaseModel):
    prediction_id: int
    predicted_disease: Optional[str] = None
    probability: Optional[Decimal] = None
    risk_level: Optional[str] = None
    recommendation: Optional[str] = None
    prediction_date: Optional[datetime] = None
    symptoms: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DrugInteractionCreate(BaseModel):
    medicines: list[str]


class DrugInteractionResponse(BaseModel):
    interaction_id: int
    medicine1: Optional[str] = None
    medicine2: Optional[str] = None
    interaction_level: Optional[str] = None
    description: Optional[str] = None
    suggested_alternative: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ConsentSharingCreate(BaseModel):
    shared_with_user_id: int
    record_ids: list[int]
    permission: str = "read"
    expiry_days: int = 7


class ConsentSharingResponse(BaseModel):
    consent_id: int
    shared_with: int
    shared_with_name: Optional[str] = None
    record_id: int
    permission: Optional[str] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationResponse(BaseModel):
    notification_id: int
    title: str
    message: Optional[str] = None
    is_read: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DoctorSummaryResponse(BaseModel):
    doctor_id: int
    full_name: str
    specialization: Optional[str] = None
    todays_patients: int
    upcoming_appointments: int
    pending_reports: int
    critical_patients: int
    patients: list[dict]


class LabSummaryResponse(BaseModel):
    lab_id: int
    lab_name: Optional[str] = None
    pending_tests: int
    uploaded_today: int
    recent_reports: list[dict]


class AdminSummaryResponse(BaseModel):
    patients: int
    doctors: int
    hospitals: int
    labs: int
    appointments: int
    reports: int
    recent_logs: list[str]


class PrescriptionCreate(BaseModel):
    record_id: int
    medicine_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class MedicalRecordCreate(BaseModel):
    patient_id: int
    appointment_id: Optional[int] = None
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    doctor_notes: Optional[str] = None


class DoctorUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[int] = None
    hospital_name: Optional[str] = None


class PatientRecordCreate(BaseModel):
    report_type: str
    report_file: Optional[str] = None
    ocr_text: Optional[str] = None
    ai_summary: Optional[str] = None


class LabReportCreate(BaseModel):
    patient_id: int
    doctor_id: Optional[int] = None
    report_type: str
    report_file: Optional[str] = None
    ocr_text: Optional[str] = None
    ai_summary: Optional[str] = None


class LabUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    lab_name: Optional[str] = None
    address: Optional[str] = None


# ── Enhanced Doctor Schemas ──────────────────────────────────────────────

class PatientEHRResponse(BaseModel):
    patient_id: int
    user_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    height: Optional[Decimal] = None
    weight: Optional[Decimal] = None
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    emergency_contact: Optional[str] = None
    insurance_number: Optional[str] = None
    previous_consultations: list[dict] = []
    previous_prescriptions: list[dict] = []
    lab_reports: list[dict] = []
    surgeries: list[dict] = []
    vaccinations: list[dict] = []
    allergies_list: list[dict] = []
    ai_summary: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True)


class ConsultationCreate(BaseModel):
    patient_id: int
    appointment_id: Optional[int] = None
    symptoms: Optional[str] = None
    diagnosis: Optional[str] = None
    doctor_notes: Optional[str] = None
    lab_requests: list[str] = []


class ConsultationResponse(BaseModel):
    record_id: int
    patient_id: int
    appointment_id: Optional[int] = None
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    doctor_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    lab_requests_created: list[int] = []
    model_config = ConfigDict(from_attributes=True)


class DrugInteractionCheckRequest(BaseModel):
    medicines: list[str]


class DrugInteractionCheckResponse(BaseModel):
    medicine1: str
    medicine2: str
    interaction_level: str
    description: str
    suggested_alternative: Optional[str] = None


class ReportReviewUpdate(BaseModel):
    status: Optional[str] = None
    doctor_notes: Optional[str] = None
    action: Optional[str] = None  # 'approve', 'retest'


class DoctorDashboardResponse(BaseModel):
    doctor_id: int
    full_name: str
    specialization: Optional[str] = None
    todays_appointments: int = 0
    patients_seen_today: int = 0
    pending_lab_reports: int = 0
    critical_alerts: int = 0
    pending_followups: int = 0
    unread_notifications: int = 0
    todays_schedule: list[dict] = []
    model_config = ConfigDict(from_attributes=True)


class AIChatRequest(BaseModel):
    report_id: int
    question: str


class AIChatResponse(BaseModel):
    response: str
    model_config = ConfigDict(from_attributes=True)
