import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

function DoctorDashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.doctorDashboard()
      .then(setData)
      .catch(() => {});
    api.doctorProfile()
      .then(setProfile)
      .catch(() => {});
    api.doctorPatients()
      .then(setPatients)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Use the doctor's real name from their profile (fallback to dashboard data)
  const doctorName = profile?.full_name || data?.full_name || 'Doctor';

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading dashboard...</div></div>;

  const schedule = data?.todays_schedule || [];
  const filtered = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Doctor Dashboard"
        title={`Welcome, ${doctorName.startsWith('Dr. ') ? doctorName : `Dr. ${doctorName}`}`}
        subtitle="Manage appointments, patient records, prescriptions, laboratory requests, and AI-assisted clinical decisions."
      />

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard label="Today's Appointments" value={data?.todays_appointments ?? 0} />
        <StatCard label="Patients Seen Today" value={data?.patients_seen_today ?? 0} />
        <StatCard label="Pending Lab Reports" value={data?.pending_lab_reports ?? 0} />
        <StatCard label="Critical Alerts" value={data?.critical_alerts ?? 0} />
        <StatCard label="Pending Follow-ups" value={data?.pending_followups ?? 0} />
        <StatCard label="Unread Notifications" value={data?.unread_notifications ?? 0} />
      </div>

      <div className="content-grid">
        {/* Today's Schedule */}
        <SectionCard title="Today's Schedule">
          {schedule.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No appointments scheduled for today.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 700, color: '#5b7088' }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 700, color: '#5b7088' }}>Patient</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 700, color: '#5b7088' }}>Department</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 700, color: '#5b7088' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem', fontWeight: 700, color: '#5b7088' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((apt) => (
                  <tr key={apt.appointment_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{apt.time || '—'}</td>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{apt.patient_name}</td>
                    <td style={{ padding: '0.6rem', color: '#5b7088' }}>{apt.department || 'General Medicine'}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <span style={{
                        padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700,
                        background: apt.status === 'Completed' ? 'rgba(99,102,241,0.1)' : apt.status === 'In Progress' ? 'rgba(16,185,129,0.1)' : apt.status === 'Confirmed' ? 'rgba(19,117,255,0.1)' : 'rgba(245,158,11,0.1)',
                        color: apt.status === 'Completed' ? '#4338ca' : apt.status === 'In Progress' ? '#047857' : apt.status === 'Confirmed' ? '#1375ff' : '#d97706',
                      }}>
                        {apt.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button onClick={() => navigate(`/doctor/patients?ehr=${apt.patient_id}`)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: '999px', border: 'none', background: 'rgba(19,117,255,0.1)', color: '#1375ff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                        View Patient
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Right side: Patient List */}
        <div className="page-stack">
          <SectionCard title="Patients">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '0.9rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem', marginBottom: '1.2rem' }}
            />
            {filtered.length === 0 ? (
              <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No patients found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
                {filtered.slice(0, 15).map((patient) => (
                  <div
                    key={patient.patient_id}
                    style={{
                      padding: '0.9rem 1rem', borderRadius: '1rem',
                      backgroundColor: 'rgba(19,117,255,0.03)',
                      border: '2px solid transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{patient.full_name}</div>
                      <div style={{ color: '#5b7088', fontSize: '0.82rem' }}>
                        {patient.gender || '—'} • Age: {patient.age || '—'} • {patient.appointment_time || 'Past'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => navigate(`/doctor/patients?ehr=${patient.patient_id}`)}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '999px', border: 'none', background: 'rgba(19,117,255,0.1)', color: '#1375ff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                        Open EHR
                      </button>
                      <button onClick={() => navigate(`/doctor/patients?ehr=${patient.patient_id}&consult=true`)}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '999px', border: 'none', background: 'rgba(16,185,129,0.1)', color: '#047857', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                        Start
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default DoctorDashboard;
