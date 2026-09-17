const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export function fileUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE_URL}/${clean}`;
}

function getToken() {
  return localStorage.getItem('ehr_token');
}

async function request(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;
  const token = getToken();
  const headers = { ...fetchOptions.headers };
  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });
  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect) {
      localStorage.removeItem('ehr_token');
      localStorage.removeItem('ehr_user');
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

async function requestText(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('ehr_token');
      localStorage.removeItem('ehr_user');
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.text();
}

export const api = {
  // Auth
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data), skipAuthRedirect: true }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  // Patient — core
  patientDashboard: () => request('/api/patient/dashboard'),
  patientRecords: () => request('/api/patient/records'),
  getTimeline: () => request('/api/patient/timeline'),
  uploadPatientRecord: (data) => request('/api/patient/records', { method: 'POST', body: data }),
  patientAppointments: () => request('/api/patient/appointments'),
  createAppointment: (data) => request('/api/patient/appointments', { method: 'POST', body: JSON.stringify(data) }),
  cancelAppointment: (id) => request(`/api/patient/appointments/${id}/cancel`, { method: 'PUT' }),
  deleteAppointment: (id) => request(`/api/patient/appointments/${id}`, { method: 'DELETE' }),
  patientPrescriptions: () => request('/api/patient/prescriptions'),
  patientProfile: () => request('/api/patient/profile'),
  updatePatientProfile: (data) => request('/api/patient/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getDoctors: () => request('/api/patient/doctors'),
  getHospitals: () => request('/api/patient/hospitals'),
  getDepartments: () => request('/api/patient/departments'),
  getDoctorsByDepartment: (department, hospitalId) =>
    request(`/api/patient/doctors-by-department?department=${encodeURIComponent(department)}${hospitalId ? `&hospital_id=${hospitalId}` : ''}`),
  getAvailableSlots: (doctorId, dateStr) =>
    request(`/api/patient/available-slots?doctor_id=${doctorId}&date_str=${dateStr}`),

  // Patient — notifications
  patientNotifications: () => request('/api/patient/notifications'),
  markNotificationRead: (id) => request(`/api/patient/notifications/${id}/read`, { method: 'PUT' }),

  deleteRecord: (reportId) => request(`/api/patient/records/${reportId}`, { method: 'DELETE' }),
  // Patient — AI summary

  getAiSummary: (reportId) => request(`/api/patient/ai-summary/${reportId}`),
  aiSummaryChat: (reportId, question) => request(`/api/patient/ai-summary/chat`, { method: 'POST', body: JSON.stringify({ report_id: reportId, question }) }),
  analyzeReportImage: (reportId) => request(`/api/patient/records/${reportId}/analyze-image`, { method: 'POST' }),
  reanalyzeReport: (reportId) => request(`/api/patient/records/${reportId}/reanalyze`, { method: 'POST' }),
  getReportProcessingStatus: (reportId) => request(`/api/patient/records/${reportId}/processing-status`),
  ingestReportsForRag: () => request(`/api/patient/rag/ingest-reports`, { method: 'POST' }),

  // Patient — drug interactions
  checkDrugInteraction: (medicines) => request('/api/patient/drug-interaction', { method: 'POST', body: JSON.stringify({ medicines }) }),
  getDrugList: () => request('/api/patient/drug-list'),

  // Patient — consent sharing
  createConsentSharing: (data) => request('/api/patient/consent-sharing', { method: 'POST', body: JSON.stringify(data) }),
  getConsentSharings: () => request('/api/patient/consent-sharing'),

  // ── Doctor ────────────────────────────────────────────────────────────
  doctorDashboard: () => request('/api/doctor/dashboard'),
  doctorPatients: () => request('/api/doctor/patients'),
  doctorAppointments: () => request('/api/doctor/appointments'),
  updateAppointmentStatus: (id, status) => request(`/api/doctor/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Doctor — Patient EHR
  getPatientEHR: (patientId) => request(`/api/doctor/patients/${patientId}/ehr`),

  // Doctor — Consultation
  createConsultation: (data) => request('/api/doctor/consultation', { method: 'POST', body: JSON.stringify(data) }),
  getConsultationReport: (recordId) => requestText(`/api/doctor/consultations/${recordId}/report`),

  // Doctor — Medical Records
  createMedicalRecord: (data) => request('/api/doctor/records', { method: 'POST', body: JSON.stringify(data) }),

  // Doctor — Drug Interaction Check
  checkDrugInteractions: (medicines) => request('/api/doctor/drug-interaction-check', { method: 'POST', body: JSON.stringify({ medicines }) }),

  // Doctor — Prescriptions
  createPrescription: (data) => request('/api/doctor/prescriptions', { method: 'POST', body: JSON.stringify(data) }),
  doctorPrescriptions: () => request('/api/doctor/prescriptions'),

  // Doctor — Lab Reports
  doctorReports: () => request('/api/doctor/reports'),
  reviewReport: (reportId, data) => request(`/api/doctor/reports/${reportId}/review`, { method: 'PUT', body: JSON.stringify(data) }),

  // Doctor — Notifications
  doctorNotifications: () => request('/api/doctor/notifications'),
  markDoctorNotificationRead: (id) => request(`/api/doctor/notifications/${id}/read`, { method: 'PUT' }),
  markAllDoctorNotificationsRead: () => request('/api/doctor/notifications/read-all', { method: 'PUT' }),

  // Doctor — Profile
  doctorProfile: () => request('/api/doctor/profile'),
  updateDoctorProfile: (data) => request('/api/doctor/profile', { method: 'PUT', body: JSON.stringify(data) }),
  doctorAiChat: (question) => request('/api/doctor/ai-chat', { method: 'POST', body: JSON.stringify({ question }) }),

  // Lab
  labDashboard: () => request('/api/lab/dashboard'),
  labReports: () => request('/api/lab/reports'),
  labPendingTests: () => request('/api/lab/pending'),
  updatePendingStatus: (reportId, status) => request(`/api/lab/pending/${reportId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  uploadLabReport: (data) => request('/api/lab/reports', { method: 'POST', body: JSON.stringify(data) }),
  uploadLabReportFile: (data) => request('/api/lab/reports/upload', { method: 'POST', body: data }),
  labPatients: () => request('/api/lab/patients'),
  labProfile: () => request('/api/lab/profile'),
  updateLabProfile: (data) => request('/api/lab/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getLabReportProcessingStatus: (reportId) => request(`/api/lab/reports/${reportId}/processing-status`),

  // Admin
  adminDashboard: () => request('/api/admin/dashboard'),
  adminDoctors: () => request('/api/admin/doctors'),
  adminPatients: () => request('/api/admin/patients'),
  adminLabs: () => request('/api/admin/labs'),
  adminAppointments: () => request('/api/admin/appointments'),
  adminHospital: () => request('/api/admin/hospital'),
  updateDoctorStatus: (userId, status) => request(`/api/admin/doctors/${userId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  updatePatientStatus: (userId, status) => request(`/api/admin/patients/${userId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  updateLabStatus: (userId, status) => request(`/api/admin/labs/${userId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  adminCreateDoctor: (data) => request('/api/admin/doctors', { method: 'POST', body: JSON.stringify(data) }),
  adminCreateLab: (data) => request('/api/admin/labs', { method: 'POST', body: JSON.stringify(data) }),
};
