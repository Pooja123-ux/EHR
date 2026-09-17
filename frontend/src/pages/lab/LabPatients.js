import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

function LabPatients() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.labPatients()
      .then(setPatients)
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Lab Portal" title="Patients" subtitle="Patients who have reports from your lab." />
      <SectionCard title={`Patients (${patients.length})`}>
        <input
          type="text"
          placeholder="Search patients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.9rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem', marginBottom: '1.2rem' }}
        />
        {filtered.length === 0 ? (
          <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No patients found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                  {['Name', 'Email', 'Phone', 'Gender', 'Blood Group'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.8rem', fontWeight: 700, color: '#5b7088', fontSize: '0.9rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.patient_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                    <td style={{ padding: '0.8rem', fontWeight: 600 }}>{p.full_name}</td>
                    <td style={{ padding: '0.8rem', color: '#5b7088' }}>{p.email}</td>
                    <td style={{ padding: '0.8rem', color: '#5b7088' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '0.8rem' }}>{p.gender || '—'}</td>
                    <td style={{ padding: '0.8rem' }}>
                      {p.blood_group ? (
                        <span style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', padding: '0.2rem 0.7rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.85rem' }}>{p.blood_group}</span>
                      ) : '—'}
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

export default LabPatients;
