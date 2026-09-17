export const routeCatalog = [
  {
    key: 'home',
    path: '/',
    role: 'public',
    title: 'Hospital Care Portal',
    eyebrow: 'Secure healthcare workspace',
    description:
      'A centralized healthcare workspace for patients, doctors, labs, and administrators with secure record sharing and role-based access.',
    highlights: [
      'Digital health records',
      'Medical report summaries',
    ],
    stats: [
      { label: 'Role Portals', value: '4', helper: 'Patient, doctor, lab, admin' },
      { label: 'Core Modules', value: '12+', helper: 'Records, booking, sharing, care tools' },
      { label: 'Security Model', value: 'Secure', helper: 'Consent-driven access control' },
    ],
    cards: [
      {
        title: 'What this phase includes',
        body: 'Base routing, top navigation, responsive shell, sidebar navigation, and module placeholders for every major section.',
        footer: 'Next phase: landing and authentication forms.',
      },
      {
        title: 'Primary user journeys',
        body: 'Patient -> Doctor -> Lab -> AI analysis -> longitudinal medical history with secure hand-offs across portals.',
        footer: 'Built for iterative expansion.',
      },
    ],
    actions: [
      { label: 'Open Patient Dashboard', to: '/patient/dashboard' },
      { label: 'View Login Placeholder', to: '/login' },
    ],
  },
  {
    key: 'login',
    path: '/login',
    role: 'public',
    title: 'Login Workspace',
    eyebrow: 'Authentication module placeholder',
    description:
      'This route is prepared for the centered login card, role selector, forgot password, and create account flows.',
    highlights: ['Email and password fields', 'Role-based login', 'Forgot password link'],
    stats: [
      { label: 'Access Roles', value: '4', helper: 'Patient, doctor, lab, admin' },
      { label: 'Auth Style', value: 'Secure', helper: 'Token-based sessions' },
    ],
    cards: [
      {
        title: 'Planned UI',
        body: 'A clean, centered authentication card with role toggles and supporting links.',
        footer: 'Implemented in phase 2.',
      },
    ],
    actions: [{ label: 'Go to Register', to: '/register' }],
  },
  {
    key: 'register',
    path: '/register',
    role: 'public',
    title: 'Registration Workspace',
    eyebrow: 'Role-specific onboarding placeholder',
    description:
      'Prepared for patient, doctor, and lab registration forms with role-specific field groups and validation.',
    highlights: ['Patient profile fields', 'Doctor credentials', 'Lab registration fields'],
    stats: [
      { label: 'Role Variants', value: '3', helper: 'Patient, doctor, lab' },
      { label: 'Onboarding Goal', value: 'Fast', helper: 'Progressive data collection' },
    ],
    cards: [
      {
        title: 'Planned UI',
        body: 'A segmented registration experience that changes fields based on the selected user role.',
        footer: 'Implemented in phase 2.',
      },
    ],
    actions: [{ label: 'Return to Home', to: '/' }],
  },
  {
    key: 'patient-dashboard',
    path: '/patient/dashboard',
    role: 'patient',
    title: 'Patient Dashboard',
    eyebrow: 'Role dashboard placeholder',
    description:
      'Foundation for cards covering appointments, reports, prescriptions, risk score, health score, and the AI assistant chat panel.',
    highlights: ['Appointments overview', 'Latest report panel', 'Health score', 'AI assistant chat'],
    stats: [
      { label: 'Upcoming Visits', value: '3', helper: 'Scheduled care events' },
      { label: 'Reports Indexed', value: '24', helper: 'Lab and prescription files' },
      { label: 'Health Score', value: '82%', helper: 'Mock dashboard status' },
    ],
    cards: [
      {
        title: 'Right rail concept',
        body: 'A persistent AI assistant helps patients ask about reports, symptoms, and medications in simple language.',
        footer: 'Detailed widgets land in phase 3.',
      },
      {
        title: 'Main content concept',
        body: 'Dashboard cards summarize visits, reports, prescriptions, and quick actions from a single view.',
        footer: 'Mock data-ready layout.',
      },
    ],
    actions: [
      { label: 'Open Medical Records', to: '/patient/records' },
      { label: 'Open Appointments', to: '/patient/appointments' },
    ],
  },
  {
    key: 'patient-appointments',
    path: '/patient/appointments',
    role: 'patient',
    title: 'Appointments',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for a calendar view, doctor list, booking modal, date selection, time slots, and visit reasons.',
    highlights: ['Calendar grid', 'Doctor cards', 'Booking popup', 'Availability browsing'],
    stats: [
      { label: 'Booking Mode', value: 'Calendar', helper: 'Interactive time selection' },
      { label: 'Doctor Discovery', value: 'Rated', helper: 'Profile and specialty cards' },
    ],
    cards: [
      {
        title: 'Planned interaction',
        body: 'Patients browse dates, choose a doctor, enter a reason, and confirm an appointment from a modal flow.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Back to Dashboard', to: '/patient/dashboard' }],
  },
  {
    key: 'patient-records',
    path: '/patient/records',
    role: 'patient',
    title: 'Medical Records',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for a searchable records table with upload, download, secure sharing, and AI summary generation actions.',
    highlights: ['Searchable table', 'Upload report', 'Share records', 'Generate AI summary'],
    stats: [
      { label: 'Record Types', value: '5+', helper: 'Blood test, X-ray, MRI, ECG' },
      { label: 'Search Pattern', value: 'Instant', helper: 'Filter by date, hospital, doctor' },
    ],
    cards: [
      {
        title: 'Table design',
        body: 'Large searchable rows with date, provider, report type, status, and file actions for each item.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Open AI Summary', to: '/patient/ai-summary' }],
  },
  {
    key: 'patient-records-upload',
    path: '/patient/records/upload',
    role: 'patient',
    title: 'Upload Record',
    eyebrow: 'Patient module',
    description: 'Upload a medical report to your health records.',
  },
  {
    key: 'patient-ai-summary',
    path: '/patient/ai-summary',
    role: 'patient',
    title: 'AI Report Summary',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for split-view reading with original report content on the left and a simplified AI summary on the right.',
    highlights: ['Original PDF viewer', 'Structured summary', 'Recommendations', 'Ask AI follow-up'],
    stats: [
      { label: 'Summary Style', value: 'LLM', helper: 'Plain-language output' },
      { label: 'Clinical View', value: 'Split', helper: 'Source and summary side by side' },
    ],
    cards: [
      {
        title: 'Planned interaction',
        body: 'Patients review clinical findings, recommendations, and downloadable AI-generated summaries.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Open Prescriptions', to: '/patient/prescriptions' }],
  },
  {
    key: 'patient-prescriptions',
    path: '/patient/prescriptions',
    role: 'patient',
    title: 'My Prescriptions',
    eyebrow: 'Patient module',
    description:
      'See every prescription issued by all doctors, including the prescribing doctor name, dosage, instructions, and date.',
    highlights: ['Doctor-wise history', 'All prescribed medicines', 'Dosage and instructions', 'Date tracked'],
    stats: [
      { label: 'Prescription View', value: 'All', helper: 'From every doctor' },
      { label: 'Doctor Tracking', value: 'Included', helper: 'Full prescriber name' },
    ],
    actions: [{ label: 'Back to Dashboard', to: '/patient/dashboard' }],
  },
  {
    key: 'patient-timeline',
    path: '/patient/timeline',
    role: 'patient',
    title: 'Medical History Timeline',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for a vertical timeline that organizes blood tests, prescriptions, imaging, surgery, follow-ups, and vaccinations.',
    highlights: ['Chronological timeline', 'Event details', 'Interactive record drill-down'],
    stats: [
      { label: 'View Mode', value: 'Vertical', helper: 'Longitudinal medical history' },
      { label: 'Timeline Focus', value: '2026', helper: 'Mock year-based grouping' },
    ],
    cards: [
      {
        title: 'Planned interaction',
        body: 'Clicking each event reveals supporting files, visit details, and relevant records linked to that timeline entry.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Open Record Sharing', to: '/patient/sharing' }],
  },
  {
    key: 'patient-sharing',
    path: '/patient/sharing',
    role: 'patient',
    title: 'Record Sharing',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for doctor and hospital selection, file-level sharing, consent toggles, validity periods, and access activity logs.',
    highlights: ['Doctor and hospital selector', 'Secure link generation', 'Consent toggle', 'Activity log'],
    stats: [
      { label: 'Validity Options', value: '3', helper: '1 day, 7 days, 30 days' },
      { label: 'Access Model', value: 'Consent', helper: 'Patient-controlled sharing' },
    ],
    cards: [
      {
        title: 'Planned interaction',
        body: 'Patients choose recipients, set expiry, allow access, and monitor active shared links from an audit-friendly log.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Open Profile', to: '/patient/profile' }],
  },
  {
    key: 'patient-profile',
    path: '/patient/profile',
    role: 'patient',
    title: 'Profile',
    eyebrow: 'Patient module placeholder',
    description:
      'Prepared for personal information, emergency contacts, insurance details, blood group, conditions, password change, and 2FA settings.',
    highlights: ['Patient identity panel', 'Emergency contacts', 'Insurance details', 'Two-factor authentication'],
    stats: [
      { label: 'Security Upgrade', value: '2FA', helper: 'Optional second factor' },
      { label: 'Profile Scope', value: 'Clinical', helper: 'Medical and identity details' },
    ],
    cards: [
      {
        title: 'Planned interaction',
        body: 'A comprehensive profile workspace will centralize identity, emergency, insurance, and security settings.',
        footer: 'Implemented in phase 3.',
      },
    ],
    actions: [{ label: 'Back to Dashboard', to: '/patient/dashboard' }],
  },
  {
    key: 'doctor-dashboard',
    path: '/doctor/dashboard',
    role: 'doctor',
    title: 'Doctor Dashboard',
    eyebrow: 'Clinical workspace placeholder',
    description:
      'Prepared for patient search, appointments, reports, notes, AI support, prescriptions, and critical patient overview widgets.',
    highlights: ['Today\'s patients', 'Pending reports', 'Critical patients', 'Patient record drill-down'],
    stats: [
      { label: 'Today\'s Patients', value: '18', helper: 'Mock active caseload' },
      { label: 'Pending Reports', value: '7', helper: 'Awaiting review' },
      { label: 'Critical Flags', value: '2', helper: 'Needs immediate attention' },
    ],
    cards: [
      {
        title: 'Workspace concept',
        body: 'Doctors will be able to inspect medical history, lab reports, prescriptions, AI summaries, and medication alerts from one screen.',
        footer: 'Implemented in phase 4.',
      },
    ],
    actions: [{ label: 'Open Patient Portal View', to: '/patient/dashboard' }],
  },
  {
    key: 'lab-dashboard',
    path: '/lab/dashboard',
    role: 'lab',
    title: 'Lab Dashboard',
    eyebrow: 'Diagnostic workspace placeholder',
    description:
      'Prepared for pending tests, patient lookup, report upload, OCR extraction previews, AI validation, and save actions.',
    highlights: ['Pending tests', 'Upload PDF', 'OCR extraction', 'AI validation'],
    stats: [
      { label: 'Upload Flow', value: 'OCR', helper: 'Digitize printed reports' },
      { label: 'Validation Layer', value: 'AI', helper: 'Review extracted values' },
    ],
    cards: [
      {
        title: 'Workspace concept',
        body: 'Lab users upload reports, verify OCR-extracted data, and publish structured results into the patient record.',
        footer: 'Implemented in phase 4.',
      },
    ],
    actions: [{ label: 'Open Admin Dashboard', to: '/admin/dashboard' }],
  },
  {
    key: 'admin-dashboard',
    path: '/admin/dashboard',
    role: 'admin',
    title: 'Admin Dashboard',
    eyebrow: 'Operations workspace placeholder',
    description:
      'Prepared for registration metrics, appointment charts, disease statistics, approvals, hospital management, and system logs.',
    highlights: ['Registration metrics', 'Approvals queue', 'System logs', 'Operational charts'],
    stats: [
      { label: 'Managed Roles', value: '4', helper: 'Patients, doctors, labs, hospitals' },
      { label: 'Charts Planned', value: '4', helper: 'Registrations, appointments, disease, revenue' },
    ],
    cards: [
      {
        title: 'Workspace concept',
        body: 'Administrators oversee onboarding approvals, performance metrics, hospital entities, and platform-level logging.',
        footer: 'Implemented in phase 4.',
      },
    ],
    actions: [{ label: 'Return Home', to: '/' }],
  },
  {
    key: 'doctor-patients',
    path: '/doctor/patients',
    role: 'doctor',
    title: 'Patients',
    eyebrow: 'Doctor module placeholder',
    description: 'Patient list, search, and detailed view workspace.',
    highlights: ['Patient search', 'Patient records', 'Detailed view'],
  },
  {
    key: 'doctor-appointments',
    path: '/doctor/appointments',
    role: 'doctor',
    title: 'Appointments',
    eyebrow: 'Doctor module placeholder',
    description: 'Manage and view appointments.',
  },
  {
    key: 'doctor-reports',
    path: '/doctor/reports',
    role: 'doctor',
    title: 'Reports',
    eyebrow: 'Doctor module placeholder',
    description: 'Review patient lab reports and clinical notes.',
  },
  {
    key: 'doctor-ai',
    path: '/doctor/ai-assistant',
    role: 'doctor',
    title: 'AI Assistant',
    eyebrow: 'Doctor module placeholder',
    description: 'Clinical decision support AI assistant.',
  },
  {
    key: 'doctor-prescriptions',
    path: '/doctor/prescriptions',
    role: 'doctor',
    title: 'Prescriptions',
    eyebrow: 'Doctor module placeholder',
    description: 'Create and manage prescriptions.',
  },
  {
    key: 'doctor-profile',
    path: '/doctor/profile',
    role: 'doctor',
    title: 'Profile',
    eyebrow: 'Doctor module placeholder',
    description: 'Doctor profile settings.',
  },
  {
    key: 'lab-pending',
    path: '/lab/pending-tests',
    role: 'lab',
    title: 'Pending Tests',
    eyebrow: 'Lab module placeholder',
    description: 'Manage pending lab orders.',
  },
  {
    key: 'lab-upload',
    path: '/lab/upload-results',
    role: 'lab',
    title: 'Upload Results',
    eyebrow: 'Lab module placeholder',
    description: 'Upload reports with OCR and AI validation.',
  },
  {
    key: 'lab-patients',
    path: '/lab/patients',
    role: 'lab',
    title: 'Patients',
    eyebrow: 'Lab module placeholder',
    description: 'View patient orders.',
  },
  {
    key: 'lab-profile',
    path: '/lab/profile',
    role: 'lab',
    title: 'Profile',
    eyebrow: 'Lab module placeholder',
    description: 'Lab profile settings.',
  },
];

