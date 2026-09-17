import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const TYPE_CONFIG = {
  report:       { icon: '🩸', label: 'Lab Report',    color: '#1375ff', bg: 'rgba(19,117,255,0.1)' },
  prescription: { icon: '💊', label: 'Prescription',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  appointment:  { icon: '📅', label: 'Appointment',   color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  surgery:      { icon: '🏥', label: 'Surgery',       color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  vaccine:      { icon: '💉', label: 'Vaccination',   color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  default:      { icon: '📋', label: 'Event',         color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
};

const FILTERS = ['All', 'report', 'prescription', 'appointment', 'surgery', 'vaccine'];

function MedicalTimeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    api.getTimeline()
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'All' ? events : events.filter(e => e.event_type === filter);

  const grouped = filtered.reduce((acc, event) => {
    const year = new Date(event.event_date).getFullYear() || 'Unknown';
    if (!acc[year]) acc[year] = [];
    acc[year].push(event);
    return acc;
  }, {});

  const years = Object.keys(grouped).sort((a, b) => b - a);

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading timeline...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Medical Timeline"
        title="Your Health History"
        subtitle="A complete chronological view of your medical events."
      />

      {/* Stats */}
      <div className="stat-summary">
        {Object.entries(TYPE_CONFIG).filter(([k]) => k !== 'default').map(([type, cfg]) => {
          const count = events.filter(e => e.event_type === type).length;
          return (
            <div key={type} className="stat-summary__item" style={{ background: '#fff', boxShadow: '0 8px 24px rgba(55,95,145,0.08)', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'transparent' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '0.8rem', background: cfg.bg, display: 'grid', placeItems: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{cfg.icon}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: cfg.color }}>{count}</div>
                <div style={{ fontSize: '0.8rem', color: '#5b7088', fontWeight: 600 }}>{cfg.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <SectionCard>
        <div className="flex-wrap" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: '#5b7088', fontSize: '0.9rem', marginRight: '0.3rem' }}>Filter:</span>
          {FILTERS.map(f => {
            const cfg = f === 'All' ? null : TYPE_CONFIG[f];
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} className={`btn btn--sm ${isActive ? 'btn--secondary' : 'btn--ghost'}`}>
                {cfg ? `${cfg.icon} ${cfg.label}` : 'All Events'}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Timeline */}
      <SectionCard>
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">📅</div>
            <div className="empty-state__title">No timeline events yet</div>
            <div className="empty-state__desc">Events are automatically added when you book appointments, receive prescriptions, or get lab reports.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <div className="empty-state__title">No events found</div>
            <div className="empty-state__desc">No events match the current filter. Try selecting a different filter.</div>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '2.5rem' }}>
            <div style={{ position: 'absolute', left: '0.9rem', top: 0, bottom: 0, width: '3px', background: 'linear-gradient(180deg, #1375ff, #00a7c7)', borderRadius: '999px' }} />

            {years.map(year => (
              <div key={year}>
                <div style={{ position: 'relative', marginBottom: '1.2rem', marginTop: '0.5rem' }}>
                  <div style={{ position: 'absolute', left: '-2.15rem', top: '50%', transform: 'translateY(-50%)', width: '1.4rem', height: '1.4rem', borderRadius: '50%', background: 'linear-gradient(135deg, #1375ff, #00a7c7)', display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'inline-block', padding: '0.3rem 1rem', borderRadius: '999px', background: 'linear-gradient(135deg, #1375ff, #00a7c7)', color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}>{year}</div>
                </div>

                {grouped[year].map((event) => {
                  const cfg = TYPE_CONFIG[event.event_type] || TYPE_CONFIG.default;
                  const isOpen = expanded === event.timeline_id;
                  return (
                    <div key={event.timeline_id} style={{ position: 'relative', paddingBottom: '1rem' }}>
                      <div style={{ position: 'absolute', left: '-1.85rem', top: '1rem', width: '1rem', height: '1rem', borderRadius: '50%', background: '#fff', border: `3px solid ${cfg.color}`, boxShadow: `0 4px 12px ${cfg.color}40` }} />

                      <div
                        onClick={() => setExpanded(isOpen ? null : event.timeline_id)}
                        style={{ padding: '1rem 1.2rem', borderRadius: '1.2rem', background: isOpen ? cfg.bg : 'rgba(255,255,255,0.9)', border: `1.5px solid ${isOpen ? cfg.color + '40' : 'rgba(36,84,128,0.08)'}`, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(55,95,145,0.07)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '0.7rem', background: cfg.bg, display: 'grid', placeItems: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{cfg.icon}</div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{event.event_name}</div>
                              <div style={{ fontSize: '0.82rem', color: '#5b7088', fontWeight: 600 }}>
                                {event.event_date ? new Date(event.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: cfg.bg, color: cfg.color, fontSize: '0.78rem', fontWeight: 700 }}>{cfg.label}</span>
                            <span style={{ color: '#8da2b8', fontWeight: 700 }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        {isOpen && event.description && (
                          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${cfg.color}20` }}>
                            <p style={{ margin: 0, color: '#365067', lineHeight: 1.7, fontSize: '0.9rem' }}>{event.description}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default MedicalTimeline;
