import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const STATUS_STYLE = {
  Requested:  { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   icon: '🕐' },
  Collected:  { color: '#2563eb', bg: 'rgba(37,99,235,0.08)',  icon: '🧪' },
  Processing: { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', icon: '⚙️' },
  Completed:  { color: '#059669', bg: 'rgba(5,150,105,0.08)',  icon: '✅' },
};

function LabDashboard() {
  const [data, setData]       = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.labDashboard().catch(() => null),
      api.labPendingTests().catch(() => []),
    ]).then(([dash, pend]) => {
      setData(dash);
      setPending(pend);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page-stack">
      <div style={{ padding: '2rem', textAlign: 'center' }}>Loading dashboard...</div>
    </div>
  );

  const recentReports = data?.recent_reports || [];
  const urgentPending = pending.filter(t => t.status === 'Requested').slice(0, 5);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Lab Dashboard"
        title={data?.lab_name || 'Lab Dashboard'}
        subtitle="Manage doctor-requested tests, upload results, and track progress."
      >
        <button className="btn btn--primary" onClick={() => navigate('/lab/pending-tests')}>
          View All Pending
        </button>
        <button className="btn btn--ghost" onClick={() => navigate('/lab/upload-results')}>
          + Upload Results
        </button>
      </PageHeader>

      <div className="stats-grid">
        <StatCard label="Pending Tests"    value={data?.pending_tests  ?? 0} />
        <StatCard label="Completed Today"  value={data?.uploaded_today ?? 0} />
        <StatCard label="New Requests"     value={pending.filter(t => t.status === 'Requested').length} />
        <StatCard label="In Progress"      value={pending.filter(t => t.status === 'Collected' || t.status === 'Processing').length} />
      </div>

      <div className="content-grid">
        {/* New doctor-requested tests */}
        <SectionCard title="🕐 New Test Requests from Doctors">
          {urgentPending.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
              No new test requests
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {urgentPending.map(t => (
                <div key={t.report_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.85rem 1rem', borderRadius: '0.9rem',
                  background: 'rgba(217,119,6,0.05)', border: '1.5px solid rgba(217,119,6,0.18)',
                  gap: '1rem',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.92rem' }}>
                      {t.report_type}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                      👤 {t.patient_name}
                      {t.requested_by && <span> &nbsp;·&nbsp; 🩺 Dr. {t.requested_by}</span>}
                    </div>
                  </div>
                  <button
                    className="btn btn--primary"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', flexShrink: 0 }}
                    onClick={() => navigate('/lab/pending-tests')}
                  >
                    Accept
                  </button>
                </div>
              ))}
              {pending.filter(t => t.status === 'Requested').length > 5 && (
                <button className="btn btn--ghost" onClick={() => navigate('/lab/pending-tests')}>
                  View all {pending.filter(t => t.status === 'Requested').length} requests →
                </button>
              )}
            </div>
          )}
        </SectionCard>

        {/* Recent completed reports */}
        <SectionCard title="📋 Recent Completed Reports">
          {recentReports.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1.5rem' }}>No reports yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {recentReports.map(r => {
                const st = STATUS_STYLE[r.status] || STATUS_STYLE.Completed;
                return (
                  <div key={r.report_id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.9rem',
                    padding: '0.85rem 1rem', borderRadius: '0.9rem',
                    background: 'rgba(19,117,255,0.03)', border: '1px solid rgba(19,117,255,0.08)',
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>{st.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                        {r.report_type || 'Report'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {r.uploaded_at ? new Date(r.uploaded_at).toLocaleString() : ''}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem',
                      borderRadius: '999px', color: st.color, background: st.bg,
                    }}>
                      {r.status || 'Completed'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default LabDashboard;