export const navigationGroups = {
  public: [
    { label: 'Home', to: '/' },
    { label: 'Login', to: '/login' },
    { label: 'Register', to: '/register' },
  ],
  patient: [
    { label: 'Dashboard', to: '/patient/dashboard' },
    { label: 'Appointments', to: '/patient/appointments' },
    { label: 'Medical Records', to: '/patient/records' },
    { label: 'Prescriptions', to: '/patient/prescriptions' },
    { label: 'AI Summary', to: '/patient/ai-summary' },
    { label: 'Medical Timeline', to: '/patient/timeline' },
    { label: 'Record Sharing', to: '/patient/sharing' },
    { label: 'Profile', to: '/patient/profile' },
  ],
  doctor: [
    { label: 'Dashboard', to: '/doctor/dashboard' },
    { label: 'Patients', to: '/doctor/patients' },
    { label: 'Appointments', to: '/doctor/appointments' },
    { label: 'Reports', to: '/doctor/reports' },
    { label: 'AI Assistant', to: '/doctor/ai-assistant' },
    { label: 'Prescriptions', to: '/doctor/prescriptions' },
    { label: 'Profile', to: '/doctor/profile' },
  ],
  lab: [
    { label: 'Dashboard', to: '/lab/dashboard' },
    { label: 'Pending Tests', to: '/lab/pending-tests' },
    { label: 'Upload Results', to: '/lab/upload-results' },
    { label: 'Patients', to: '/lab/patients' },
    { label: 'Profile', to: '/lab/profile' },
  ],
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard' },
  ],
};

