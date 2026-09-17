import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const EMPTY_FORM = {
  patient_id: '', medicine_name: '', dosage: '', frequency: '', duration: '', instructions: '',
};

const FREQUENCIES = ['', 'Once Daily', 'Twice Daily', 'Three Times Daily', 'Four Times Daily', 'As Needed (SOS)', 'Once Weekly'];
const DURATIONS = ['', '3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '30 Days', 'Ongoing'];

function DoctorPrescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState('list');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.doctorPrescriptions(), api.doctorPatients()])
      .then(([p, pts]) => { setPrescriptions(p); setPatients(pts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Create medical record first
      const record = await api.createMedicalRecord({
        patient_id: parseInt(form.patient_id),
        diagnosis: 'Prescription',
        symptoms: '',
        doctor_notes: form.instructions || '',
      });
      await api.createPrescription({
        record_id: record.record_id,
        medicine_name: form.medicine_name,
        dosage: form.dosage,
        frequency: form.frequency,
        duration: form.duration,
        instructions: form.instructions,
      });
      const updated = await api.doctorPrescriptions();
      setPrescriptions(updated);
      setForm(EMPTY_FORM);
      setStep('list');
    } catch (err) {
      setError(err.message || 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Doctor Portal" title="Prescriptions" subtitle="Create and manage patient prescriptions." />

      {step === 'list' ? (
        <SectionCard title={`Prescriptions (${prescriptions.length})`} action={
          <button onClick={() => setStep('new')}
            style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            + New Prescription
          </button>
        }>
          {prescriptions.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No prescriptions yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                    {['Patient', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Diagnosis', 'Date'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.85rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p) => (
                    <tr key={p.prescription_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                      <td style={{ padding: '0.7rem', fontWeight: 600 }}>{p.patient_name}</td>
                      <td style={{ padding: '0.7rem' }}>{p.medicine_name}</td>
                      <td style={{ padding: '0.7rem' }}>{p.dosage || '—'}</td>
                      <td style={{ padding: '0.7rem' }}>{p.frequency || '—'}</td>
                      <td style={{ padding: '0.7rem' }}>{p.duration || '—'}</td>
                      <td style={{ padding: '0.7rem', color: '#5b7088' }}>{p.diagnosis || '—'}</td>
                      <td style={{ padding: '0.7rem', color: '#5b7088' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="New Prescription">
          {error && (
            <div style={{ padding: '0.8rem 1rem', borderRadius: '0.8rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626', fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Patient *</label>
              <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}>
                <option value="">Select patient</option>
                {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.full_name}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Medicine Name *</label>
                <input required value={form.medicine_name} onChange={(e) => setForm({ ...form, medicine_name: e.target.value })}
                  placeholder="e.g., Paracetamol"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Dosage</label>
                <input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                  placeholder="e.g., 500mg"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f || 'Select frequency'}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Duration</label>
                <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d || 'Select duration'}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Instructions</label>
              <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="e.g., Take after food, avoid alcohol..."
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem', minHeight: '70px' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: '1rem', borderRadius: '1rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}>
                {saving ? 'Saving...' : '💊 Save Prescription'}
              </button>
              <button type="button" onClick={() => { setStep('list'); setError(''); setForm(EMPTY_FORM); }}
                style={{ padding: '1rem 1.5rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.15)', background: 'transparent', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

export default DoctorPrescriptions;
