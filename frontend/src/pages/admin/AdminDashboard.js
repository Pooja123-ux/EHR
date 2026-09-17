import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const TABS = ['Overview', 'Doctors', 'Patients', 'Labs', 'Appointments'];

const STATUS_BADGE = {
  Active:    { bg: 'rgba(16,185,129,0.12)',  color: '#047857' },
  Inactive:  { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  Suspended: { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  Pending:   { bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  Confirmed: { bg: 'rgba(16,185,129,0.12)',  color: '#047857' },
  Cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  Completed: { bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.Inactive;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700 }}>
      {status}
    </span>
  );
}

function StatusActions({ userId, current, options, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const handle = async (status) => {
    setLoading(true);
    try { await onUpdate(userId, status); } finally { setLoading(false); }
  };
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {options.filter((o) => o !== current).map((o) => (
        <button key={o} disabled={loading} onClick={() => handle(o)}
          style={{
            padding: '0.25rem 0.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 700,
            background: o === 'Active' ? 'rgba(16,185,129,0.15)' : o === 'Suspended' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
            color: o === 'Active' ? '#047857' : o === 'Suspended' ? '#d97706' : '#dc2626',
          }}>
          {o}
        </button>
      ))}
    </div>
  );
}

function SearchInput({ value, onChange }) {
  return (
    <input type="text" placeholder="Search..." value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.95rem', marginBottom: '1.2rem' }} />
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({ data }) {
  if (!data) return null;
  const apptStatus = data.appointment_status || {};
  return (
    <div className="page-stack">
      {/* Hospital info banner */}
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ fontSize: '3rem' }}>🏥</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{data.hospital_name}</div>
            {data.hospital_address && <div style={{ color: '#5b7088', marginTop: '0.2rem' }}>📍 {data.hospital_address}</div>}
            {data.hospital_phone && <div style={{ color: '#5b7088' }}>📞 {data.hospital_phone}</div>}
          </div>
        </div>
      </SectionCard>

      <div className="stats-grid">
        <StatCard label="Patients" value={data.patients ?? 0} />
        <StatCard label="Doctors" value={data.doctors ?? 0} />
        <StatCard label="Labs" value={data.labs ?? 0} />
        <StatCard label="Appointments" value={data.appointments ?? 0} />
        <StatCard label="Reports" value={data.reports ?? 0} />
      </div>

      <div className="content-grid">
        <SectionCard title="Appointment Status Breakdown">
          {Object.keys(apptStatus).length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No appointments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {Object.entries(apptStatus).map(([status, count]) => {
                const total = Object.values(apptStatus).reduce((a, b) => a + b, 0);
                const pct = total ? Math.round((count / total) * 100) : 0;
                const s = STATUS_BADGE[status] || STATUS_BADGE.Inactive;
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 600 }}>{status}</span>
                      <span style={{ color: '#5b7088' }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(36,84,128,0.08)' }}>
                      <div style={{ height: '100%', borderRadius: '999px', width: `${pct}%`, background: s.color, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="System Logs">
          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {(data.recent_logs?.length ? data.recent_logs : ['No logs available.']).map((log, i) => (
              <div key={i} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.07)', color: '#5b7088', fontSize: '0.9rem' }}>
                {log}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

const FIELD_STYLE = { width: '100%', padding: '0.65rem 0.9rem', borderRadius: '0.7rem', border: '2px solid rgba(36,84,128,0.12)', fontSize: '0.93rem' };

function CreateDoctorForm({ onCreated }) {
  const BLANK = { full_name: '', email: '', phone: '', password: '', specialization: '', qualification: '', experience: '', license_number: '', hospital_name: '' };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      await api.adminCreateDoctor({ ...form, experience: form.experience ? parseInt(form.experience) : null });
      setForm(BLANK);
      onCreated();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem', marginBottom: '1.5rem', padding: '1.2rem', borderRadius: '1rem', background: 'rgba(19,117,255,0.03)', border: '1.5px solid rgba(19,117,255,0.12)' }}>
      <div style={{ gridColumn: '1/-1', fontWeight: 700, color: '#1375ff', fontSize: '0.95rem' }}>➕ Register New Doctor</div>
      {[['full_name','Full Name',true],['email','Email',true],['password','Password',true],['phone','Phone'],['specialization','Specialization'],['qualification','Qualification'],['experience','Experience (yrs)'],['license_number','License No.'],['hospital_name','Hospital Name']].map(([k,label,req]) => (
        <input key={k} required={!!req} placeholder={label} type={k==='password'?'password':k==='email'?'email':'text'} value={form[k]} onChange={set(k)} style={FIELD_STYLE} />
      ))}
      {err && <div style={{ gridColumn: '1/-1', color: '#dc2626', fontSize: '0.88rem' }}>{err}</div>}
      <button type="submit" disabled={saving} style={{ gridColumn: '1/-1', padding: '0.75rem', borderRadius: '0.8rem', border: 'none', background: '#1375ff', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Creating...' : 'Create Doctor Account'}
      </button>
    </form>
  );
}

// ── Tab: Doctors ──────────────────────────────────────────────────────────────
function DoctorsTab() {
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.adminDoctors().then(setDoctors).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (userId, status) => {
    await api.updateDoctorStatus(userId, status);
    setDoctors((prev) => prev.map((d) => d.user_id === userId ? { ...d, status } : d));
  }, []);

  const filtered = doctors.filter((d) =>
    [d.full_name, d.specialization, d.email, d.hospital_name, d.license_number].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <SectionCard title={`Doctors (${doctors.length})`}>
      <CreateDoctorForm onCreated={load} />
      <SearchInput value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No doctors found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                {['Name', 'Specialization', 'Qualification', 'Exp.', 'License No.', 'Hospital', 'Email', 'Phone', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.doctor_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                  <td style={{ padding: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.full_name}</td>
                  <td style={{ padding: '0.8rem' }}>{d.specialization || '—'}</td>
                  <td style={{ padding: '0.8rem' }}>{d.qualification || '—'}</td>
                  <td style={{ padding: '0.8rem', whiteSpace: 'nowrap' }}>{d.experience ? `${d.experience} yrs` : '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem' }}>{d.license_number || '—'}</td>
                  <td style={{ padding: '0.8rem', fontSize: '0.88rem' }}>{d.hospital_name || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem' }}>{d.email}</td>
                  <td style={{ padding: '0.8rem', fontSize: '0.88rem' }}>{d.phone || '—'}</td>
                  <td style={{ padding: '0.8rem' }}><Badge status={d.status} /></td>
                  <td style={{ padding: '0.8rem' }}>
                    <StatusActions userId={d.user_id} current={d.status} options={['Active', 'Suspended', 'Inactive']} onUpdate={updateStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Tab: Patients ─────────────────────────────────────────────────────────────
function PatientsTab() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminPatients().then(setPatients).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const updateStatus = useCallback(async (userId, status) => {
    await api.updatePatientStatus(userId, status);
    setPatients((prev) => prev.map((p) => p.user_id === userId ? { ...p, status } : p));
  }, []);

  const filtered = patients.filter((p) =>
    [p.full_name, p.email, p.phone, p.blood_group].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <SectionCard title={`Patients (${patients.length})`}>
      <SearchInput value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No patients found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                {['Name', 'Email', 'Phone', 'Gender', 'DOB', 'Blood Group', 'Allergies', 'Chronic Diseases', 'Insurance No.', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.patient_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                  <td style={{ padding: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.full_name}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem' }}>{p.email}</td>
                  <td style={{ padding: '0.8rem', whiteSpace: 'nowrap' }}>{p.phone || '—'}</td>
                  <td style={{ padding: '0.8rem' }}>{p.gender || '—'}</td>
                  <td style={{ padding: '0.8rem', whiteSpace: 'nowrap' }}>{p.date_of_birth || '—'}</td>
                  <td style={{ padding: '0.8rem' }}>{p.blood_group ? <Badge status={p.blood_group} /> : '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.allergies}>{p.allergies || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.chronic_diseases}>{p.chronic_diseases || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem' }}>{p.insurance_number || '—'}</td>
                  <td style={{ padding: '0.8rem' }}><Badge status={p.status} /></td>
                  <td style={{ padding: '0.8rem' }}>
                    <StatusActions userId={p.user_id} current={p.status} options={['Active', 'Suspended', 'Inactive']} onUpdate={updateStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Tab: Labs ─────────────────────────────────────────────────────────────────
function CreateLabForm({ onCreated }) {
  const BLANK = { full_name: '', email: '', phone: '', password: '', lab_name: '', registration_number: '', address: '' };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      await api.adminCreateLab(form);
      setForm(BLANK);
      onCreated();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem', marginBottom: '1.5rem', padding: '1.2rem', borderRadius: '1rem', background: 'rgba(19,117,255,0.03)', border: '1.5px solid rgba(19,117,255,0.12)' }}>
      <div style={{ gridColumn: '1/-1', fontWeight: 700, color: '#1375ff', fontSize: '0.95rem' }}>➕ Register New Laboratory</div>
      {[['full_name','Full Name',true],['email','Email',true],['password','Password',true],['phone','Phone'],['lab_name','Lab Name'],['registration_number','Reg. Number'],['address','Address']].map(([k,label,req]) => (
        <input key={k} required={!!req} placeholder={label} type={k==='password'?'password':k==='email'?'email':'text'} value={form[k]} onChange={set(k)} style={FIELD_STYLE} />
      ))}
      {err && <div style={{ gridColumn: '1/-1', color: '#dc2626', fontSize: '0.88rem' }}>{err}</div>}
      <button type="submit" disabled={saving} style={{ gridColumn: '1/-1', padding: '0.75rem', borderRadius: '0.8rem', border: 'none', background: '#1375ff', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Creating...' : 'Create Lab Account'}
      </button>
    </form>
  );
}

function LabsTab() {
  const [labs, setLabs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.adminLabs().then(setLabs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (userId, status) => {
    await api.updateLabStatus(userId, status);
    setLabs((prev) => prev.map((l) => l.user_id === userId ? { ...l, status } : l));
  }, []);

  const filtered = labs.filter((l) =>
    [l.lab_name, l.email, l.registration_number].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <SectionCard title={`Laboratories (${labs.length})`}>
      <CreateLabForm onCreated={load} />
      <SearchInput value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No labs found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                {['Lab Name', 'Reg. No.', 'Email', 'Phone', 'Address', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.88rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.lab_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                  <td style={{ padding: '0.8rem', fontWeight: 600 }}>{l.lab_name || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088' }}>{l.registration_number || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem' }}>{l.email}</td>
                  <td style={{ padding: '0.8rem' }}>{l.phone || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', fontSize: '0.88rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.address || '—'}</td>
                  <td style={{ padding: '0.8rem' }}><Badge status={l.status} /></td>
                  <td style={{ padding: '0.8rem' }}>
                    <StatusActions userId={l.user_id} current={l.status} options={['Active', 'Suspended', 'Inactive']} onUpdate={updateStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Tab: Appointments ─────────────────────────────────────────────────────────
function AppointmentsTab() {
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminAppointments().then(setAppointments).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statuses = ['All', ...Array.from(new Set(appointments.map((a) => a.status)))];
  const filtered = appointments.filter((a) => {
    const matchSearch = [a.patient_name, a.doctor_name, a.department].some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === 'All' || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <SectionCard title={`Appointments (${appointments.length})`}>
      <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search patient, doctor..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '0.8rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.95rem' }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '0.8rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.95rem' }}>
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No appointments found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                {['Patient', 'Doctor', 'Date', 'Time', 'Department', 'Reason', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.7rem', fontWeight: 700, color: '#5b7088', fontSize: '0.88rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.appointment_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.06)' }}>
                  <td style={{ padding: '0.8rem', fontWeight: 600 }}>{a.patient_name}</td>
                  <td style={{ padding: '0.8rem' }}>{a.doctor_name}</td>
                  <td style={{ padding: '0.8rem' }}>{a.appointment_date}</td>
                  <td style={{ padding: '0.8rem' }}>{a.appointment_time}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088' }}>{a.department || '—'}</td>
                  <td style={{ padding: '0.8rem', color: '#5b7088', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason || '—'}</td>
                  <td style={{ padding: '0.8rem' }}><Badge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminDashboard()
      .then(setDashData)
      .catch(() => setDashData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading dashboard...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin Dashboard"
        title={dashData?.hospital_name || 'Hospital Admin'}
        subtitle={`Manage doctors, patients, labs, and appointments for ${dashData?.hospital_name || 'your hospital'}.`}
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '2px solid rgba(36,84,128,0.1)', paddingBottom: '0' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.7rem 1.4rem', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
              background: 'transparent', borderBottom: activeTab === tab ? '3px solid #1375ff' : '3px solid transparent',
              color: activeTab === tab ? '#1375ff' : '#5b7088', marginBottom: '-2px', borderRadius: '0',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ marginTop: '0.5rem' }}>
        {activeTab === 'Overview'      && <OverviewTab data={dashData} />}
        {activeTab === 'Doctors'       && <DoctorsTab />}
        {activeTab === 'Patients'      && <PatientsTab />}
        {activeTab === 'Labs'          && <LabsTab />}
        {activeTab === 'Appointments'  && <AppointmentsTab />}
      </div>
    </div>
  );
}

export default AdminDashboard;
