export const mockPatient = {
  name: 'Arjun Patel',
  age: 34,
  bloodGroup: 'O+',
};

export const mockAppointments = [
  {
    id: 'a1',
    doctor: 'Dr. Rahul Sharma',
    specialty: 'Cardiologist',
    date: 'Tomorrow',
    time: '10:30 AM',
  },
  {
    id: 'a2',
    doctor: 'Dr. Neha Verma',
    specialty: 'General Physician',
    date: '12 Jul 2026',
    time: '02:00 PM',
  },
];

export const mockMedicalRecords = [
  {
    id: 'r1',
    date: '10 Jul 2026',
    hospital: 'City Hospital',
    doctor: 'Dr. Rahul Sharma',
    report: 'Blood Test',
    status: 'Available',
  },
  {
    id: 'r2',
    date: '05 Jun 2026',
    hospital: 'City Hospital',
    doctor: 'Dr. Neha Verma',
    report: 'X-Ray',
    status: 'Available',
  },
  {
    id: 'r3',
    date: '20 May 2026',
    hospital: 'Medicare Clinic',
    doctor: 'Dr. Anil Mehta',
    report: 'MRI',
    status: 'Available',
  },
  {
    id: 'r4',
    date: '10 Apr 2026',
    hospital: 'City Hospital',
    doctor: 'Dr. Neha Verma',
    report: 'Prescription',
    status: 'Available',
  },
  {
    id: 'r5',
    date: '01 Mar 2026',
    hospital: 'Heart Care Center',
    doctor: 'Dr. Rahul Sharma',
    report: 'ECG',
    status: 'Available',
  },
];

export const mockAiSummary = {
  findings: [
    'Mild anemia detected',
    'Low Vitamin D levels',
    'Cholesterol levels normal',
  ],
  recommendations: [
    'Increase iron intake (spinach, lentils, red meat)',
    'Start Vitamin D supplements as prescribed',
    'Continue regular exercise routine',
  ],
};

export const mockMedicalTimeline = [
  { date: '10 Jul 2026', title: 'Blood Test', type: 'report' },
  { date: '05 Jun 2026', title: 'Prescription', type: 'prescription' },
  { date: '20 May 2026', title: 'X-Ray', type: 'report' },
  { date: '10 Apr 2026', title: 'Surgery - Appendectomy', type: 'surgery' },
  { date: '01 Mar 2026', title: 'Follow-up Visit', type: 'appointment' },
  { date: '15 Feb 2026', title: 'Vaccination - Booster', type: 'vaccine' },
];

export const mockDoctors = [
  {
    id: 'd1',
    name: 'Dr. Sharma',
    specialty: 'Cardiologist',
    rating: 4.8,
  },
  {
    id: 'd2',
    name: 'Dr. Verma',
    specialty: 'General Physician',
    rating: 4.7,
  },
  {
    id: 'd3',
    name: 'Dr. Mehta',
    specialty: 'Orthopedician',
    rating: 4.9,
  },
];

export const mockDoctorPatients = [
  { id: 'p1', name: 'Arjun Patel', age: 34, condition: 'Mild anemia, low vitamin D' },
  { id: 'p2', name: 'Priya Singh', age: 28, condition: 'Follow-up after surgery' },
  { id: 'p3', name: 'Rajesh Kumar', age: 45, condition: 'Hypertension monitoring' },
  { id: 'p4', name: 'Neha Gupta', age: 31, condition: 'Routine checkup' },
];

export const mockDoctorAppointments = [
  { id: 'a1', patient: 'Arjun Patel', time: '10:00 AM', type: 'Consultation' },
  { id: 'a2', patient: 'Priya Singh', time: '11:30 AM', type: 'Follow-up' },
  { id: 'a3', patient: 'Rajesh Kumar', time: '02:00 PM', type: 'Checkup' },
];
