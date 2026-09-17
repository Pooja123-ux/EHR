import { useState, useEffect, useRef } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const STATUS_COLOR = { Confirmed: '#047857', Cancelled: '#dc2626', Completed: '#0891b2', Pending: '#d97706' };

const SPECIALIZATIONS = [
  'General Physician', 'Cardiologist', 'Dermatologist', 'Orthopedic Surgeon',
  'Neurologist', 'Pediatrician (Child Specialist)', 'Gynecologist', 'ENT Specialist',
  'Ophthalmologist (Eye Specialist)', 'Dentist', 'Psychiatrist',
  'Pulmonologist (Lung Specialist)', 'Gastroenterologist', 'Endocrinologist',
  'Nephrologist (Kidney Specialist)', 'Urologist', 'Oncologist (Cancer Specialist)',
  'Rheumatologist', 'Physiotherapist', 'Nutritionist / Dietitian',
];

const SPECIALIZATION_ICONS = {
  'Cardiologist': '❤️', 'General Physician': '🩺', 'Neurologist': '🧠',
  'Dermatologist': '🔬', 'Orthopedic Surgeon': '🦴',
  'Pediatrician (Child Specialist)': '👶', 'Gynecologist': '👩‍⚕️', 'ENT Specialist': '👂',
  'Ophthalmologist (Eye Specialist)': '👁️', 'Dentist': '🦷', 'Psychiatrist': '🧘',
  'Pulmonologist (Lung Specialist)': '🫁', 'Gastroenterologist': '🍽️', 'Endocrinologist': '⚖️',
  'Nephrologist (Kidney Specialist)': '🫘', 'Urologist': '🔵', 'Oncologist (Cancer Specialist)': '🎗️',
  'Rheumatologist': '🦵', 'Physiotherapist': '💪', 'Nutritionist / Dietitian': '🥗',
};

