# Patient UI Structural Alignment & Enhancement Plan

## Files to Edit

### Core CSS
- [x] `frontend/src/App.css` — Add standardized utility CSS classes

### Patient Pages (replace inline styles with CSS classes)
- [x] `frontend/src/pages/patient/PatientDashboard.js`
- [x] `frontend/src/pages/patient/PatientProfile.js`
- [x] `frontend/src/pages/patient/AppointmentsPage.js`
- [x] `frontend/src/pages/patient/MedicalRecords.js`
- [x] `frontend/src/pages/patient/MedicalTimeline.js`
- [x] `frontend/src/pages/patient/AiSummaryPage.js`
- [x] `frontend/src/pages/patient/DiseasePrediction.js`
- [x] `frontend/src/pages/patient/DrugInteractionChecker.js`
- [x] `frontend/src/pages/patient/RecordSharing.js`

---

# Doctor & Patient Dashboard — Dynamic Name

## Goal
Update the Doctor Dashboard header to show the logged-in doctor's real name from their profile instead of the static "Dr. John Smith" fallback. Apply the same fix to the Patient Dashboard ("Welcome back, Patient").

## Steps
- [x] `frontend/src/pages/doctor/DoctorDashboard.js` — Fetch `api.doctorProfile()`, compute doctor name from profile (fallback to dashboard data), and render it in the PageHeader title (prefixing "Dr. " when needed).
- [x] `frontend/src/pages/patient/PatientDashboard.js` — Fetch `api.patientProfile()` independently, compute name from profile (fallback to dashboard data), and render it in the PageHeader title.

## Notes
- Backend `/api/doctor/profile` and `/api/patient/profile` already return `full_name` — no backend changes required.
- Root cause of "Dr. Doctor" / "Patient" fallback: `Promise.all` rejected entirely when any single API call failed, so no state was set. Changed to independent fetches.

