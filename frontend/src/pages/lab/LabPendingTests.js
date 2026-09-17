import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const STATUS_ORDER = ['Requested', 'Collected', 'Processing', 'Completed'];

const STATUS_STYLE = {
  Requested:  { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.25)',   icon: '🕐' },
  Collected:  { color: '#2563eb', bg: 'rgba(37,99,235,0.08)',  border: 'rgba(37,99,235,0.2)',    icon: '🧪' },
  Processing: { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.2)',   icon: '⚙️' },
  Completed:  { color: '#059669', bg: 'rgba(5,150,105,0.08)',  border: 'rgba(5,150,105,0.2)',    icon: '✅' },
};

const TYPE_ICON = {
  'Blood Test': '🩸', 'X-Ray': '🦴', 'MRI': '🧠', 'ECG': '❤️',
  'CBC': '🔬', 'Urine Test': '🧪', 'CT Scan': '🫁', 'Ultrasound': '🔊',
  'Biopsy': '🔬',
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Requested;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.25rem 0.7rem', borderRadius: '999px', fontSize: '0.78rem',
      fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      {s.icon} {status}
    </span>
  );
}

function PreviousTestsPanel({ tests }) {
  const [expanded, setExpanded] = useState(false);
  if (!tests || tests.length === 0) return null;
  return (
    <div style={{ marginTop: '0.6rem', borderTop: '1px dashed rgba(36,84,128,0.12)', paddingTop: '0.6rem' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem',
          color: '#1375ff', fontWeight: 600, padding: '0', display: 'flex', alignItems: 'center', gap: '0.3rem',
        }}
      >
        📋 Previous Tests ({tests.length}) {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {tests.map((pt) => (
            <div key={pt.report_id} style={{
              padding: '0.35rem 0.7rem', borderRadius: '0.6rem',
              background: 'rgba(19,117,255,0.06)', border: '1px solid rgba(19,117,255,0.12)',
              fontSize: '0.78rem', color: '#334155',
            }}>
              {TYPE_ICON[pt.report_type] || '📋'} {pt.report_type || 'Report'}
              <span style={{ marginLeft: '0.4rem', color: pt.status === 'Completed' ? '#059669' : '#d97706' }}>
                · {pt.status}
              </span>
              {pt.uploaded_at && (
                <span style={{ marginLeft: '0.4rem', color: '#64748b' }}>
                  · {new Date(pt.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabPendingTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState('All');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.labPendingTests()
      .then(setTests)
      .catch(() => setTests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const nextStatus = (current) => {
    const idx = STATUS_ORDER.indexOf(current);
    return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  const handleAdvance = async (reportId, currentStatus) => {
    const next = nextStatus(currentStatus);
    if (!next) return;
    setUpdating(reportId);
    try {
      await api.updatePendingStatus(reportId, next);
      if (next === 'Completed') {
        // Navigate to upload results pre-filled with this report
        navigate(`/lab/upload-results?report_id=${reportId}`);
      } else {
        load();
      }
    } catch {
      alert('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tests.filter(t => t.status === s).length;
    return acc;
  }, {});

  const filtered = filter === 'All' ? tests : tests.filter(t => t.status === filter);

  if (loading) return (
    <div className="page-stack">
      <div style={{ padding: '2rem', textAlign: 'center' }}>Loading pending tests...</div>
    </div>
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Lab Portal"
        title="Pending Tests"
        subtitle="Doctor-requested lab tests — collect samples, process, and upload results."
      />

      {/* Summary stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {STATUS_ORDER.map((s) => {
          const st = STATUS_STYLE[s];
          return (
            <div
              key={s}
              onClick={() => setFilter(filter === s ? 'All' : s)}
              style={{
                padding: '1rem 1.2rem', borderRadius: '1rem', cursor: 'pointer',
                background: filter === s ? st.bg : 'white',
                border: `2px solid ${filter === s ? st.border : 'rgba(36,84,128,0.08)'}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{st.icon}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: st.color }}>{counts[s]}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{s}</div>
            </div>
          );
        })}
      </div>

      <SectionCard title={`${filter === 'All' ? 'All' : filter} Tests (${filtered.length})`}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🧪</div>
            <div style={{ fontWeight: 600 }}>No {filter !== 'All' ? filter.toLowerCase() : ''} tests found</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map((t) => {
              const next = nextStatus(t.status);
              const isUpdating = updating === t.report_id;
              const typeIcon = TYPE_ICON[t.report_type] || '📋';
              return (
                <div key={t.report_id} style={{
                  display: 'grid', gridTemplateColumns: '2.5rem 1fr auto',
                  gap: '1rem', alignItems: 'center',
                  padding: '1rem 1.2rem', borderRadius: '1rem',
                  background: t.assigned_to_me ? 'rgba(19,117,255,0.03)' : 'rgba(245,158,11,0.03)',
                  border: `1.5px solid ${t.assigned_to_me ? 'rgba(19,117,255,0.1)' : 'rgba(245,158,11,0.15)'}`,
                }}>
                  {/* Icon */}
                  <div style={{ fontSize: '1.6rem', textAlign: 'center' }}>{typeIcon}</div>

                  {/* Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{t.report_type}</span>
                      <StatusBadge status={t.status} />
                      {!t.assigned_to_me && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                          borderRadius: '999px', background: 'rgba(245,158,11,0.1)', color: '#d97706',
                          border: '1px solid rgba(245,158,11,0.25)',
                        }}>Unassigned</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', fontSize: '0.83rem', color: '#64748b' }}>
                      <span>👤 <strong style={{ color: '#334155' }}>{t.patient_name}</strong></span>
                      {t.patient_gender && <span>{t.patient_gender}</span>}
                      {t.patient_blood_group && <span>🩸 {t.patient_blood_group}</span>}
                      {t.requested_by && <span>🩺 Dr. {t.requested_by}{t.doctor_specialization ? ` · ${t.doctor_specialization}` : ''}</span>}
                      <span>📅 {t.requested_at ? new Date(t.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                    </div>
                    {t.previous_tests && t.previous_tests.length > 0 && (
                      <PreviousTestsPanel tests={t.previous_tests} />
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    {next && next !== 'Completed' && (
                      <button
                        onClick={() => handleAdvance(t.report_id, t.status)}
                        disabled={isUpdating}
                        className="btn btn--secondary"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
                      >
                        {isUpdating ? '...' : `Mark ${next}`}
                      </button>
                    )}
                    {(t.status === 'Processing' || t.status === 'Collected') && (
                      <button
                        onClick={() => navigate(`/lab/upload-results?report_id=${t.report_id}&patient_id=${t.patient_id}&report_type=${encodeURIComponent(t.report_type)}`)}
                        className="btn btn--primary"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
                      >
                        Upload Results
                      </button>
                    )}
                    {t.status === 'Requested' && (
                      <button
                        onClick={() => handleAdvance(t.report_id, t.status)}
                        disabled={isUpdating}
                        className="btn btn--primary"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
                      >
                        {isUpdating ? '...' : 'Accept & Collect'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default LabPendingTests;
