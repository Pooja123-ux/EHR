import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.patientPrescriptions()
      .then((data) => setPrescriptions(Array.isArray(data) ? data : []))
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = prescriptions.filter((item) => {
    const text = [
      item.medicine_name,
      item.doctor_name,
      item.diagnosis,
      item.frequency,
      item.duration,
      item.instructions,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Patient Portal"
        title="My Prescriptions"
        subtitle="View all medicines prescribed by every doctor you have consulted."
      />

      <SectionCard>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by medicine, doctor, diagnosis, or instruction"
          className="input-field"
          style={{ marginBottom: '1.2rem' }}
        />

        {loading ? (
          <div className="loading-state">Loading prescriptions...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">💊</div>
            <div className="empty-state__title">No prescriptions found.</div>
            <div className="empty-state__desc">Your prescriptions from all doctors will appear here.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Doctor</th>
                  <th>Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Diagnosis</th>
                  <th>Instructions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.prescription_id}>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                    <td>{item.doctor_name || 'Unknown doctor'}</td>
                    <td style={{ fontWeight: 700 }}>{item.medicine_name || '—'}</td>
                    <td>{item.dosage || '—'}</td>
                    <td>{item.frequency || '—'}</td>
                    <td>{item.duration || '—'}</td>
                    <td>{item.diagnosis || '—'}</td>
                    <td style={{ maxWidth: '220px', whiteSpace: 'pre-wrap' }}>{item.instructions || '—'}</td>
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

export default PatientPrescriptions;
