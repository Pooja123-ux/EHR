import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api, fileUrl } from '../../services/api';
import { appRoutes } from '../../data/appData';

function MedicalRecords() {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.patientRecords()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (reportId) => {
    setDeletingId(reportId);
    try {
      await api.deleteRecord(reportId);
      setRecords((prev) => prev.filter((r) => r.report_id !== reportId));
    } catch {
      alert('Failed to delete record.');
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const filtered = records.filter((r) =>
    [r.report_type, r.doctor, r.hospital].some((v) =>
      v && v.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Medical Records"
        title="Your Health Records"
        subtitle="View, download, and share your medical records securely."
      >
        <Link to={appRoutes.patient.recordsUpload} className="btn btn--secondary">Upload Record</Link>
        <Link to={appRoutes.patient.aiSummary} className="btn btn--primary">Generate AI Summary</Link>
        <Link to={appRoutes.patient.sharing} className="btn btn--ghost">Share Records</Link>
      </PageHeader>

      <SectionCard>
        <input
          type="text"
          placeholder="Search by report type, doctor, hospital..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
          style={{ marginBottom: '1.4rem' }}
        />

        {loading ? (
          <div className="loading-state">Loading records...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📋</div>
            <div className="empty-state__title">No records found.</div>
            <div className="empty-state__desc">Your medical records will appear here once uploaded by your healthcare providers.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {['Date', 'Source', 'Doctor', 'Report', 'Actions'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.report_id}>
                    <td>{record.uploaded_at ? new Date(record.uploaded_at).toLocaleDateString() : '—'}</td>
                    <td>{record.hospital || 'Personal upload'}</td>
                    <td>{record.doctor || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{record.report_type || '—'}{record.hospital && !record.doctor ? <div style={{ color: '#047857', fontSize: '0.75rem', marginTop: '0.2rem' }}>Lab report received</div> : null}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => navigate(`${appRoutes.patient.aiSummary}?report=${record.report_id}`)}
                          className="btn btn--sm btn--secondary"
                          style={{ margin: 0 }}
                        >
                          AI Summary
                        </button>
                        {record.report_file && (
                          <a
                            href={fileUrl(record.report_file)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn--sm btn--ghost"
                            style={{ textDecoration: 'none' }}
                          >
                            Download
                          </a>
                        )}
                        {confirmId === record.report_id ? (
                          <>
                            <button
                              onClick={() => handleDelete(record.report_id)}
                              disabled={deletingId === record.report_id}
                              style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', border: 'none', background: 'rgba(239,68,68,0.9)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                              {deletingId === record.report_id ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', border: '1.5px solid rgba(36,84,128,0.2)', background: 'transparent', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmId(record.report_id)}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', border: 'none', background: 'rgba(239,68,68,0.12)', color: '#dc2626', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default MedicalRecords;
