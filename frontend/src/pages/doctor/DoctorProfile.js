import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

function DoctorProfile() {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.doctorProfile()
      .then((data) => { setProfile(data); setForm(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.updateDoctorProfile({
        full_name: form.full_name,
        phone: form.phone,
        specialization: form.specialization,
        qualification: form.qualification,
        experience: form.experience ? parseInt(form.experience) : null,
        hospital_name: form.hospital_name,
      });
      setProfile({ ...profile, ...form });
      setEditing(false);
      setMessage('Profile updated successfully!');
    } catch {
      setMessage('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  const fields = [
    ['Full Name', 'full_name'],
    ['Email', 'email'],
    ['Phone', 'phone'],
    ['Specialization', 'specialization'],
    ['Qualification', 'qualification'],
    ['Experience (years)', 'experience'],
    ['Hospital', 'hospital_name'],
    ['License Number', 'license_number'],
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Doctor Portal" title="My Profile" subtitle="View and update your professional information." />
      <SectionCard title="Profile Information" action={
        !editing && (
          <button onClick={() => setEditing(true)} style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Edit Profile
          </button>
        )
      }>
        {message && (
          <div style={{ padding: '0.8rem 1rem', borderRadius: '0.8rem', backgroundColor: message.includes('success') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: message.includes('success') ? '#047857' : '#dc2626', fontWeight: 600, marginBottom: '1rem' }}>
            {message}
          </div>
        )}
        {!editing ? (
          <div style={{ display: 'grid', gap: '0' }}>
            {fields.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.9rem 0', borderBottom: '1px solid rgba(36,84,128,0.08)' }}>
                <span style={{ fontWeight: 600, color: '#5b7088' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{profile?.[key] || '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {fields.filter(([, k]) => k !== 'email' && k !== 'license_number').map(([label, key]) => (
              <div key={key}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>{label}</label>
                <input
                  value={form[key] || ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}
                />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem' }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: '1rem', borderRadius: '1rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setForm(profile); }}
                style={{ padding: '1rem 1.5rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.15)', background: 'transparent', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </SectionCard>
    </div>
  );
}

export default DoctorProfile;
