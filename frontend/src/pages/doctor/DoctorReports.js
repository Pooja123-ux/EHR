import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api, fileUrl } from '../../services/api';

const STATUS_COLORS = {
  Requested:  { bg: 'rgba(245,158,11,0.1)',   color: '#d97706' },
  Collected:  { bg: 'rgba(19,117,255,0.1)',   color: '#1375ff' },
  Processing: { bg: 'rgba(99,102,241,0.1)',   color: '#4338ca' },
  Completed:  { bg: 'rgba(16,185,129,0.1)',   color: '#047857' },
  Reviewed:   { bg: 'rgba(16,185,129,0.15)',  color: '#065f46' },
};

function DoctorReports() {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.doctorReports()
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) setNotes(selected.doctor_notes || '');
  }, [selected]);

  const handleAction = async (reportId, action) => {
    setActionLoading(true);
    setActionMsg('');
    try {
      await api.reviewReport(reportId, { action, doctor_notes: notes });
      setActionMsg(`Report ${action === 'approve' ? 'approved' : 'sent for retest'} successfully.`);
      const updated = await api.doctorReports();
      setReports(updated);
      const found = updated.find((r) => r.report_id === reportId);
      if (found) setSelected(found);
    } catch (err) {
      setActionMsg('Failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.reviewReport(selected.report_id, { doctor_notes: notes });
      setActionMsg('Notes saved.');
      const updated = await api.doctorReports();
      setReports(updated);
    } catch (err) {
      setActionMsg('Failed to save notes: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Doctor Portal" title="Lab Reports" subtitle="Review patient lab reports, AI summaries, and approve or request retests." />

      <div className="content-grid">
        {/* Left: report list */}
        <SectionCard title={`Reports (${reports.length})`}>
          {reports.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1.5rem' }}>
              No reports found. Reports appear here when you request lab tests or when patients share records with you.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '520px', overflowY: 'auto' }}>
              {reports.map((r) => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.Requested;
                return (
                  <div
                    key={r.report_id}
                    onClick={() => { setSelected(r); setActionMsg(''); }}
                    style={{
                      padding: '0.9rem 1rem', borderRadius: '1rem', cursor: 'pointer',
                      background: selected?.report_id === r.report_id ? 'rgba(19,117,255,0.08)' : 'rgba(19,117,255,0.03)',
                      border: `2px solid ${selected?.report_id === r.report_id ? 'rgba(19,117,255,0.25)' : 'transparent'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          {r.patient_name}
                          {r.shared && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontWeight: 700 }}>
                              Shared
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#5b7088', fontSize: '0.82rem' }}>
                          {r.report_type} • {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'Pending'}
                        </div>
                      </div>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: sc.bg, color: sc.color }}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Right: report detail */}
        <div className="page-stack">
          {!selected ? (
            <SectionCard title="Report Details">
              <div style={{ color: '#5b7088', textAlign: 'center', padding: '2rem' }}>Select a report to view details.</div>
            </SectionCard>
          ) : (
            <>
              {actionMsg && (
                <div style={{ padding: '0.7rem 1rem', borderRadius: '0.8rem', fontWeight: 600, fontSize: '0.88rem', background: actionMsg.includes('Failed') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: actionMsg.includes('Failed') ? '#dc2626' : '#047857' }}>
                  {actionMsg}
                </div>
              )}

              <SectionCard title={`${selected.report_type} — ${selected.patient_name}`}>
                {/* Meta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selected.report_type}</div>
                    <div style={{ color: '#5b7088', fontSize: '0.88rem' }}>Patient: {selected.patient_name}</div>
                    <div style={{ color: '#5b7088', fontSize: '0.85rem' }}>
                      Uploaded: {selected.uploaded_at ? new Date(selected.uploaded_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                  <span style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, ...(STATUS_COLORS[selected.status] || STATUS_COLORS.Requested) }}>
                    {selected.status}
                  </span>
                </div>

                {/* Report file */}
                {selected.report_file ? (
                  <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '1rem', background: 'rgba(19,117,255,0.04)', border: '1.5px solid rgba(19,117,255,0.12)', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📄</div>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Report File Available</div>
                    <a
                      href={fileUrl(selected.report_file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block', padding: '0.5rem 1.2rem', borderRadius: '999px', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}
                    >
                      Open PDF
                    </a>
                  </div>
                ) : (
                  <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '0.8rem', background: 'rgba(245,158,11,0.06)', color: '#92400e', fontSize: '0.85rem' }}>
                    ⚠️ No file attached to this report yet.
                  </div>
                )}

                {/* OCR text */}
                {selected.ocr_text && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Extracted Text (OCR)</div>
                    <div style={{ padding: '1rem', borderRadius: '0.8rem', background: 'rgba(0,0,0,0.03)', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', lineHeight: 1.5 }}>
                      {selected.ocr_text}
                    </div>
                  </div>
                )}

                {/* AI summary */}
                {selected.ai_summary && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>🤖 AI Summary</div>
                    <div style={{ padding: '1rem', borderRadius: '0.8rem', background: 'rgba(16,185,129,0.06)', fontSize: '0.92rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid rgba(16,185,129,0.15)' }}>
                      {selected.ai_summary}
                    </div>
                  </div>
                )}

                {!selected.report_file && !selected.ocr_text && !selected.ai_summary && (
                  <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem', fontSize: '0.9rem' }}>
                    No content available yet. Report may still be processing.
                  </div>
                )}

                {/* Doctor notes */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Doctor Notes</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add clinical notes about this report..."
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.9rem', minHeight: '80px', boxSizing: 'border-box' }}
                  />
                  <button onClick={handleSaveNotes} disabled={actionLoading}
                    style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', borderRadius: '999px', border: '2px solid rgba(19,117,255,0.2)', background: 'transparent', color: '#1375ff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                    {actionLoading ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button onClick={() => handleAction(selected.report_id, 'approve')} disabled={actionLoading}
                    style={{ flex: 1, padding: '0.7rem', borderRadius: '1rem', border: 'none', background: 'rgba(16,185,129,0.15)', color: '#047857', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                    ✓ Approve Report
                  </button>
                  <button onClick={() => handleAction(selected.report_id, 'retest')} disabled={actionLoading}
                    style={{ flex: 1, padding: '0.7rem', borderRadius: '1rem', border: '2px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#dc2626', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                    🔄 Request Retest
                  </button>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DoctorReports;
