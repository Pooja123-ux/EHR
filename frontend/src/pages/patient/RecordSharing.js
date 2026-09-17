import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const VALIDITY_OPTIONS = [
  { value: 1,  label: '1 Day',   desc: 'Expires tomorrow' },
  { value: 7,  label: '7 Days',  desc: 'Expires next week' },
  { value: 30, label: '30 Days', desc: 'Expires next month' },
];

function RecordSharing() {
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [sharings, setSharings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [validity, setValidity] = useState(7);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState(1);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([api.getDoctors(), api.patientRecords(), api.getConsentSharings()])
      .then(([docs, recs, shares]) => { setDoctors(docs); setRecords(recs); setSharings(shares); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleRecord = (id) => setSelectedRecords(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const handleShare = async () => {
    if (!selectedDoctor || selectedRecords.length === 0 || !consent) return;
    setSubmitting(true);
    setError('');
    try {
      const newShares = await api.createConsentSharing({
        shared_with_user_id: selectedDoctor.user_id,
        record_ids: selectedRecords,
        permission: 'read',
        expiry_days: validity,
      });
      setSharings(prev => [...newShares, ...prev]);
      setSuccess(`Records shared with ${selectedDoctor.name} successfully!`);
      setSelectedDoctor(null);
      setSelectedRecords([]);
      setConsent(false);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(doctorSearch.toLowerCase()) ||
    (d.specialization || '').toLowerCase().includes(doctorSearch.toLowerCase())
  );

  const canShare = selectedDoctor && selectedRecords.length > 0 && consent;

  if (loading) return <div className="page-stack"><div className="loading-state"><div>Loading...</div></div></div>;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Record Sharing"
        title="Share Medical Records"
        subtitle="Securely share your records with doctors with full control over access."
      />

      {success && (
        <div className="alert alert--success">
          ✅ {success}
        </div>
      )}

      <div className="two-col-grid" style={{ gridTemplateColumns: '1fr 380px', gap: '1.4rem' }}>

        {/* Left: Sharing form */}
        <div className="page-stack">

          {/* Step 1: Select Doctor */}
          <SectionCard title="Step 1 — Select Doctor">
            <input
              placeholder="Search doctor or specialization..."
              value={doctorSearch}
              onChange={e => setDoctorSearch(e.target.value)}
              className="input-field"
              style={{ marginBottom: '0.8rem' }}
            />
            {filteredDoctors.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state__desc">No doctors found. Doctors must be registered by the admin.</div>
              </div>
            ) : (
              <div className="flex-col" style={{ gap: '0.5rem' }}>
                {filteredDoctors.map(d => {
                  const isSelected = selectedDoctor?.doctor_id === d.doctor_id;
                  return (
                    <div
                      key={d.doctor_id}
                      onClick={() => { setSelectedDoctor(d); setStep(s => Math.max(s, 2)); }}
                      className={`highlight-card`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.9rem 1rem', border: '2px solid', borderColor: isSelected ? '#1375ff' : 'rgba(36,84,128,0.1)', background: isSelected ? 'rgba(19,117,255,0.06)' : '#fff', cursor: 'pointer' }}
                    >
                      <div className="avatar-circle" style={{ width: '40px', height: '40px', fontSize: '1rem' }}>
                        {d.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: '0.85rem', color: '#5b7088' }}>{d.specialization || 'General'} • {d.hospital_name || '—'}</div>
                      </div>
                      {isSelected && <span className="pill pill--blue" style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Step 2: Select Records */}
          {step >= 2 && (
            <SectionCard title="Step 2 — Select Records to Share">
              {records.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-state__desc">No lab reports available to share.</div>
                </div>
              ) : (
                <div className="flex-col" style={{ gap: '0.5rem' }}>
                  {records.map(r => {
                    const isSelected = selectedRecords.includes(r.report_id);
                    return (
                      <div
                        key={r.report_id}
                        onClick={() => toggleRecord(r.report_id)}
                        className="highlight-card"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem 1rem', border: '2px solid', borderColor: isSelected ? '#1375ff' : 'rgba(36,84,128,0.1)', background: isSelected ? 'rgba(19,117,255,0.06)' : '#fff', cursor: 'pointer' }}
                      >
                        <div style={{ width: '20px', height: '20px', borderRadius: '0.4rem', border: '2px solid', borderColor: isSelected ? '#1375ff' : 'rgba(36,84,128,0.3)', background: isSelected ? '#1375ff' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.report_type || `Report #${r.report_id}`}</div>
                          <div style={{ fontSize: '0.8rem', color: '#5b7088' }}>
                            {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '—'} • {r.hospital || '—'}
                          </div>
                        </div>
                        <span className="pill pill--green" style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}>Available</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedRecords.length > 0 && (
                <div className="alert alert--info" style={{ fontSize: '0.85rem', marginTop: '0.8rem' }}>
                  {selectedRecords.length} record{selectedRecords.length > 1 ? 's' : ''} selected
                </div>
              )}
            </SectionCard>
          )}

          {/* Step 3: Validity + Consent + Share */}
          {step >= 2 && (
            <SectionCard title="Step 3 — Set Access & Share">
              <div style={{ marginBottom: '1.2rem' }}>
                <div className="field-label" style={{ marginBottom: '0.6rem' }}>Access Validity</div>
                <div className="three-col-grid" style={{ gap: '0.6rem' }}>
                  {VALIDITY_OPTIONS.map(v => {
                    const isActive = validity === v.value;
                    return (
                      <button key={v.value} onClick={() => setValidity(v.value)} className="btn" style={{ padding: '0.8rem', border: '2px solid', borderColor: isActive ? '#1375ff' : 'rgba(36,84,128,0.15)', background: isActive ? 'rgba(19,117,255,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, color: isActive ? '#1375ff' : '#15304b' }}>{v.label}</div>
                        <div style={{ fontSize: '0.78rem', color: '#5b7088' }}>{v.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div onClick={() => setConsent(!consent)} className="highlight-card" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem', border: '2px solid', borderColor: consent ? '#1375ff' : 'rgba(36,84,128,0.15)', background: consent ? 'rgba(19,117,255,0.06)' : 'transparent', cursor: 'pointer', marginBottom: '1.2rem' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '0.4rem', border: '2px solid', borderColor: consent ? '#1375ff' : 'rgba(36,84,128,0.3)', background: consent ? '#1375ff' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {consent && <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 900 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>I consent to share selected records</div>
                  <div style={{ fontSize: '0.82rem', color: '#5b7088' }}>Access will expire after {VALIDITY_OPTIONS.find(v => v.value === validity)?.label}</div>
                </div>
              </div>

              {error && (
                <div className="alert alert--error" style={{ marginBottom: '1rem' }}>{error}</div>
              )}

              <button onClick={handleShare} disabled={!canShare || submitting} className={`btn btn--lg`} style={{ width: '100%', justifyContent: 'center', background: canShare ? 'linear-gradient(135deg, #1375ff, #00a7c7)' : 'rgba(36,84,128,0.15)', color: canShare ? '#fff' : '#8da2b8', cursor: canShare ? 'pointer' : 'not-allowed', border: 'none' }}>
                {submitting ? '⏳ Sharing...' : '🔗 Share Records'}
              </button>
            </SectionCard>
          )}
        </div>

        {/* Right: Activity Log */}
        <div className="page-stack">
          <SectionCard title="📋 Sharing Activity">
            {sharings.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state__desc">No sharing activity yet.</div>
              </div>
            ) : (
              <div className="flex-col" style={{ gap: '0.8rem' }}>
                {sharings.map((item) => {
                  const isActive = item.status === 'Active';
                  return (
                    <div key={item.consent_id} className="highlight-card" style={{ padding: '1rem', background: isActive ? 'rgba(19,117,255,0.05)' : 'rgba(0,0,0,0.02)', border: '1.5px solid', borderColor: isActive ? 'rgba(19,117,255,0.2)' : 'rgba(36,84,128,0.08)' }}>
                      <div className="flex-between" style={{ marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Shared with {item.shared_with_name}</div>
                        <span className={`pill ${isActive ? 'pill--green' : 'pill--red'}`} style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                          {item.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#5b7088' }}>
                        Expires: {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'} • {item.permission} access
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="🔒 Privacy Notice">
            <div className="flex-col" style={{ gap: '0.6rem', fontSize: '0.85rem', color: '#5b7088', lineHeight: 1.6 }}>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}><span>🔐</span><span>All shared records are access-controlled</span></div>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}><span>⏱️</span><span>Access automatically expires after the set period</span></div>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}><span>👁️</span><span>Only the selected doctor can view shared records</span></div>
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}><span>📝</span><span>All sharing activity is logged for your security</span></div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default RecordSharing;
