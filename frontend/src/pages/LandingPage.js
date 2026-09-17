import { Link } from 'react-router-dom';

const trustPills = [
  { icon: '🔒', label: 'Secure Access', variant: 'pill--green' },
  { icon: '⚡', label: 'Smart Workflow', variant: 'pill--purple' },
  { icon: '🌐', label: 'Role Portals', variant: 'pill--cyan' },
  { icon: '🛡️', label: 'Protected', variant: 'pill--blue' },
];

const features = [
  {
    icon: '📁',
    title: 'Digital Health Records',
    desc: 'Secure centralized storage of complete patient medical histories accessible anytime.',
    gradient: 'from-blue',
  },
  {
    icon: '🤖',
    title: 'AI Report Summaries',
    desc: 'LLM-powered concise summaries of complex medical reports for faster comprehension.',
    gradient: 'from-purple',
  },
  {
    icon: '🩺',
    title: 'Disease Risk Prediction',
    desc: 'Machine learning models analyze patient data to flag potential health risks early.',
    gradient: 'from-teal',
  },
  {
    icon: '💊',
    title: 'Drug Interaction Check',
    desc: 'Automatically detects harmful drug combinations to prevent adverse reactions.',
    gradient: 'from-orange',
  },
  {
    icon: '📅',
    title: 'Smart Appointment Booking',
    desc: 'Seamless scheduling across providers with automated reminders and slot management.',
    gradient: 'from-indigo',
  },
  {
    icon: '🔒',
    title: 'Secure Record Sharing',
    desc: 'Role-based access control with encrypted sharing between authorized stakeholders.',
    gradient: 'from-green',
  },
];

const stakeholders = [
  {
    role: 'Patient',
    emoji: '🧑',
    quote: 'I finally have all my medical records in one place — accessible, understandable, and always with me.',
    benefit: 'Own your health data, view AI insights, and book care effortlessly.',
    gradient: 'from-blue',
  },
  {
    role: 'Doctor',
    emoji: '👨‍⚕️',
    quote: 'AI summaries cut my chart review time in half so I can focus on what matters — my patients.',
    benefit: 'Spend less time on paperwork, more on clinical care with AI assistance.',
    gradient: 'from-teal',
  },
  {
    role: 'Lab',
    emoji: '🧪',
    quote: 'Digitizing printed reports with OCR and validating results with AI has been transformative.',
    benefit: 'Streamline report workflows, reduce errors, and integrate seamlessly.',
    gradient: 'from-purple',
  },
  {
    role: 'Admin',
    emoji: '👔',
    quote: 'A unified dashboard gives me complete visibility into platform operations and approvals.',
    benefit: 'Oversee the entire system, manage users, and drive operational efficiency.',
    gradient: 'from-orange',
  },
];