export function getRouteByKey(routeKey) {
  return routeCatalog.find((route) => route.key === routeKey);
}

export function getRouteByPath(pathname) {
  return routeCatalog.find((route) => route.path === pathname);
}

export function getNavigationForRole(role) {
  return navigationGroups[role] || navigationGroups.public;
}

export function getRoleFromPath(pathname) {
  if (pathname.startsWith('/patient')) {
    return 'patient';
  }

  if (pathname.startsWith('/doctor')) {
    return 'doctor';
  }

  if (pathname.startsWith('/lab')) {
    return 'lab';
  }

  if (pathname.startsWith('/admin')) {
    return 'admin';
  }

  return 'public';
}

export const appRoutes = {
  patient: {
    dashboard: '/patient/dashboard',
    appointments: '/patient/appointments',
    records: '/patient/records',
    prescriptions: '/patient/prescriptions',
    recordsUpload: '/patient/records/upload',
    aiSummary: '/patient/ai-summary',
    timeline: '/patient/timeline',
    sharing: '/patient/sharing',
    profile: '/patient/profile',
  },
  doctor: {
    dashboard: '/doctor/dashboard',
    patients: '/doctor/patients',
    appointments: '/doctor/appointments',
    reports: '/doctor/reports',
    aiAssistant: '/doctor/ai-assistant',
    prescriptions: '/doctor/prescriptions',
    profile: '/doctor/profile',
  },
  lab: {
    dashboard: '/lab/dashboard',
    pendingTests: '/lab/pending-tests',
    uploadResults: '/lab/upload-results',
    patients: '/lab/patients',
    profile: '/lab/profile',
  },
  admin: {
    dashboard: '/admin/dashboard',
  },
};
