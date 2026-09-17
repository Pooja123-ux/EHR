import './App.css';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import PageHeader from './components/common/PageHeader';
import { routeCatalog, appRoutes } from './data/appData';
import { useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PatientDashboard from './pages/patient/PatientDashboard';
import MedicalRecords from './pages/patient/MedicalRecords';
import PatientPrescriptions from './pages/patient/PatientPrescriptions';
import PatientUploadRecord from './pages/patient/PatientUploadRecord';
import AiSummaryPage from './pages/patient/AiSummaryPage';
import AppointmentsPage from './pages/patient/AppointmentsPage';
import MedicalTimeline from './pages/patient/MedicalTimeline';
import RecordSharing from './pages/patient/RecordSharing';
import PatientProfile from './pages/patient/PatientProfile';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import DoctorPatients from './pages/doctor/DoctorPatients';
import DoctorAppointments from './pages/doctor/DoctorAppointments';
import DoctorReports from './pages/doctor/DoctorReports';
import DoctorPrescriptions from './pages/doctor/DoctorPrescriptions';
import DoctorAiAssistant from './pages/doctor/DoctorAiAssistant';
import DoctorProfile from './pages/doctor/DoctorProfile';
import LabDashboard from './pages/lab/LabDashboard';
import LabPendingTests from './pages/lab/LabPendingTests';
import LabUploadResults from './pages/lab/LabUploadResults';
import LabPatients from './pages/lab/LabPatients';
import LabProfile from './pages/lab/LabProfile';
import AdminDashboard from './pages/admin/AdminDashboard';
import PlaceholderPage from './pages/PlaceholderPage';

const dashboardByRole = {
  patient: appRoutes.patient.dashboard,
  doctor: appRoutes.doctor.dashboard,
  lab: appRoutes.lab.dashboard,
  admin: appRoutes.admin.dashboard,
};

function getDashboardPath(role) {
  return dashboardByRole[String(role || '').toLowerCase()] || appRoutes.patient.dashboard;
}

function ProtectedRoute({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  const userRole = String(user?.role || '').toLowerCase();
  const hasSession = Boolean(user && localStorage.getItem('ehr_token'));

  if (!hasSession) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (userRole !== String(role).toLowerCase()) {
    return <Navigate to={getDashboardPath(userRole)} replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  const userRole = String(user?.role || '').toLowerCase();
  const hasSession = Boolean(user && localStorage.getItem('ehr_token'));

  if (hasSession) {
    return <Navigate to={getDashboardPath(userRole)} replace />;
  }

  return children;
}

function NotFound() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="The page you requested does not exist or may have moved."
        actions={[{ label: 'Return home', to: '/' }]}
      />
    </div>
  );
}

function ProtectedMain({ role, children }) {
  return (
    <ProtectedRoute role={role}>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* Patient routes */}
      <Route
        path={appRoutes.patient.dashboard}
        element={
          <ProtectedMain role="patient">
            <PatientDashboard />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.appointments}
        element={
          <ProtectedMain role="patient">
            <AppointmentsPage />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.records}
        element={
          <ProtectedMain role="patient">
            <MedicalRecords />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.prescriptions}
        element={
          <ProtectedMain role="patient">
            <PatientPrescriptions />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.recordsUpload}
        element={
          <ProtectedMain role="patient">
            <PatientUploadRecord />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.aiSummary}
        element={
          <ProtectedMain role="patient">
            <AiSummaryPage />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.timeline}
        element={
          <ProtectedMain role="patient">
            <MedicalTimeline />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.sharing}
        element={
          <ProtectedMain role="patient">
            <RecordSharing />
          </ProtectedMain>
        }
      />
      <Route
        path={appRoutes.patient.profile}
        element={
          <ProtectedMain role="patient">
            <PatientProfile />
          </ProtectedMain>
        }
      />

      {/* Doctor routes */}
      <Route path={appRoutes.doctor.dashboard} element={<ProtectedMain role="doctor"><DoctorDashboard /></ProtectedMain>} />
      <Route path={appRoutes.doctor.patients} element={<ProtectedMain role="doctor"><DoctorPatients /></ProtectedMain>} />
      <Route path={appRoutes.doctor.appointments} element={<ProtectedMain role="doctor"><DoctorAppointments /></ProtectedMain>} />
      <Route path={appRoutes.doctor.reports} element={<ProtectedMain role="doctor"><DoctorReports /></ProtectedMain>} />
      <Route path={appRoutes.doctor.aiAssistant} element={<ProtectedMain role="doctor"><DoctorAiAssistant /></ProtectedMain>} />
      <Route path={appRoutes.doctor.prescriptions} element={<ProtectedMain role="doctor"><DoctorPrescriptions /></ProtectedMain>} />
      <Route path={appRoutes.doctor.profile} element={<ProtectedMain role="doctor"><DoctorProfile /></ProtectedMain>} />

      {/* Lab routes */}
      <Route path={appRoutes.lab.dashboard} element={<ProtectedMain role="lab"><LabDashboard /></ProtectedMain>} />
      <Route path={appRoutes.lab.pendingTests} element={<ProtectedMain role="lab"><LabPendingTests /></ProtectedMain>} />
      <Route path={appRoutes.lab.uploadResults} element={<ProtectedMain role="lab"><LabUploadResults /></ProtectedMain>} />
      <Route path={appRoutes.lab.patients} element={<ProtectedMain role="lab"><LabPatients /></ProtectedMain>} />
      <Route path={appRoutes.lab.profile} element={<ProtectedMain role="lab"><LabProfile /></ProtectedMain>} />

      {/* Admin routes */}
      <Route path={appRoutes.admin.dashboard} element={<ProtectedMain role="admin"><AdminDashboard /></ProtectedMain>} />

      {/* Fallback */}
      {routeCatalog.map((route) => {
        const implemented = [
          'home', 'login', 'register',
          'patient-dashboard', 'patient-appointments', 'patient-records', 'patient-prescriptions', 'patient-ai-summary',
          'patient-records-upload',
          'patient-timeline', 'patient-sharing', 'patient-profile',
          'doctor-dashboard', 'doctor-patients', 'doctor-appointments', 'doctor-reports', 'doctor-ai', 'doctor-prescriptions', 'doctor-profile',
          'lab-dashboard', 'lab-pending', 'lab-upload', 'lab-patients', 'lab-profile',
          'admin-dashboard',
        ];
        if (implemented.includes(route.key) || route.role === 'public') return null;
        return (
          <Route key={route.key} path={route.path} element={<ProtectedMain role={route.role}><PlaceholderPage routeKey={route.key} /></ProtectedMain>} />
        );
      })}
      <Route path="*" element={<MainLayout><NotFound /></MainLayout>} />
    </Routes>
  );
}

export default App;