function LandingPage() {
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="nav-logo">
          <div className="logo-mark">
            <div className="logo-mark__icon">HC</div>
            <span>Hospital<span style={{ color: '#1375ff' }}>Care</span></span>
          </div>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#stakeholders">Stakeholders</a>
          <Link to="/login" className="nav-link-btn">Login</Link>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-trust-bar">
            {trustPills.map((p) => (
              <span key={p.label} className={`pill ${p.variant}`}>
                <span>{p.icon}</span>
                {p.label}
              </span>
            ))}
          </div>
          <h1 className="hero-title">
            <span className="hero-title__gradient">Digital</span>
            <br />
            Healthcare Records System
          </h1>
          <p className="hero-subtitle">
            Secure • Organized • Connected — supporting patients, doctors, labs, and administrators in one unified platform.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn--primary btn--lg">
              Get Started Free →
            </Link>
            <a href="#features" className="btn btn--secondary btn--lg">
              Explore Features
            </a>
          </div>
          <div className="hero-social-proof">
            <div className="hero-social-proof__avatars">
              {['🧑', '👨‍⚕️', '🧪', '👔'].map((e, i) => (
                <div
                  key={i}
                  className="avatar-circle avatar-circle--sm hero-social-proof__avatar"
                >
                  {e}
                </div>
              ))}
            </div>
            <div>
              <div className="hero-social-proof__title">Trusted by 4+ stakeholder roles</div>
              <div className="hero-social-proof__sub">Built for modern healthcare teams</div>
            </div>
          </div>
        </div>
          <div className="hero-visual">
            <div className="hero-svg">
              <div className="hero-shape shape-1"></div>
              <div className="hero-shape shape-2"></div>
              <div className="hero-shape shape-3"></div>
              <div className="hero-visual-inner">
                <div className="hero-visual-inner__icon">🩺</div>
                <div className="hero-visual-inner__title">Hospital</div>
                <div className="hero-visual-inner__sub">Care Portal</div>
              </div>
            </div>
          </div>
      </section>

      <section id="features" className="features-section">
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 2.5rem' }}>
          <p className="section-eyebrow">Powerful Features</p>
          <h2 className="section-title" style={{ marginTop: '0.6rem', marginBottom: '1rem' }}>
            Everything you need for{' '}
            <span style={{ color: '#1375ff' }}>Modern Healthcare</span>
          </h2>
          <p className="text-muted" style={{ lineHeight: 1.7, fontSize: '1.05rem', margin: 0 }}>
            A complete EHR suite infused with artificial intelligence — designed to reduce admin work
            and improve patient outcomes.
          </p>
        </div>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card section-card">
              <div
                className={`feature-card__icon feature-card__icon--${f.gradient.replace('from-', '')}`}
              >
                {f.icon}
              </div>
              <div className="feature-card__title">{f.title}</div>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="about-section">
        <div className="about-inner">
          <div className="about-text">
            <p className="about-eyebrow">About the Platform</p>
            <h2 className="about-title">
              Redefining Healthcare Records with{' '}
              <span style={{ color: '#1375ff' }}>AI Intelligence</span>
            </h2>
            <p className="about-desc">
              This healthcare management platform enables secure storage, management, and sharing
              of patient medical records among hospitals, doctors, laboratories, and patients.
            </p>
            <p className="about-desc">
              The system supports clinical workflows through structured record access, report review,
              appointment coordination, and AI-assisted insights that simplify decision support.
            </p>
            <p className="about-desc">
              Built using React, FastAPI, PostgreSQL, and secure authentication, the platform offers
              a scalable and organized solution for modern healthcare record management.
            </p>
            <div className="about-divider"></div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="pill pill--blue">
                <span>⚛️</span> React Frontend
              </span>
              <span className="pill pill--green">
                <span>🐍</span> FastAPI Backend
              </span>
              <span className="pill pill--purple">
                <span>🐘</span> PostgreSQL
              </span>
              <span className="pill pill--cyan">
                <span>🧠</span> LLM + OCR
              </span>
            </div>
          </div>
          <div className="about-stats">
            <div className="about-stat-card stat-card">
              <div className="about-stat-icon">👥</div>
              <div className="about-stat-value">4</div>
              <div className="about-stat-label">Role Portals</div>
              <div className="about-stat-sub">Patient, Doctor, Lab, Admin</div>
            </div>
            <div className="about-stat-card stat-card">
              <div className="about-stat-icon">🤖</div>
              <div className="about-stat-value">AI</div>
              <div className="about-stat-label">Insights</div>
              <div className="about-stat-sub">Report summaries and predictions</div>
            </div>
            <div className="about-stat-card stat-card">
              <div className="about-stat-icon">🔒</div>
              <div className="about-stat-value">Secure</div>
              <div className="about-stat-label">Access</div>
              <div className="about-stat-sub">Role-based permissions</div>
            </div>
            <div className="about-stat-card stat-card">
              <div className="about-stat-icon">📋</div>
              <div className="about-stat-value">12+</div>
              <div className="about-stat-label">Modules</div>
              <div className="about-stat-sub">Records, booking, sharing, summaries</div>
            </div>
          </div>
        </div>
      </section>

      <section id="stakeholders" className="testimonials-section">
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 2.5rem' }}>
          <p className="section-eyebrow">Built for Everyone</p>
          <h2 className="section-title" style={{ marginTop: '0.6rem', marginBottom: '1rem' }}>
            <span style={{ color: '#1375ff' }}>Stakeholder</span> Experiences
          </h2>
          <p className="text-muted" style={{ lineHeight: 1.7, fontSize: '1.05rem', margin: 0 }}>
            Each role gets a purpose-built portal with tailored features and healthcare-focused benefits.
          </p>
        </div>
        <div className="testimonials-grid">
          {stakeholders.map((s) => (
            <div key={s.role} className="testimonial-card section-card">
              <div className="testimonial-card__header">
                <div
                  className="avatar-circle avatar-circle--lg"
                  style={{
                    background:
                      s.gradient === 'from-blue'
                        ? 'linear-gradient(135deg, #1375ff, #00b6c9)'
                        : s.gradient === 'from-teal'
                        ? 'linear-gradient(135deg, #0891b2, #10b981)'
                        : s.gradient === 'from-purple'
                        ? 'linear-gradient(135deg, #7c3aed, #1375ff)'
                        : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  }}
                >
                  {s.emoji}
                </div>
                <div>
                  <div className="testimonial-card__role">{s.role}</div>
                  <span
                    className={`pill ${
                      s.gradient === 'from-blue'
                        ? 'pill--blue'
                        : s.gradient === 'from-teal'
                        ? 'pill--cyan'
                        : s.gradient === 'from-purple'
                        ? 'pill--purple'
                        : 'pill--orange'
                    }`}
                  >
                    <span>✨</span> Portal
                  </span>
                </div>
              </div>
              <p className="testimonial-text">
                &quot;{s.quote}&quot;
              </p>
              <div className="testimonial-card__benefit">
                <div className="testimonial-card__benefit-label">Key Benefit</div>
                <div className="testimonial-card__benefit-text">{s.benefit}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner">
          <div className="cta-section__orb cta-section__orb--1"></div>
          <div className="cta-section__orb cta-section__orb--2"></div>
          <h2 className="cta-section__title">Ready to Transform Healthcare Records?</h2>
          <p className="cta-section__desc">
            Join the future of healthcare management today. Create your account and experience a
            modern healthcare platform designed for everyone.
          </p>
          <div className="cta-section__actions">
            <Link to="/register" className="cta-btn cta-btn--primary">
              Create Free Account →
            </Link>
            <Link to="/login" className="cta-btn cta-btn--secondary">
              Sign In Instead
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>
          © 2026 Hospital Care Portal
        </div>
        <div style={{ fontSize: '0.82rem', color: '#8da2b8' }}>
          Built with React · FastAPI · PostgreSQL · Secure access
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
