import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const STATUS_COLORS = {
  Confirmed: { bg: 'rgba(16,185,129,0.1)', color: '#047857' },
  Accepted: { bg: 'rgba(19,117,255,0.1)', color: '#1375ff' },
  Waiting: { bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
  Pending: { bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
  'In Progress': { bg: 'rgba(16,185,129,0.1)', color: '#065f46' },
  Completed: { bg: 'rgba(99,102,241,0.1)', color: '#4338ca' },
  Cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
};

const STATUS_FLOW = {
  'Pending': ['Accepted', 'Cancelled'],
  'Waiting': ['Accepted', 'Cancelled'],
  'Accepted': ['In Progress', 'Cancelled'],
  'In Progress': ['Completed'],
  'Completed': [],
  'Cancelled': [],
};

function DoctorAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    api.doctorAppointments()
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    try {
      await api.updateAppointmentStatus(id, status);
      setAppointments((prev) => prev.map((a) => a.appointment_id === id ? { ...a, status } : a));
    } catch {
      alert('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const startConsultation = (appt) => {
    navigate(`/doctor/patients?ehr=${appt.patient_id}&consult=true`);
  };

  const filteredAppts = appointments.filter((a) => {
    if (filter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return a.appointment_date === today;
    }
    if (filter === 'pending') return ['Pending', 'Waiting', 'Confirmed', 'Accepted', 'In Progress'].includes(a.status);
    if (filter === 'completed') return a.status === 'Completed';
    if (filter === 'cancelled') return a.status === 'Cancelled';
    return true;
  });

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Doctor Portal" title="Appointments" subtitle="Accept, start, complete, or cancel patient appointments." />

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          ['all', 'All'],
          ['today', 'Today'],
          ['pending', 'Active'],
          ['completed', 'Completed'],
          ['cancelled', 'Cancelled'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{
              padding: '0.5rem 1.2rem', borderRadius: '999px', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem',
              background: filter === key ? 'linear-gradient(135deg,#1375ff,#00a7c7)' : 'rgba(19,117,255,0.08)',
              color: filter === key ? '#fff' : '#1375ff',
            }}>
            {label}
          </button>
        ))}
      </div>

      <SectionCard title={`Appointments (${filteredAppts.length})`}>
        {filteredAppts.length === 0 ? (
          <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No appointments found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                  {['Patient', 'Age', 'Gender', 'Date', 'Time', 'Reason', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.85rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAppts.map((a) => {
                  const sc = STATUS_COLORS[a.status] || STATUS_COLORS.Pending;
                  const nextStatuses = STATUS_FLOW[a.status] || [];
                  return (
                    <tr key={a.appointment_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                      <td style={{ padding: '0.7rem', fontWeight: 600 }}>{a.patient_name}</td>
                      <td style={{ padding: '0.7rem', color: '#5b7088' }}>{a.age || '—'}</td>
                      <td style={{ padding: '0.7rem', color: '#5b7088' }}>{a.gender || '—'}</td>
                      <td style={{ padding: '0.7rem' }}>{a.appointment_date}</td>
                      <td style={{ padding: '0.7rem', fontWeight: 600 }}>{a.appointment_time}</td>
                      <td style={{ padding: '0.7rem', color: '#5b7088', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason || '—'}</td>
                      <td style={{ padding: '0.7rem' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700 }}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {nextStatuses.map((s) => (
                            <button
                              key={s}
                              disabled={updating === a.appointment_id}
                              onClick={() => updateStatus(a.appointment_id, s)}
                              style={{
                                padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                background: s === 'Accepted' || s === 'Completed' || s === 'In Progress'
                                  ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                color: s === 'Cancelled' ? '#dc2626' : '#047857',
                              }}
                            >
                              {updating === a.appointment_id ? '...' : s}
                            </button>
                          ))}
                          {['Accepted', 'In Progress', 'Completed'].includes(a.status) && (
                            <button
                              onClick={() => startConsultation(a)}
                              style={{
                                padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                background: 'rgba(19,117,255,0.15)', color: '#1375ff',
                              }}>
                              Start Consultation
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/doctor/patients?ehr=${a.patient_id}`)}
                            style={{
                              padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                              background: 'rgba(99,102,241,0.1)', color: '#4338ca',
                            }}>
                            View Patient
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default DoctorAppointments;