function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewingAppt, setViewingAppt] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  const [doctorsByDept, setDoctorsByDept] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [showingAllDoctors, setShowingAllDoctors] = useState(false);
  const [filterAllSpecialization, setFilterAllSpecialization] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [nextAvailableSlots, setNextAvailableSlots] = useState([]); // [{ date: '2026-08-06', slots: [...] }]
  const [loadingNextSlots, setLoadingNextSlots] = useState(false);
  const [reason, setReason] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => { loadAppointments(); }, []);

  const loadAppointments = () => {
    setLoading(true);
    api.patientAppointments()
      .then((data) => setAppointments(Array.isArray(data) ? data : []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedSpecialization) {
      api.getDoctorsByDepartment(selectedSpecialization)
        .then((data) => {
          setDoctorsByDept(Array.isArray(data) ? data : []);
          setSelectedDoctor(null);
          setBookingStep(2);
          setShowingAllDoctors(false);
        })
        .catch(() => { setDoctorsByDept([]); setError('Failed to load doctors.'); });
    } else {
      setDoctorsByDept([]);
      setSelectedDoctor(null);
    }
  }, [selectedSpecialization]);

  const loadAllDoctors = () => {
    setError('');
    api.getDoctors()
      .then((data) => {
        setDoctorsByDept(Array.isArray(data) ? data : []);
        setSelectedDoctor(null);
        setBookingStep(2);
        setShowingAllDoctors(true);
        setFilterAllSpecialization(selectedSpecialization || '');
      })
      .catch(() => { setDoctorsByDept([]); setError('Failed to load doctors.'); });
  };

  const loadNextAvailableSlots = async (days = 7) => {
    if (!selectedDoctor) { setError('Select a doctor first.'); return; }
    setLoadingNextSlots(true);
    setNextAvailableSlots([]);
    try {
      const start = new Date();
      const promises = Array.from({ length: days }).map((_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i + 1);
        const dateStr = d.toISOString().split('T')[0];
        return api.getAvailableSlots(selectedDoctor.doctor_id, dateStr)
          .then((slots) => ({ date: dateStr, slots: Array.isArray(slots) ? slots : [] }))
          .catch(() => ({ date: dateStr, slots: [] }));
      });
      const results = await Promise.all(promises);
      const available = results.filter(r => Array.isArray(r.slots) && r.slots.some(s => s.available));
      setNextAvailableSlots(available);
      if (available.length === 0) setError('No available slots found in the next week.');
    } catch (err) {
      setError('Failed to load next available slots.');
    } finally {
      setLoadingNextSlots(false);
    }
  };

  useEffect(() => {
    if (selectedDoctor && appointmentDate) {
      setLoadingSlots(true);
      const dateStr = new Date(appointmentDate).toISOString().split('T')[0];
      api.getAvailableSlots(selectedDoctor.doctor_id, dateStr)
        .then((data) => {
          setAvailableSlots(Array.isArray(data) ? data : []);
          setSelectedSlot('');
          setBookingStep(4);
        })
        .catch(() => setAvailableSlots([]))
        .finally(() => setLoadingSlots(false));
    } else {
      setAvailableSlots([]);
    }
  }, [selectedDoctor, appointmentDate]);

  const resetBooking = () => {
    setBookingStep(1);
    setSelectedSpecialization('');
    setDoctorsByDept([]);
    setSelectedDoctor(null);
    setAppointmentDate('');
    setAvailableSlots([]);
    setSelectedSlot('');
    setReason('');
    setUploadedFile(null);
    setError('');
    setSuccess('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBook = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSubmitting(true);
    try {
      const formattedDate = new Date(appointmentDate).toISOString().split('T')[0];
      const newAppt = await api.createAppointment({
        doctor_id: selectedDoctor.doctor_id,
        appointment_date: formattedDate,
        appointment_time: selectedSlot,
        reason: reason || 'General consultation',
        department: selectedSpecialization,
        visit_type: 'In-Person',
      });
      setAppointments((prev) => [newAppt, ...prev]);
      setSuccess('Appointment booked successfully! Awaiting doctor confirmation.');
      setShowBooking(false);
      resetBooking();
    } catch (err) {
      setError(err.message || 'Failed to book appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (appt) => {
    if (!window.confirm(`Cancel appointment with ${appt.doctor_name || 'Doctor'} on ${appt.appointment_date}?`)) return;
    setCancelling(appt.appointment_id);
    try {
      await api.cancelAppointment(appt.appointment_id);
      setAppointments((prev) =>
        prev.map((a) => a.appointment_id === appt.appointment_id ? { ...a, status: 'Cancelled' } : a)
      );
      setSuccess('Appointment cancelled successfully.');
    } catch (err) {
      setError(err.message || 'Failed to cancel appointment');
    } finally {
      setCancelling(null);
    }
  };

  const handleDelete = async (appt) => {
    if (!window.confirm(`Delete appointment with ${appt.doctor_name || 'Doctor'} on ${appt.appointment_date}? This cannot be undone.`)) return;
    setDeleting(appt.appointment_id);
    try {
      await api.deleteAppointment(appt.appointment_id);
      setAppointments((prev) => prev.filter((a) => a.appointment_id !== appt.appointment_id));
      setSuccess('Appointment deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete appointment');
    } finally {
      setDeleting(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
        setError('Only PDF, JPG and PNG files are supported.');
        e.target.value = '';
        return;
      }
      setUploadedFile(file);
    }
  };

  const goToStep = (step) => { setError(''); setBookingStep(step); };

  // ── Step Renders ─────────────────────────────────────────────────────

  const renderSpecializationStep = () => (
    <div>
      <h4 style={{ marginBottom: '1.5rem', color: '#1e293b', fontSize: '1.1rem' }}>
        Step 1: Select Doctor Type (Specialization)
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem' }}>
        {SPECIALIZATIONS.map((spec) => (
          <button key={spec} type="button" onClick={() => setSelectedSpecialization(spec)}
            style={{
              padding: '0.75rem 1rem', borderRadius: '1rem',
              border: selectedSpecialization === spec ? '2px solid #1375ff' : '2px solid rgba(36,84,128,0.1)',
              background: selectedSpecialization === spec ? 'rgba(19,117,255,0.08)' : '#fff',
              cursor: 'pointer', fontSize: '0.9rem',
              fontWeight: selectedSpecialization === spec ? 700 : 500,
              color: selectedSpecialization === spec ? '#1375ff' : '#1e293b',
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{SPECIALIZATION_ICONS[spec] || '🩺'}</span>
            <span>{spec}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderDoctorStep = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={() => goToStep(1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
          ← Back
        </button>
        <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>
          Step 2: Select Doctor — <span style={{ color: '#1375ff', fontWeight: 400 }}>{selectedSpecialization}</span>
        </h4>
      </div>
      {doctorsByDept.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#5b7088', padding: '2rem' }}>
          <div style={{ marginBottom: '1rem' }}>{showingAllDoctors ? 'No registered doctors found.' : 'No doctors found for this specialization.'}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem' }}>
            <button type="button" onClick={loadAllDoctors}
              style={{ padding: '0.6rem 1rem', borderRadius: '0.6rem', border: 'none', background: 'linear-gradient(135deg, #1375ff, #00a7c7)', color: '#fff', cursor: 'pointer' }}>
              Show Registered Doctors
            </button>
            <button type="button" onClick={() => { setSelectedSpecialization(''); setShowingAllDoctors(false); }}
              style={{ padding: '0.6rem 1rem', borderRadius: '0.6rem', border: '1px solid rgba(36,84,128,0.12)', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
              Back to Specializations
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '0.8rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {showingAllDoctors && (
              <>
                <label style={{ color: '#5b7088', fontSize: '0.9rem', marginRight: '0.5rem' }}>Filter by specialization:</label>
                <input placeholder="e.g. Pulmonologist" value={filterAllSpecialization} onChange={(e) => setFilterAllSpecialization(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(36,84,128,0.12)', minWidth: '220px' }} />
                <button type="button" onClick={() => { setFilterAllSpecialization(''); }}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(36,84,128,0.12)', background: '#fff', cursor: 'pointer' }}>
                  Clear
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {doctorsByDept
              .filter((doc) => {
                if (!showingAllDoctors) return true;
                if (!filterAllSpecialization) return true;
                return (doc.specialization || '').toLowerCase().includes(filterAllSpecialization.toLowerCase());
              })
              .map((doc) => (
                <button key={doc.doctor_id} type="button" onClick={() => { setSelectedDoctor(doc); setBookingStep(3); }}
                  style={{
                    padding: '1rem 1.2rem', borderRadius: '1rem', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
                    border: selectedDoctor?.doctor_id === doc.doctor_id ? '2px solid #1375ff' : '2px solid rgba(36,84,128,0.08)',
                    background: selectedDoctor?.doctor_id === doc.doctor_id ? 'rgba(19,117,255,0.06)' : '#fff',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1375ff, #00a7c7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '1.3rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {doc.name?.charAt(0) || '👨‍⚕️'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{doc.name}</div>
                    <div style={{ color: '#5b7088', fontSize: '0.85rem', marginTop: '0.2rem' }}>{doc.specialization}</div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.8rem', color: '#5b7088' }}>
                      {doc.rating && <span>⭐ {doc.rating}</span>}
                      {doc.experience && <span>📅 {doc.experience} Years Experience</span>}
                    </div>
                  </div>
                  {doc.hospital_name && (
                    <div style={{ color: '#5b7088', fontSize: '0.8rem', textAlign: 'right' }}>
                      🏥 {doc.hospital_name}
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDateStep = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={() => goToStep(2)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
          ← Back
        </button>
        <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Step 3: Appointment Date</h4>
      </div>
      <div style={{ maxWidth: '400px' }}>
        <label className="field-label">📅 Date</label>
        <input type="date" value={appointmentDate}
          onChange={(e) => { setAppointmentDate(e.target.value); setSelectedSlot(''); }}
          min={new Date().toISOString().split('T')[0]} required className="input-field"
        />
        {selectedDoctor && (
          <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(19,117,255,0.06)', borderRadius: '0.8rem', fontSize: '0.85rem', color: '#5b7088' }}>
            Selected: {selectedDoctor.name} ({selectedDoctor.specialization})
          </div>
        )}
      </div>
    </div>
  );

  const renderSlotStep = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={() => goToStep(3)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
          ← Back
        </button>
        <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Step 4: Available Time Slot</h4>
      </div>
      {loadingSlots ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#5b7088' }}>Loading available slots...</div>
      ) : availableSlots.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#5b7088', padding: '1rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>No slots available for this date.</div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <button type="button" onClick={() => loadNextAvailableSlots(7)}
              style={{ padding: '0.6rem 0.9rem', borderRadius: '0.6rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', cursor: 'pointer' }}>
              Find next available slots (7 days)
            </button>
            <button type="button" onClick={() => loadNextAvailableSlots(14)}
              style={{ padding: '0.6rem 0.9rem', borderRadius: '0.6rem', border: '1px solid rgba(36,84,128,0.12)', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
              14 days
            </button>
          </div>
          {loadingNextSlots ? (
            <div style={{ color: '#5b7088' }}>Searching next available slots…</div>
          ) : nextAvailableSlots.length === 0 ? null : (
            <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'left' }}>
              {nextAvailableSlots.map(({ date, slots }) => {
                const pretty = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                const available = (slots || []).filter(s => s.available);
                if (!available.length) return null;
                return (
                  <div key={date} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: '#1e293b' }}>{pretty}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {available.map((s) => (
                        <button key={date + s.time} type="button" onClick={() => { setAppointmentDate(date); setSelectedSlot(s.time); setBookingStep(5); }}
                          style={{ padding: '0.5rem 0.7rem', borderRadius: '0.6rem', border: '1px solid rgba(36,84,128,0.12)', background: '#fff', cursor: 'pointer' }}>
                          {s.time}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <label className="field-label">🕒 Time</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.6rem' }}>
            {availableSlots.map((slot) => {
              const isAvailable = slot.available;
              const isSelected = selectedSlot === slot.time;
              return (
                <button key={slot.time} type="button" disabled={!isAvailable} onClick={() => setSelectedSlot(slot.time)}
                  style={{
                    padding: '0.7rem 0.5rem', borderRadius: '0.8rem',
                    border: isSelected ? '2px solid #1375ff' : isAvailable ? '2px solid rgba(36,84,128,0.1)' : '2px dashed rgba(239,68,68,0.3)',
                    background: isSelected ? 'rgba(19,117,255,0.1)' : isAvailable ? '#fff' : 'rgba(239,68,68,0.04)',
                    cursor: isAvailable ? 'pointer' : 'not-allowed', fontWeight: isSelected ? 700 : 500,
                    color: isAvailable ? '#1e293b' : '#d1d5db', fontSize: '0.9rem',
                    textDecoration: !isAvailable ? 'line-through' : 'none',
                    opacity: isAvailable ? 1 : 0.6, transition: 'all 0.2s',
                  }}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: '0.85rem', textAlign: 'center' }}>
            <button type="button" onClick={() => loadNextAvailableSlots(7)}
              style={{ padding: '0.45rem 0.8rem', borderRadius: '0.6rem', border: '1px solid rgba(36,84,128,0.12)', background: '#fff', cursor: 'pointer' }}>
              Show other days
            </button>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#5b7088' }}>
            <span>✅ Available</span><span>❌ Unavailable</span>
          </div>
        </>
      )}
    </div>
  );

  const renderReasonStep = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={() => goToStep(selectedSlot ? 4 : 3)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
          ← Back
        </button>
        <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Step 5: Reason for Visit</h4>
      </div>
      <div>
        <textarea placeholder="Describe your symptoms or reason for consultation...\n\nExample:\nFever and cough\nChest pain\nSkin rash\nBack pain\nEye irritation"
          value={reason} onChange={(e) => setReason(e.target.value)} rows={6}
          className="textarea-field"
        />
      </div>
    </div>
  );

  const renderUploadStep = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button type="button" onClick={() => goToStep(5)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
          ← Back
        </button>
        <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>
          Step 6: Upload Previous Reports <span style={{ fontWeight: 400, color: '#5b7088' }}>(Optional)</span>
        </h4>
      </div>
      <div style={{
        border: '2px dashed rgba(36,84,128,0.2)', borderRadius: '1rem', padding: '2rem',
        textAlign: 'center', background: 'rgba(19,117,255,0.03)',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📎</div>
        <p style={{ color: '#5b7088', margin: '0 0 0.5rem', fontWeight: 500 }}>Upload Medical Reports</p>
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
          style={{ display: 'none' }} id="file-upload" />
        <label htmlFor="file-upload"
          style={{
            display: 'inline-block', padding: '0.7rem 1.5rem', borderRadius: '0.8rem',
            background: 'rgba(19,117,255,0.1)', color: '#1375ff', fontWeight: 600,
            cursor: 'pointer', fontSize: '0.9rem', border: 'none',
          }}
        >
          {uploadedFile ? 'Change File' : 'Choose File'}
        </label>
        {uploadedFile && (
          <div style={{ marginTop: '1rem', color: '#047857', fontSize: '0.9rem' }}>
            ✅ {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
          </div>
        )}
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '1rem' }}>
          Supported formats: PDF, JPG, PNG
        </p>
      </div>
    </div>
  );

  const renderSummaryStep = () => {
    const dateObj = new Date(appointmentDate);
    const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button type="button" onClick={() => goToStep(6)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#1375ff', padding: '0.2rem 0.5rem', borderRadius: '0.5rem' }}>
            ← Back
          </button>
          <h4 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Step 7: Appointment Summary</h4>
        </div>
        <div style={{
          background: 'rgba(19,117,255,0.04)', borderRadius: '1rem', padding: '1.5rem',
          border: '2px solid rgba(19,117,255,0.1)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Doctor Type', selectedSpecialization],
                ['Doctor', selectedDoctor?.name || ''],
                ['Date', formattedDate],
                ['Time', selectedSlot],
                ['Reason', reason || 'Not specified'],
                uploadedFile ? ['Uploaded Report', uploadedFile.name] : null,
              ].filter(Boolean).map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid rgba(36,84,128,0.08)' }}>
                  <td style={{ padding: '0.8rem 0.5rem', fontWeight: 600, color: '#5b7088', width: '140px' }}>{label}</td>
                  <td style={{ padding: '0.8rem 0.5rem', color: '#1e293b', fontWeight: 500 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => { setShowBooking(false); resetBooking(); }}
            style={{
              padding: '0.8rem 2rem', borderRadius: '999px', border: '2px solid rgba(36,84,128,0.15)',
              background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#5b7088', fontSize: '1rem',
            }}
          >
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{
              padding: '0.8rem 2rem', borderRadius: '999px', border: 'none',
              background: 'linear-gradient(135deg, #1375ff, #00a7c7)', color: '#fff',
              cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Booking...' : '✅ Confirm Appointment'}
          </button>
        </div>
      </div>
    );
  };

  const renderBookingForm = () => {
    const canProceed = () => {
      if (bookingStep === 1) return !!selectedSpecialization;
      if (bookingStep === 2) return !!selectedDoctor;
      if (bookingStep === 3) return !!appointmentDate;
      if (bookingStep === 4) return !!selectedSlot;
      if (bookingStep === 5) return !!reason;
      return false;
    };

    const handleNext = () => {
      if (bookingStep === 1 && !selectedSpecialization) { setError('Please select a specialization.'); return; }
      if (bookingStep === 2 && !selectedDoctor) { setError('Please select a doctor.'); return; }
      if (bookingStep === 3 && !appointmentDate) { setError('Please select a date.'); return; }
      if (bookingStep === 4 && !selectedSlot) { setError('Please select a time slot.'); return; }
      if (bookingStep === 5 && !reason) { setError('Please enter a reason for your visit.'); return; }
      setError('');
      if (bookingStep === 6) { setBookingStep(7); return; }
      setBookingStep(bookingStep + 1);
    };

    return (
      <SectionCard title="➕ Book New Appointment">
        {error && (
          <div className="alert alert--error" style={{ marginBottom: '1rem' }}>{error}</div>
        )}
        <form onSubmit={handleBook} className="flex-col" style={{ gap: '1.5rem' }}>
          {/* Step Progress Indicator */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', overflowX: 'auto', paddingBottom: '0.3rem' }}>
            {[1, 2, 3, 4, 5, 6, 7].map((step) => (
              <div key={step} style={{
                flex: 1, minWidth: '30px', height: '4px', borderRadius: '2px',
                background: step <= bookingStep ? '#1375ff' : 'rgba(36,84,128,0.1)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>

          {bookingStep === 1 && renderSpecializationStep()}
          {bookingStep === 2 && renderDoctorStep()}
          {bookingStep === 3 && renderDateStep()}
          {bookingStep === 4 && renderSlotStep()}
          {bookingStep === 5 && renderReasonStep()}
          {bookingStep === 6 && renderUploadStep()}
          {bookingStep === 7 && renderSummaryStep()}

          {bookingStep < 7 && (
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              {bookingStep > 1 && (
                <button type="button" onClick={() => setBookingStep(bookingStep - 1)}
                  style={{
                    padding: '0.8rem 2rem', borderRadius: '999px', border: '2px solid rgba(36,84,128,0.15)',
                    background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#5b7088', fontSize: '1rem',
                  }}
                >
                  ← Back
                </button>
              )}
              <button type="button" onClick={handleNext}
                style={{
                  padding: '0.8rem 2rem', borderRadius: '999px', border: 'none',
                  background: 'linear-gradient(135deg, #1375ff, #00a7c7)', color: '#fff',
                  cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
                }}
              >
                Next →
              </button>
            </div>
          )}
        </form>
      </SectionCard>
    );
  };

  const renderAppointmentsList = () => (
    <SectionCard title="Your Appointments">
      {appointments.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#5b7088', padding: '2rem' }}>
          No appointments found. Book your first appointment!
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(36,84,128,0.1)' }}>
                {['Date', 'Time', 'Doctor', 'Specialization', 'Reason', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.8rem 0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => {
                const timeStr = apt.appointment_time
                  ? (() => { const [h, m] = apt.appointment_time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
                  : '';
                return (
                  <tr key={apt.appointment_id} style={{ borderBottom: '1px solid rgba(36,84,128,0.08)' }}>
                    <td style={{ padding: '0.8rem 0.6rem', whiteSpace: 'nowrap' }}>{apt.appointment_date}</td>
                    <td style={{ padding: '0.8rem 0.6rem', whiteSpace: 'nowrap' }}>{timeStr}</td>
                    <td style={{ padding: '0.8rem 0.6rem', fontWeight: 600 }}>
                      {apt.doctor_name || `Doctor #${apt.doctor_id}`}
                    </td>
                    <td style={{ padding: '0.8rem 0.6rem', color: '#5b7088' }}>{apt.specialization || '—'}</td>
                    <td style={{ padding: '0.8rem 0.6rem', color: '#5b7088', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {apt.reason || '—'}
                    </td>
                    <td style={{ padding: '0.8rem 0.6rem' }}>
                      <span style={{
                        color: STATUS_COLOR[apt.status] || '#d97706', fontWeight: 700,
                        background: `${STATUS_COLOR[apt.status] || '#d97706'}18`,
                        padding: '0.2rem 0.7rem', borderRadius: '999px', fontSize: '0.85rem',
                      }}>
                        {apt.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.8rem 0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button onClick={() => setViewingAppt(apt)}
                          style={{
                            padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none',
                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                            background: 'rgba(19,117,255,0.1)', color: '#1375ff',
                          }}
                        >
                          View
                        </button>
                        {(apt.status === 'Pending' || apt.status === 'Confirmed' || apt.status === 'Accepted') && (
                          <button onClick={() => handleCancel(apt)} disabled={cancelling === apt.appointment_id}
                            style={{
                              padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none',
                              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                              background: 'rgba(239,68,68,0.1)', color: '#dc2626',
                              opacity: cancelling === apt.appointment_id ? 0.6 : 1,
                            }}
                          >
                            {cancelling === apt.appointment_id ? '...' : 'Cancel'}
                          </button>
                        )}
                        {(apt.status !== 'Completed') && (
                          <button onClick={() => handleDelete(apt)} disabled={deleting === apt.appointment_id}
                            style={{
                              padding: '0.3rem 0.7rem', borderRadius: '999px', border: 'none',
                              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                              background: 'rgba(147,51,234,0.1)', color: '#7c3aed',
                              opacity: deleting === apt.appointment_id ? 0.6 : 1,
                            }}
                          >
                            {deleting === apt.appointment_id ? '...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const renderViewModal = () => {
    if (!viewingAppt) return null;
    const a = viewingAppt;
    const timeStr = a.appointment_time
      ? (() => { const [h, m] = a.appointment_time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
      : '';
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }} onClick={() => setViewingAppt(null)}>
        <div style={{
          background: '#fff', borderRadius: '1.5rem', padding: '2rem',
          maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.3rem' }}>Appointment Details</h3>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div><strong>Doctor:</strong> {a.doctor_name || `Doctor #${a.doctor_id}`}</div>
            <div><strong>Specialization:</strong> {a.specialization || '—'}</div>
            <div><strong>Date:</strong> {a.appointment_date}</div>
            <div><strong>Time:</strong> {timeStr}</div>
            <div><strong>Reason:</strong> {a.reason || '—'}</div>
            <div>
              <strong>Status:</strong>{' '}
              <span style={{ color: STATUS_COLOR[a.status] || '#d97706', fontWeight: 700 }}>{a.status}</span>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setViewingAppt(null)}
              style={{
                padding: '0.6rem 1.5rem', borderRadius: '999px', border: '2px solid rgba(36,84,128,0.15)',
                background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#5b7088',
              }}
            >
              Close
            </button>
            {(a.status === 'Pending' || a.status === 'Confirmed' || a.status === 'Accepted') && (
              <button onClick={() => handleCancel(a)}
                style={{
                  padding: '0.6rem 1.5rem', borderRadius: '999px', border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700,
                }}
              >
                Cancel Appointment
              </button>
            )}
            {a.status !== 'Completed' && (
              <button onClick={() => handleDelete(a)} disabled={deleting === a.appointment_id}
                style={{
                  padding: '0.6rem 1.5rem', borderRadius: '999px', border: 'none',
                  background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700,
                  opacity: deleting === a.appointment_id ? 0.6 : 1,
                }}
              >
                {deleting === a.appointment_id ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="📅 Appointments" title="Manage Your Appointments"
        subtitle="View upcoming visits and book new appointments."
      >
        <button className="button button--primary" onClick={() => { setShowBooking(!showBooking); resetBooking(); }}>
          {showBooking ? '✕ Cancel' : '➕ Book New Appointment'}
        </button>
      </PageHeader>

      {success && (
        <div className="alert alert--success">{success}</div>
      )}

      {showBooking && renderBookingForm()}

      {loading ? (
        <div className="loading-state"><div>Loading appointments...</div></div>
      ) : (
        renderAppointmentsList()
      )}

      {renderViewModal()}
    </div>
  );
}

export default AppointmentsPage;

