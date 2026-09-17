import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';
import { appRoutes } from '../../data/appData';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const inp = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: '0.9rem',
  border: '2px solid rgba(36,84,128,0.12)',
  fontSize: '0.95rem',
  background: '#fff',
  color: '#15304b',
  boxSizing: 'border-box',
};

const readonlyInp = {
  ...inp,
  background: 'rgba(36,84,128,0.04)',
  cursor: 'not-allowed',
  color: '#5b7088',
};

const lbl = {
  fontWeight: 700,
  color: '#365067',
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.88rem',
};

function F({ label, children }) {
  return (
    <div className="flex-col flex-gap--sm" style={{ marginBottom: '1rem' }}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function PatientProfile() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: true });

  useEffect(() => {
    api.patientProfile()
      .then((data) => {
        // Normalize all fields so inputs never get undefined
        setForm({
          full_name:        data.full_name        || '',
          email:            data.email            || '',
          phone:            data.phone            || '',
          gender:           data.gender           || '',
          date_of_birth:    data.date_of_birth    || '',
          blood_group:      data.blood_group      || '',
          height:           data.height           != null ? String(data.height) : '',
          weight:           data.weight           != null ? String(data.weight) : '',
          allergies:        data.allergies        || '',
          chronic_diseases: data.chronic_diseases || '',
          emergency_contact:data.emergency_contact|| '',
          insurance_number: data.insurance_number || '',
          role:             data.role             || '',
          patient_id:       data.patient_id       || '',
        });
      })
      .catch(() => setMsg({ text: 'Failed to load profile. Please refresh.', ok: false }))
      .finally(() => setLoading(false));
  }, []);

  const set = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const navigate = useNavigate();

  const handleSave = async () => {
    setSaving(true);
    setMsg({ text: '', ok: true });
    try {
      await api.updatePatientProfile({
        full_name:         form.full_name         || null,
        phone:             form.phone             || null,
        gender:            form.gender            || null,
        date_of_birth:     form.date_of_birth     || null,
        height:            form.height            ? parseFloat(form.height)  : null,
        weight:            form.weight            ? parseFloat(form.weight)  : null,
        blood_group:       form.blood_group       || null,
        allergies:         form.allergies         || null,
        chronic_diseases:  form.chronic_diseases  || null,
        emergency_contact: form.emergency_contact || null,
        insurance_number:  form.insurance_number  || null,
      });
      setMsg({ text: 'Profile updated successfully!', ok: true });
      navigate(appRoutes.patient.dashboard);
    } catch (err) {
      setMsg({ text: err.message || 'Update failed.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-stack">
        <div className="loading-state">Loading profile...</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="page-stack">
        <div className="alert alert--error" style={{ textAlign: 'center', justifyContent: 'center' }}>
          Failed to load profile. Please check your connection and refresh.
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Profile"
        title="Your Profile"
        subtitle="View and update your personal and medical information."
      />

      {msg.text && (
        <div className={`alert ${msg.ok ? 'alert--success' : 'alert--error'}`}>
          {msg.ok ? '✅' : '❌'} {msg.text}
        </div>
      )}

      {/* Row 1 — Avatar summary + Personal info */}
      <div className="content-grid">

        {/* Avatar card */}
        <SectionCard title="Profile Photo">
          <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
            <div className="avatar-circle avatar-circle--lg" style={{ margin: '0 auto 1rem' }}>👤</div>

            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#15304b', marginBottom: '0.2rem' }}>
              {form.full_name || '—'}
            </div>
            <div style={{ color: '#5b7088', fontSize: '0.88rem', marginBottom: '0.6rem' }}>
              {form.email}
            </div>
            <span className="pill pill--blue">
              {form.role}
            </span>

            {/* Quick-view summary */}
            <div style={{ marginTop: '1.2rem', textAlign: 'left' }}>
              {[
                { label: 'Patient ID',   value: form.patient_id ? `#${form.patient_id}` : '—' },
                { label: 'Blood Group',  value: form.blood_group      || '—' },
                { label: 'Gender',       value: form.gender           || '—' },
                { label: 'Date of Birth',value: form.date_of_birth    || '—' },
                { label: 'Height',       value: form.height  ? `${form.height} cm`  : '—' },
                { label: 'Weight',       value: form.weight  ? `${form.weight} kg`  : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="detail-row" style={{ fontSize: '0.85rem' }}>
                  <span className="detail-row__label">{label}</span>
                  <span className="detail-row__value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Personal info + Emergency */}
        <div className="page-stack">
          <SectionCard title="Personal Information">
            <F label="Full Name">
              <input name="full_name" type="text" value={form.full_name} onChange={set} className="input-field" placeholder="Enter full name" />
            </F>

            <div className="two-col-grid">
              <F label="Gender">
                <select name="gender" value={form.gender} onChange={set} className="select-field">
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </F>
              <F label="Date of Birth">
                <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={set} className="input-field" />
              </F>
            </div>

            <F label="Mobile Number">
              <input name="phone" type="tel" value={form.phone} onChange={set} className="input-field" placeholder="Enter phone number" />
            </F>

            <F label="Email Address">
              <input type="email" value={form.email} readOnly className="input-field" />
              <span className="field-hint">Email cannot be changed</span>
            </F>

            <div className="two-col-grid">
              <F label="Height (cm)">
                <input name="height" type="number" min="50" max="250" step="0.1" value={form.height} onChange={set} className="input-field" placeholder="e.g. 170" />
              </F>
              <F label="Weight (kg)">
                <input name="weight" type="number" min="10" max="300" step="0.1" value={form.weight} onChange={set} className="input-field" placeholder="e.g. 65" />
              </F>
            </div>
          </SectionCard>

          <SectionCard title="Emergency Contact">
            <F label="Emergency Contact Phone">
              <input name="emergency_contact" type="tel" value={form.emergency_contact} onChange={set} className="input-field" placeholder="Enter emergency contact number" />
            </F>
            <div className="highlight-card highlight-card--warning" style={{ fontSize: '0.83rem' }}>
              ⚠️ This number will be contacted in case of a medical emergency.
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Row 2 — Insurance + Medical */}
      <div className="cards-grid">
        <SectionCard title="Insurance Details">
          <F label="Insurance Number">
            <input name="insurance_number" type="text" value={form.insurance_number} onChange={set} className="input-field" placeholder="Enter insurance policy number" />
          </F>
          <div className="highlight-card highlight-card--info" style={{ fontSize: '0.83rem' }}>
            🛡️ Stored securely and only shared with authorized providers.
          </div>
        </SectionCard>

        <SectionCard title="Blood Group & Medical Conditions">
          <F label="Blood Group">
            <select name="blood_group" value={form.blood_group} onChange={set} className="select-field">
              <option value="">Select blood group</option>
              {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </F>
          <F label="Known Allergies">
            <input name="allergies" type="text" value={form.allergies} onChange={set} className="input-field" placeholder="e.g. Penicillin, Peanuts, Dust" />
          </F>
          <F label="Chronic Diseases">
            <textarea name="chronic_diseases" value={form.chronic_diseases} onChange={set} className="textarea-field" placeholder="e.g. Diabetes Type 2, Hypertension" />
          </F>
        </SectionCard>
      </div>

      {/* Save */}
      <div className="flex-end" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`btn btn--primary btn--lg ${saving ? 'btn--disabled' : ''}`}
        >
          {saving ? '⏳ Saving...' : '💾 Save Changes'}
        </button>
      </div>
    </div>
  );
}

export default PatientProfile;
