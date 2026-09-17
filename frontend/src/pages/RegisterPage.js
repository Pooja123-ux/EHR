import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { appRoutes } from '../data/appData';

function RegisterPage() {
  const [role, setRole] = useState('patient');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // span: 2 = full width, 1 = half width
  const patientFields = [
    { name: 'full_name',         label: 'Full Name',               type: 'text',     span: 2 },
    { name: 'date_of_birth',     label: 'Date of Birth',           type: 'date',     span: 1 },
    { name: 'gender',            label: 'Gender',                  type: 'text',     span: 1, placeholder: 'Male / Female / Other' },
    { name: 'blood_group',       label: 'Blood Group',             type: 'text',     span: 1, placeholder: 'e.g. O+' },
    { name: 'height',            label: 'Height (cm)',             type: 'number',   span: 1, placeholder: 'e.g. 170' },
    { name: 'weight',            label: 'Weight (kg)',             type: 'number',   span: 1, placeholder: 'e.g. 70' },
    { name: 'phone',             label: 'Mobile',                  type: 'text',     span: 1 },
    { name: 'email',             label: 'Email',                   type: 'email',    span: 2 },
    { name: 'password',          label: 'Password',                type: 'password', span: 2 },
    { name: 'emergency_contact', label: 'Emergency Contact',       type: 'text',     span: 1 },
    { name: 'allergies',         label: 'Allergies (optional)',    type: 'text',     span: 1, required: false },
    { name: 'chronic_diseases',  label: 'Chronic Diseases (opt.)', type: 'text',     span: 2, required: false },
  ];

  const doctorFields = [
    { name: 'full_name',        label: 'Full Name',          type: 'text',     span: 2 },
    { name: 'specialization',   label: 'Specialization',     type: 'text',     span: 1 },
    { name: 'qualification',    label: 'Qualification',      type: 'text',     span: 1 },
    { name: 'hospital_name',    label: 'Hospital',           type: 'text',     span: 1 },
    { name: 'license_number',   label: 'License Number',     type: 'text',     span: 1 },
    { name: 'experience',       label: 'Experience (years)', type: 'number',   span: 1 },
    { name: 'phone',            label: 'Mobile',             type: 'text',     span: 1 },
    { name: 'email',            label: 'Email',              type: 'email',    span: 2 },
    { name: 'password',         label: 'Password',           type: 'password', span: 2 },
  ];

  const labFields = [
    { name: 'full_name',            label: 'Contact Person Name',  type: 'text',     span: 2 },
    { name: 'lab_name',             label: 'Lab Name',             type: 'text',     span: 1 },
    { name: 'registration_number',  label: 'Registration Number',  type: 'text',     span: 1 },
    { name: 'address',              label: 'Address',              type: 'text',     span: 2 },
    { name: 'phone',                label: 'Mobile',               type: 'text',     span: 1 },
    { name: 'email',                label: 'Email',                type: 'email',    span: 1 },
    { name: 'password',             label: 'Password',             type: 'password', span: 2 },
  ];

  const adminFields = [
    { name: 'full_name', label: 'Full Name', type: 'text', span: 2 },
    { name: 'hospital_id', label: 'Hospital ID', type: 'number', span: 1 },
    { name: 'phone', label: 'Mobile', type: 'text', span: 1 },
    { name: 'email', label: 'Email', type: 'email', span: 2 },
    { name: 'password', label: 'Password', type: 'password', span: 2 },
  ];

  const getFields = () => {
    if (role === 'patient') return patientFields;
    if (role === 'doctor') return doctorFields;
    if (role === 'lab') return labFields;
    return adminFields;
  };

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;
  const roleIcons = { patient: '🧑‍⚕️', doctor: '👨‍⚕️', lab: '🧪', admin: '🛡️' };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'password') {
      setPasswordError('');
    }
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPasswordError('');
    if (!passwordRegex.test(form.password || '')) {
      const msg = 'Password must be at least 6 characters and include uppercase, lowercase, number, and special character.';
      setPasswordError(msg);
      setError(msg);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        role: role.charAt(0).toUpperCase() + role.slice(1),
        hospital_id: form.hospital_id ? parseInt(form.hospital_id) : undefined,
        height: form.height ? parseFloat(form.height) : undefined,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        experience: form.experience ? parseInt(form.experience) : undefined,
      };
      await api.register(payload);
      const tokenData = await api.login({ email: form.email, password: form.password, role: payload.role });
      login(tokenData);
      if (role === 'patient') navigate(appRoutes.patient.dashboard);
      else if (role === 'doctor') navigate(appRoutes.doctor.dashboard);
      else if (role === 'lab') navigate(appRoutes.lab.dashboard);
      else navigate(appRoutes.admin.dashboard);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">

        {/* Left panel */}
        <div className="register-left">
          <div className="register-left__logo">
            <div className="logo-mark">
              <div className="logo-mark__icon">HC</div>
              <div className="logo-mark__text">
                <strong className="logo-mark__title">Hospital</strong>
                <span className="logo-mark__subtitle">Care Portal</span>
              </div>
            </div>
          </div>
          <h2 className="register-left__title">Join the Platform</h2>
          <p className="register-left__sub">Secure healthcare management for patients, doctors, labs, and administrators.</p>
          <div className="register-left__hint">
            <span>👆</span>
            <span>Select your role below</span>
          </div>
          <div className="register-left__roles">
            {['patient', 'doctor', 'lab', 'admin'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRole(r); setForm({}); setError(''); }}
                className={`register-role-btn ${role === r ? 'active' : ''}`}
              >
                <span className="register-role-btn__icon">{roleIcons[r]}</span>
                <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
              </button>
            ))}
          </div>
          <div className="register-left__footer">
            Already have an account?{' '}
            <Link to="/login" className="register-left__link">Login</Link>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="register-right">
          <h3 className="register-right__title">
            {roleIcons[role]} {role.charAt(0).toUpperCase() + role.slice(1)} Registration
          </h3>

          {error && (
            <div className="register-error">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="register-form">
            <div className="register-grid">
              {getFields().map((field) => (
                <div
                  key={field.name}
                  className={`register-field ${field.span === 2 ? 'register-field--full' : ''}`}
                >
                  <label className="register-label">{field.label}</label>
                  <input
                    type={field.type}
                    name={field.name}
                    placeholder={field.placeholder || ''}
                    value={form[field.name] || ''}
                    onChange={handleChange}
                    required={field.required !== false}
                    className="register-input"
                    {...(field.name === 'password' ? {
                      minLength: 6,
                      pattern: '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{6,}',
                      title: 'At least 6 characters with uppercase, lowercase, number, and special character',
                    } : {})}
                  />
                  {field.name === 'password' && (
                    <>
                      <small className="register-hint">Password must be at least 6 characters and include uppercase, lowercase, number, and special character.</small>
                      {passwordError && <div className="register-error">{passwordError}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
            <button type="submit" className="register-submit" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default RegisterPage;
