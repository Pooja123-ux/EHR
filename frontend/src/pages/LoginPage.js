import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { appRoutes } from '../data/appData';

const roleIcons = {
  patient: '🧑‍⚕️',
  doctor: '👨‍⚕️',
  lab: '🧪',
  admin: '🛡️',
};

const roleDescriptions = {
  patient: 'Access your medical records, appointments, and AI health insights.',
  doctor: 'Manage patients, review reports, and leverage AI clinical support.',
  lab: 'Upload test results, manage orders, and validate reports with AI.',
  admin: 'Oversee platform operations, approvals, and system analytics.',
};

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ email, password, role: role.charAt(0).toUpperCase() + role.slice(1) });
      login(data);
      if (data.role === 'Patient') navigate(appRoutes.patient.dashboard);
      else if (data.role === 'Doctor') navigate(appRoutes.doctor.dashboard);
      else if (data.role === 'Lab') navigate(appRoutes.lab.dashboard);
      else if (data.role === 'Admin') navigate(appRoutes.admin.dashboard);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-left">
          <div className="login-left__shapes">
            <div className="login-shape login-shape--1"></div>
            <div className="login-shape login-shape--2"></div>
            <div className="login-shape login-shape--3"></div>
          </div>
          <div className="login-left__content">
            <div className="login-left__logo">
              <div className="logo-mark">
                <div className="logo-mark__icon">HC</div>
                <div className="logo-mark__text">
                  <strong className="logo-mark__title">Hospital</strong>
                  <span className="logo-mark__subtitle">Care Portal</span>
                </div>
              </div>
            </div>
            <h2 className="login-left__title">Hospital Care Access</h2>
            <p className="login-left__sub">
              Secure healthcare access for patients, doctors, labs, and administrators.
            </p>
            <div className="login-left__roles-preview">
              <div className="login-preview-item">
                <span className="login-preview-item__icon">🔒</span>
                <div>
                  <div className="login-preview-item__title">End-to-End Encryption</div>
                  <div className="login-preview-item__desc">Your health data stays private & secure</div>
                </div>
              </div>
              <div className="login-preview-item">
                <span className="login-preview-item__icon">🤖</span>
                <div>
                  <div className="login-preview-item__title">Smart Insights</div>
                  <div className="login-preview-item__desc">Summaries & clinical support</div>
                </div>
              </div>
              <div className="login-preview-item">
                <span className="login-preview-item__icon">⚡</span>
                <div>
                  <div className="login-preview-item__title">Instant Access</div>
                  <div className="login-preview-item__desc">Records available anytime, anywhere</div>
                </div>
              </div>
            </div>
          </div>
          <div className="login-left__footer">
            New here?{' '}
            <Link to="/register" className="login-left__link">Create Account</Link>
          </div>
        </div>
        <div className="login-right">
          <div className="login-right__inner">
            <div className="login-right__header">
              <h3 className="login-right__title">Welcome Back</h3>
              <p className="login-right__subtitle">Sign in to your account to continue</p>
            </div>
            {error && (
              <div className="login-error">
                <span className="login-error__icon">!</span>
                <span>{error}</span>
              </div>
            )}
            <div className="login-role-tabs">
              {['patient', 'doctor', 'lab', 'admin'].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`login-role-tab ${role === r ? 'active' : ''}`}
                  onClick={() => { setRole(r); setError(''); }}
                >
                  <span className="login-role-tab__icon">{roleIcons[r]}</span>
                  <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label className="login-label">Email Address</label>
                <div className="login-input-wrapper">
                  <span className="login-input-icon"></span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="login-input"
                  />
                </div>
              </div>
              <div className="login-field">
                <label className="login-label">Password</label>
                <div className="login-input-wrapper">
                  <span className="login-input-icon"></span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="login-input"
                  />
                </div>
              </div>
              <div className="login-options">
                <label className="login-remember">
                  <input type="checkbox" defaultChecked />
                  <span>Remember me</span>
                </label>
                <Link to="/forgot-password" className="login-forgot">Forgot Password?</Link>
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? (
                  <span className="login-submit__loading">
                    <span className="login-spinner"></span>
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
            <div className="login-right__footer">
              Don't have an account?{' '}
              <Link to="/register" className="login-right__link">Register here</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
