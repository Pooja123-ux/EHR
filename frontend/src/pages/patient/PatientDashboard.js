import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';
import { appRoutes } from '../../data/appData';

function PatientDashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.patientDashboard()
      .then(setData)
      .catch(() => {});
    api.patientProfile()
      .then(setProfile)
      .catch(() => {});
    api.patientPrescriptions()
      .then((items) => setPrescriptions(Array.isArray(items) ? items : []))
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleChat = async (e) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q) return;

    const reportId = data?.latest_report?.report_id;
    setChatMessages((prev) => [...prev, { role: 'user', text: q }]);
    setChatInput('');

    if (!reportId) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Upload or open a lab report first so the assistant can answer using your medical data.' },
      ]);
      return;
    }

    try {
      const response = await api.aiSummaryChat(reportId, q);
      setChatMessages((prev) => [...prev, { role: 'ai', text: response.response }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, I could not reach the AI assistant. Please make sure Ollama is running and try again.' },
      ]);
    }
  };

  if (loading) return <div className="page-stack"><div className="loading-state">Loading dashboard...</div></div>;

  const name = profile?.full_name || data?.full_name || 'Patient';
  const apptCount = data?.appointments_count ?? 0;
  const reportsCount = data?.medical_reports_count ?? 0;
  const prescCount = data?.prescriptions_count ?? 0;
  const upcoming = data?.upcoming_appointment;
  const latestReport = data?.latest_report;
  const recentPrescriptions = prescriptions.slice(0, 3);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Patient Dashboard"
        title={`Welcome back, ${name}`}
        subtitle="Overview of your health, appointments, and medical records."
      >
        <Link to={appRoutes.patient.appointments} className="btn btn--primary">
          Book Appointment
        </Link>
      </PageHeader>

      <div className="stats-grid">
        <StatCard label="Upcoming Appointments" value={apptCount} />
        <StatCard label="Medical Reports" value={reportsCount} />
        <StatCard label="Prescriptions" value={prescCount} />
      </div>

      <div className="content-grid">
        <div className="page-stack">
          <SectionCard title="Upcoming Appointment">
            {upcoming ? (
              <>
                <div className="flex-col flex-gap--sm">
                  <div className="detail-row">
                    <span className="detail-row__value detail-row__value--lg">{upcoming.doctor_name}</span>
                  </div>
                  <div className="text-muted">{upcoming.specialization}</div>
                  <div className="text-muted">
                    {upcoming.appointment_date} • {upcoming.appointment_time}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '1rem' }}>
                <div className="empty-state__icon" style={{ fontSize: '2rem' }}>📅</div>
                <div className="empty-state__desc">No upcoming appointments.</div>
              </div>
            )}
            <div style={{ marginTop: '1.2rem' }}>
              <Link to={appRoutes.patient.appointments} className="section-card__footer">
                View all appointments →
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Latest Report">
            {latestReport ? (
              <>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                  {latestReport.report_type}
                </div>
                <div className="text-muted">
                  {latestReport.uploaded_at ? new Date(latestReport.uploaded_at).toLocaleDateString() : ''} • {latestReport.hospital_name || ''}
                </div>
                <div className="section-card__actions">
                  <Link to={appRoutes.patient.records} className="section-card__footer">
                    Download
                  </Link>
                  <Link to={appRoutes.patient.aiSummary} className="section-card__footer">
                    View AI Summary
                  </Link>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '1rem' }}>
                <div className="empty-state__icon" style={{ fontSize: '2rem' }}>📋</div>
                <div className="empty-state__desc">No reports uploaded yet.</div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent Prescriptions">
            {recentPrescriptions.length === 0 ? (
              <div className="empty-state" style={{ padding: '1rem' }}>
                <div className="empty-state__icon" style={{ fontSize: '2rem' }}>💊</div>
                <div className="empty-state__desc">No prescriptions yet.</div>
              </div>
            ) : (
              <div className="flex-col" style={{ gap: '0.8rem' }}>
                {recentPrescriptions.map((item) => (
                  <div key={item.prescription_id} style={{ padding: '0.8rem 0.9rem', borderRadius: '0.8rem', background: 'rgba(19,117,255,0.04)', border: '1px solid rgba(19,117,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong>{item.medicine_name}</strong>
                      <span style={{ color: '#5b7088', fontSize: '0.78rem' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                    <div style={{ color: '#5b7088', fontSize: '0.82rem' }}>Prescribed by: {item.doctor_name || 'Unknown doctor'}</div>
                    <div style={{ color: '#5b7088', fontSize: '0.82rem' }}>{item.dosage || '—'} • {item.frequency || '—'} • {item.duration || '—'}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem' }}>
              <Link to={appRoutes.patient.prescriptions} className="section-card__footer">
                View all prescriptions →
              </Link>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="AI Assistant Chat">
          <div className="chat-container">
            {chatMessages.length === 0 && (
              <div style={{ color: '#8da2b8', fontSize: '0.95rem' }}>
                Ask about your reports, medications, or symptoms.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleChat} className="chat-input-row">
            <input
              type="text"
              placeholder="Ask your AI assistant..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="input-field"
            />
            <button type="submit" className="btn btn--primary">
              Send
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

export default PatientDashboard;
