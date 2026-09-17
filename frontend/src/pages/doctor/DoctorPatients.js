import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const LAB_TESTS = ['CBC', 'Blood Sugar', 'Urine', 'ECG', 'MRI', 'X-Ray'];
const DIAGNOSIS_SUGGESTIONS = ['Viral Fever', 'Hypertension', 'Type 2 Diabetes', 'Migraine', 'Allergic Rhinitis', 'Acute Bronchitis', 'Gastritis', 'Anxiety Disorder'];
const FREQUENCIES = ['Once Daily', 'Twice Daily', 'Three Times Daily', 'Four Times Daily', 'As Needed (SOS)', 'Once Weekly'];
const EMPTY_PRESCRIPTION = { medicine_name: '', dosage: '', frequency: '', duration: '', instructions: '' };
const inputStyle = {
  width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '2px solid rgba(36,84,128,0.12)', fontSize: '0.92rem',
};
const labelStyle = { fontWeight: 700, display: 'block', marginBottom: '0.35rem', fontSize: '0.88rem' };
const sectionStyle = { padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(36,84,128,0.09)', background: 'rgba(248,250,252,0.7)' };

function DoctorPatients() {
  const [searchParams] = useSearchParams();
  const ehrParam = searchParams.get('ehr');
  const consultParam = searchParams.get('consult');

  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ehrData, setEhrData] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [ehrLoading, setEhrLoading] = useState(false);
  const [tab, setTab] = useState('ehr');

  const [consultForm, setConsultForm] = useState({ symptoms: '', diagnosis: '', doctor_notes: '', lab_requests: [] });
  const [prescriptionRows, setPrescriptionRows] = useState([{ ...EMPTY_PRESCRIPTION }]);
  const [consultInteractions, setConsultInteractions] = useState([]);
  const [interactionMessage, setInteractionMessage] = useState('');
  const [checkingConsultDrugs, setCheckingConsultDrugs] = useState(false);

  const [quickPrescriptionForm, setQuickPrescriptionForm] = useState({ ...EMPTY_PRESCRIPTION });
  const [quickDrugInteractions, setQuickDrugInteractions] = useState([]);
  const [checkingQuickDrugs, setCheckingQuickDrugs] = useState(false);
  const [showPrescribeForm, setShowPrescribeForm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [savedConsultation, setSavedConsultation] = useState(null);
  const [printing, setPrinting] = useState(false);

  const openEHR = useCallback(async (patientId, nextTab = 'ehr') => {
    setEhrLoading(true);
    setEhrData(null);
    try {
      const data = await api.getPatientEHR(patientId);
      setEhrData(data);
      setTab(nextTab);
    } catch {
      setEhrData(null);
    } finally {
      setEhrLoading(false);
    }
  }, []);

  useEffect(() => {
    api.doctorPatients()
      .then(setPatients)
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (ehrParam && patients.length > 0) {
      const found = patients.find((p) => p.patient_id === parseInt(ehrParam, 10));
      if (found) {
        setSelected(found);
        openEHR(found.patient_id, consultParam === 'true' ? 'consult' : 'ehr');
      }
    }
  }, [ehrParam, patients, consultParam, openEHR]);

  const updateConsultForm = (field, value) => {
    setConsultForm((prev) => ({ ...prev, [field]: value }));
  };

  const updatePrescriptionRow = (index, field, value) => {
    setPrescriptionRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const addPrescriptionRow = () => {
    setPrescriptionRows((prev) => [...prev, { ...EMPTY_PRESCRIPTION }]);
  };

  const removePrescriptionRow = (index) => {
    setPrescriptionRows((prev) => prev.length === 1 ? [{ ...EMPTY_PRESCRIPTION }] : prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const checkConsultInteractions = async () => {
    const medicines = prescriptionRows
      .map((row) => row.medicine_name)
      .filter((medicine) => medicine && medicine.trim());
    const existing = (ehrData?.previous_prescriptions || [])
      .map((prescription) => prescription.medicine_name)
      .slice(0, 3);
    const allMeds = [...new Set([...existing, ...medicines])].filter(Boolean);
    if (allMeds.length < 2) {
      setConsultInteractions([]);
      setInteractionMessage('Add at least 2 medicines to check interactions.');
      return;
    }

    setCheckingConsultDrugs(true);
    setInteractionMessage('');
    try {
      const results = await api.checkDrugInteractions(allMeds);
      setConsultInteractions(results.filter((result) => result.interaction_level !== 'Safe'));
      if (!results.some((result) => result.interaction_level !== 'Safe')) {
        setInteractionMessage('No known interactions found in the available interaction data.');
      }
    } catch (err) {
      setConsultInteractions([]);
      setInteractionMessage(err.message || 'Unable to check interactions.');
    } finally {
      setCheckingConsultDrugs(false);
    }
  };

  const handleConsultSave = async (event) => {
    event.preventDefault();
    if (!selected) return;

    const prescriptions = prescriptionRows
      .map((row) => ({
        medicine_name: row.medicine_name.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency,
        duration: row.duration.trim(),
        instructions: row.instructions.trim(),
      }))
      .filter((row) => row.medicine_name);

    if (prescriptions.length === 0) {
      setSaveMessage('Add at least one medicine before saving the consultation.');
      return;
    }

    setSaving(true);
    setSaveMessage('');
    try {
      const result = await api.createConsultation({
        patient_id: selected.patient_id,
        appointment_id: selected.appointment_id || null,
        symptoms: consultForm.symptoms,
        diagnosis: consultForm.diagnosis,
        doctor_notes: consultForm.doctor_notes,
        lab_requests: consultForm.lab_requests,
        prescriptions,
      });
      setSavedConsultation(result);
      setSaveMessage(`Consultation saved. ${prescriptions.length} medicine(s) prescribed and ${consultForm.lab_requests.length} lab request(s) sent.`);
      setConsultForm({ symptoms: '', diagnosis: '', doctor_notes: '', lab_requests: [] });
      setPrescriptionRows([{ ...EMPTY_PRESCRIPTION }]);
      setConsultInteractions([]);
      setInteractionMessage('');
      await openEHR(selected.patient_id, 'consult');
    } catch (err) {
      setSaveMessage(`Failed to save: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const printConsultationReport = async () => {
    if (!savedConsultation) return;
    setPrinting(true);
    try {
      const reportHtml = await api.getConsultationReport(savedConsultation.record_id);
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setSaveMessage('Pop-ups are blocked. Allow pop-ups to print the patient report.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (err) {
      setSaveMessage(`Failed to print report: ${err.message || 'Unknown error'}`);
    } finally {
      setPrinting(false);
    }
  };

  const toggleLabRequest = (test) => {
    updateConsultForm('lab_requests', consultForm.lab_requests.includes(test)
      ? consultForm.lab_requests.filter((item) => item !== test)
      : [...consultForm.lab_requests, test]);
  };

  const checkQuickInteractions = async () => {
    if (!quickPrescriptionForm.medicine_name) return;
    const existing = (ehrData?.previous_prescriptions || []).map((p) => p.medicine_name).slice(0, 3);
    const medicines = [...new Set([...existing, quickPrescriptionForm.medicine_name])].filter(Boolean);
    if (medicines.length < 2) return;
    setCheckingQuickDrugs(true);
    try {
      const results = await api.checkDrugInteractions(medicines);
      setQuickDrugInteractions(results.filter((result) => result.interaction_level !== 'Safe'));
    } catch {
      setQuickDrugInteractions([]);
    } finally {
      setCheckingQuickDrugs(false);
    }
  };

  const handleQuickPrescribe = async () => {
    if (!ehrData || !quickPrescriptionForm.medicine_name) return;
    setSaving(true);
    try {
      const record = await api.createMedicalRecord({
        patient_id: selected.patient_id,
        diagnosis: consultForm.diagnosis || 'Prescription',
        symptoms: consultForm.symptoms || '',
        doctor_notes: quickPrescriptionForm.instructions || '',
      });
      await api.createPrescription({ record_id: record.record_id, ...quickPrescriptionForm });
      setSaveMessage('Prescription saved!');
      setShowPrescribeForm(false);
      setQuickPrescriptionForm({ ...EMPTY_PRESCRIPTION });
      setQuickDrugInteractions([]);
      await openEHR(selected.patient_id);
    } catch (err) {
      setSaveMessage(`Failed to save prescription: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const filtered = patients.filter((patient) => patient.full_name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="page-stack"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Doctor Portal" title="My Patients" subtitle="View patient records, consult, prescribe, and request lab tests." />

      <div className="content-grid">
        <SectionCard title={`Patients (${patients.length})`}>
          <input
            type="text"
            placeholder="Search patients..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: '100%', padding: '0.9rem 1rem', borderRadius: '1rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem', marginBottom: '1.2rem' }}
          />
          {filtered.length === 0 ? (
            <div style={{ color: '#5b7088', textAlign: 'center', padding: '1rem' }}>No patients found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '500px', overflowY: 'auto' }}>
              {filtered.map((patient) => (
                <div
                  key={patient.patient_id}
                  onClick={() => { setSelected(patient); openEHR(patient.patient_id); }}
                  style={{
                    padding: '0.9rem 1rem', borderRadius: '1rem', cursor: 'pointer',
                    backgroundColor: selected?.patient_id === patient.patient_id ? 'rgba(19,117,255,0.08)' : 'rgba(19,117,255,0.03)',
                    border: selected?.patient_id === patient.patient_id ? '2px solid rgba(19,117,255,0.25)' : '2px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{patient.full_name}</div>
                  <div style={{ color: '#5b7088', fontSize: '0.82rem' }}>{patient.gender || '—'} • Age: {patient.age || '—'} • {patient.blood_group || ''}</div>
                  {patient.status && <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginTop: '0.3rem', display: 'inline-block', background: patient.status === 'Waiting' ? 'rgba(245,158,11,0.1)' : patient.status === 'Completed' ? 'rgba(16,185,129,0.1)' : 'rgba(19,117,255,0.1)', color: patient.status === 'Waiting' ? '#d97706' : patient.status === 'Completed' ? '#047857' : '#1375ff' }}>{patient.status}</span>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="page-stack">
          {!selected ? (
            <SectionCard title="Patient Details"><div style={{ color: '#5b7088', textAlign: 'center', padding: '2rem' }}>Select a patient to view their EHR.</div></SectionCard>
          ) : ehrLoading ? (
            <SectionCard title="Loading EHR..."><div style={{ color: '#5b7088', textAlign: 'center', padding: '2rem' }}>Loading patient records...</div></SectionCard>
          ) : ehrData ? (
            <>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {[['ehr', '📋 EHR'], ['consult', '🩺 Consult'], ['history', '📜 History']].map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)} style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', border: 'none', fontWeight: 700, cursor: 'pointer', background: tab === key ? 'linear-gradient(135deg,#1375ff,#00a7c7)' : 'rgba(19,117,255,0.08)', color: tab === key ? '#fff' : '#1375ff' }}>{label}</button>
                ))}
              </div>

              {saveMessage && <div style={{ padding: '0.8rem 1rem', borderRadius: '0.8rem', backgroundColor: saveMessage.includes('Failed') || saveMessage.includes('blocked') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: saveMessage.includes('Failed') || saveMessage.includes('blocked') ? '#dc2626' : '#047857', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>{saveMessage}</div>}

              {tab === 'ehr' && (
                <div className="page-stack">
                  <SectionCard title={`${ehrData.full_name} — Patient Information`}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                      {[['Name', ehrData.full_name], ['Age', ehrData.date_of_birth ? `${new Date().getFullYear() - new Date(ehrData.date_of_birth).getFullYear()}` : '—'], ['Blood Group', ehrData.blood_group || '—'], ['Allergies', ehrData.allergies || '—'], ['Height', ehrData.height ? `${ehrData.height} cm` : '—'], ['Weight', ehrData.weight ? `${ehrData.weight} kg` : '—'], ['Emergency Contact', ehrData.emergency_contact || '—'], ['Insurance', ehrData.insurance_number || '—'], ['Previous Diseases', ehrData.chronic_diseases || '—'], ['Email', ehrData.email || '—']].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)' }}><span style={{ fontWeight: 600, color: '#5b7088' }}>{label}</span><span style={{ fontWeight: 500 }}>{value || '—'}</span></div>
                      ))}
                    </div>
                  </SectionCard>

                  {ehrData.ai_summary && <SectionCard title="🤖 AI Summary"><div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{ehrData.ai_summary.previous_diagnoses?.length > 0 && <div style={{ marginBottom: '0.8rem' }}><strong>Previous Diagnosis:</strong> {ehrData.ai_summary.previous_diagnoses.join(', ')}</div>}{ehrData.ai_summary.frequently_prescribed?.length > 0 && <div style={{ marginBottom: '0.8rem' }}><strong>Frequently Prescribed:</strong> {ehrData.ai_summary.frequently_prescribed.map((medicine) => `${medicine.medicine} (${medicine.count}x)`).join(', ')}</div>}{ehrData.ai_summary.recent_abnormal_reports?.length > 0 && <div style={{ marginBottom: '0.8rem' }}><strong>Recent Abnormal Reports:</strong><ul style={{ margin: '0.3rem 0 0 1rem', padding: 0 }}>{ehrData.ai_summary.recent_abnormal_reports.map((report, index) => <li key={index}>{report}</li>)}</ul></div>}{ehrData.ai_summary.chronic_conditions && <div><strong>Chronic Conditions:</strong> {ehrData.ai_summary.chronic_conditions}</div>}<div style={{ marginTop: '0.5rem', color: '#8da2b8', fontSize: '0.78rem' }}>Auto-generated {ehrData.ai_summary.generated_at ? new Date(ehrData.ai_summary.generated_at).toLocaleString() : ''}</div></div></SectionCard>}

                  <SectionCard title="Medical History">
                    <div style={{ marginBottom: '1rem' }}><strong style={{ fontSize: '0.9rem' }}>Past Consultations</strong>{(ehrData.previous_consultations || []).slice(0, 5).map((consultation, index) => <div key={index} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)', fontSize: '0.88rem' }}><div><strong>{consultation.doctor_name}</strong> — {consultation.created_at ? new Date(consultation.created_at).toLocaleDateString() : ''}</div><div style={{ color: '#5b7088' }}>Diagnosis: {consultation.diagnosis || 'N/A'} | Symptoms: {consultation.symptoms || 'N/A'}</div></div>)}{(ehrData.previous_consultations || []).length === 0 && <div style={{ color: '#5b7088', fontSize: '0.85rem' }}>No past consultations.</div>}</div>
                    <div style={{ marginBottom: '1rem' }}><strong style={{ fontSize: '0.9rem' }}>Lab Reports</strong>{(ehrData.lab_reports || []).slice(0, 5).map((report, index) => <div key={index} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)', fontSize: '0.88rem' }}><div><strong>{report.report_type}</strong> — Status: {report.status}</div>{report.ai_summary && <div style={{ color: '#5b7088' }}>{report.ai_summary.slice(0, 100)}...</div>}</div>)}{(ehrData.lab_reports || []).length === 0 && <div style={{ color: '#5b7088', fontSize: '0.85rem' }}>No lab reports.</div>}</div>
                    <div><strong style={{ fontSize: '0.9rem' }}>Previous Prescriptions</strong>{(ehrData.previous_prescriptions || []).slice(0, 5).map((prescription, index) => <div key={index} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)', fontSize: '0.88rem' }}><div><strong>{prescription.medicine_name}</strong> — {prescription.dosage}, {prescription.frequency}, {prescription.duration}</div><div style={{ color: '#5b7088' }}>Dr. {prescription.doctor_name} | {prescription.instructions}</div></div>)}</div>
                  </SectionCard>

                  <div style={{ display: 'flex', gap: '0.6rem' }}><button onClick={() => setTab('consult')} style={{ flex: 1, padding: '0.8rem', borderRadius: '1rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Start Consultation</button><button onClick={() => setShowPrescribeForm((value) => !value)} style={{ flex: 1, padding: '0.8rem', borderRadius: '1rem', border: '2px solid rgba(19,117,255,0.2)', background: 'transparent', color: '#1375ff', fontWeight: 800, cursor: 'pointer' }}>New Prescription</button></div>

                  {showPrescribeForm && <SectionCard title="Quick Prescription"><div style={{ display: 'grid', gap: '0.7rem' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}><div><label style={labelStyle}>Medicine *</label><input value={quickPrescriptionForm.medicine_name} onChange={(event) => setQuickPrescriptionForm({ ...quickPrescriptionForm, medicine_name: event.target.value })} style={inputStyle} /></div><div><label style={labelStyle}>Dosage</label><input value={quickPrescriptionForm.dosage} onChange={(event) => setQuickPrescriptionForm({ ...quickPrescriptionForm, dosage: event.target.value })} style={inputStyle} /></div><div><label style={labelStyle}>Frequency</label><select value={quickPrescriptionForm.frequency} onChange={(event) => setQuickPrescriptionForm({ ...quickPrescriptionForm, frequency: event.target.value })} style={inputStyle}><option value="">Select</option>{FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></div><div><label style={labelStyle}>Duration</label><input value={quickPrescriptionForm.duration} onChange={(event) => setQuickPrescriptionForm({ ...quickPrescriptionForm, duration: event.target.value })} placeholder="e.g., 5 Days" style={inputStyle} /></div></div><div><label style={labelStyle}>Instructions</label><input value={quickPrescriptionForm.instructions} onChange={(event) => setQuickPrescriptionForm({ ...quickPrescriptionForm, instructions: event.target.value })} placeholder="e.g., After Food" style={inputStyle} /></div><div style={{ display: 'flex', gap: '0.5rem' }}><button type="button" onClick={checkQuickInteractions} disabled={checkingQuickDrugs || !quickPrescriptionForm.medicine_name} style={{ padding: '0.5rem 1rem', borderRadius: '999px', border: '2px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)', color: '#d97706', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>{checkingQuickDrugs ? 'Checking...' : '🔍 Check Interactions'}</button><button type="button" onClick={handleQuickPrescribe} disabled={saving || !quickPrescriptionForm.medicine_name} style={{ padding: '0.5rem 1.5rem', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>{saving ? 'Saving...' : '💊 Prescribe'}</button></div>{quickDrugInteractions.length > 0 && <div style={{ padding: '0.8rem', borderRadius: '0.8rem', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{quickDrugInteractions.map((interaction, index) => <div key={index} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}><div style={{ fontWeight: 700, color: '#dc2626' }}>⚠ {interaction.interaction_level}: {interaction.medicine1} + {interaction.medicine2}</div><div style={{ color: '#5b7088' }}>{interaction.description}</div>{interaction.suggested_alternative && <div style={{ color: '#047857', fontWeight: 600 }}>Suggested: {interaction.suggested_alternative}</div>}</div>)}</div>}</div></SectionCard>}
                </div>
              )}

              {tab === 'consult' && (
                <SectionCard title="Consultation">
                  <form onSubmit={handleConsultSave} style={{ display: 'grid', gap: '1rem' }}>
                    <div><label style={labelStyle}>Symptoms</label><textarea value={consultForm.symptoms} onChange={(event) => updateConsultForm('symptoms', event.target.value)} placeholder="E.g., Fever, Body Pain, Cough, Headache..." style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.95rem', minHeight: '80px' }} /></div>
                    <div><label style={labelStyle}>Diagnosis</label><div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>{DIAGNOSIS_SUGGESTIONS.map((diagnosis) => <button key={diagnosis} type="button" onClick={() => updateConsultForm('diagnosis', diagnosis)} style={{ padding: '0.3rem 0.7rem', borderRadius: '999px', border: '2px solid rgba(19,117,255,0.2)', background: consultForm.diagnosis === diagnosis ? 'rgba(19,117,255,0.15)' : 'transparent', color: '#1375ff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>{diagnosis}</button>)}</div><input value={consultForm.diagnosis} onChange={(event) => updateConsultForm('diagnosis', event.target.value)} placeholder="Or type custom diagnosis..." style={inputStyle} /></div>
                    <div><label style={labelStyle}>Clinical Notes</label><textarea value={consultForm.doctor_notes} onChange={(event) => updateConsultForm('doctor_notes', event.target.value)} placeholder="E.g., Drink more fluids. Rest for 3 days. Follow up in 1 week..." style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.95rem', minHeight: '90px' }} /></div>

                    <div style={sectionStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}><label style={{ ...labelStyle, margin: 0 }}>Medicines *</label><button type="button" onClick={addPrescriptionRow} style={{ padding: '0.45rem 0.9rem', borderRadius: '999px', border: 'none', background: 'rgba(19,117,255,0.1)', color: '#1375ff', fontWeight: 700, cursor: 'pointer' }}>+ Add Medicine</button></div>{prescriptionRows.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: index === 0 ? '1.35fr 1fr 1fr 1fr 1.35fr auto' : '1.35fr 1fr 1fr 1fr 1.35fr auto', gap: '0.6rem', alignItems: 'end', marginBottom: index < prescriptionRows.length - 1 ? '0.8rem' : 0 }}><div><label style={labelStyle}>Medicine *</label><input required value={row.medicine_name} onChange={(event) => updatePrescriptionRow(index, 'medicine_name', event.target.value)} placeholder="e.g., Paracetamol" style={inputStyle} /></div><div><label style={labelStyle}>Dosage</label><input value={row.dosage} onChange={(event) => updatePrescriptionRow(index, 'dosage', event.target.value)} placeholder="e.g., 500mg" style={inputStyle} /></div><div><label style={labelStyle}>Frequency</label><select value={row.frequency} onChange={(event) => updatePrescriptionRow(index, 'frequency', event.target.value)} style={inputStyle}><option value="">Select</option>{FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></div><div><label style={labelStyle}>Duration</label><input value={row.duration} onChange={(event) => updatePrescriptionRow(index, 'duration', event.target.value)} placeholder="e.g., 5 Days" style={inputStyle} /></div><div><label style={labelStyle}>Instructions</label><input value={row.instructions} onChange={(event) => updatePrescriptionRow(index, 'instructions', event.target.value)} placeholder="e.g., After Food" style={inputStyle} /></div><button type="button" onClick={() => removePrescriptionRow(index)} disabled={prescriptionRows.length === 1} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#dc2626', fontWeight: 700, cursor: prescriptionRows.length === 1 ? 'not-allowed' : 'pointer' }}>Remove</button></div>)}{consultInteractions.length > 0 && <div style={{ marginTop: '1rem', padding: '0.9rem', borderRadius: '0.9rem', backgroundColor: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}><div style={{ fontWeight: 800, color: '#dc2626', marginBottom: '0.5rem' }}>⚠ Drug Interaction Warning</div>{consultInteractions.map((interaction, index) => <div key={index} style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}><div style={{ fontWeight: 700, color: '#dc2626' }}>{interaction.interaction_level}: {interaction.medicine1} + {interaction.medicine2}</div><div style={{ color: '#5b7088' }}>{interaction.description}</div>{interaction.suggested_alternative && <div style={{ color: '#047857', fontWeight: 600 }}>Suggested: {interaction.suggested_alternative}</div>}</div>)}</div>}{interactionMessage && <div style={{ marginTop: '0.7rem', padding: '0.65rem 0.85rem', borderRadius: '0.7rem', backgroundColor: 'rgba(245,158,11,0.08)', color: '#92400e', fontSize: '0.88rem', fontWeight: 600 }}>{interactionMessage}</div>}<div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}><button type="button" onClick={checkConsultInteractions} disabled={checkingConsultDrugs} style={{ padding: '0.65rem 1.1rem', borderRadius: '999px', border: '2px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)', color: '#d97706', fontWeight: 700, cursor: 'pointer' }}>{checkingConsultDrugs ? 'Checking...' : '🔍 Check Interactions'}</button></div></div>

                    <div><label style={labelStyle}>Request Lab Tests</label><div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{LAB_TESTS.map((test) => <button key={test} type="button" onClick={() => toggleLabRequest(test)} style={{ padding: '0.5rem 1rem', borderRadius: '999px', border: '2px solid rgba(36,84,128,0.15)', background: consultForm.lab_requests.includes(test) ? 'rgba(16,185,129,0.15)' : 'transparent', color: consultForm.lab_requests.includes(test) ? '#047857' : '#5b7088', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>{consultForm.lab_requests.includes(test) ? '✓ ' : ''}{test}</button>)}</div>{consultForm.lab_requests.length > 0 && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>Selected: {consultForm.lab_requests.join(', ')} — Will be sent to laboratory.</div>}</div>

                    <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}><button type="submit" disabled={saving} style={{ flex: 1, minWidth: '220px', padding: '0.9rem', borderRadius: '1rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}>{saving ? 'Saving...' : '💾 Save Consultation & Send Lab Requests'}</button>{savedConsultation && <button type="button" onClick={printConsultationReport} disabled={printing} style={{ padding: '0.9rem 1.4rem', borderRadius: '1rem', border: '2px solid rgba(19,117,255,0.25)', background: 'rgba(19,117,255,0.07)', color: '#1375ff', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}>{printing ? 'Preparing...' : '🖨 Print Patient Report'}</button>}</div>
                  </form>
                </SectionCard>
              )}

              {tab === 'history' && <div className="page-stack"><SectionCard title="Past Consultations">{(ehrData.previous_consultations || []).map((consultation, index) => <div key={index} style={{ padding: '0.8rem 0', borderBottom: '1px solid rgba(36,84,128,0.08)' }}><div style={{ fontWeight: 700 }}>{consultation.doctor_name} — {consultation.created_at ? new Date(consultation.created_at).toLocaleString() : ''}</div><div style={{ color: '#5b7088', fontSize: '0.9rem' }}>Diagnosis: {consultation.diagnosis || 'N/A'}</div><div style={{ color: '#5b7088', fontSize: '0.9rem' }}>Symptoms: {consultation.symptoms || 'N/A'}</div>{consultation.doctor_notes && <div style={{ color: '#5b7088', fontSize: '0.85rem', fontStyle: 'italic' }}>Notes: {consultation.doctor_notes}</div>}</div>)}</SectionCard><SectionCard title="Lab Reports">{(ehrData.lab_reports || []).map((report, index) => <div key={index} style={{ padding: '0.8rem 0', borderBottom: '1px solid rgba(36,84,128,0.08)' }}><div style={{ fontWeight: 700 }}>{report.report_type} — <span style={{ color: report.status === 'Completed' ? '#047857' : '#d97706' }}>{report.status}</span></div><div style={{ color: '#5b7088', fontSize: '0.85rem' }}>{report.uploaded_at ? new Date(report.uploaded_at).toLocaleDateString() : 'Pending'}</div>{report.ai_summary && <div style={{ color: '#5b7088', fontSize: '0.85rem', marginTop: '0.2rem' }}>{report.ai_summary.slice(0, 150)}</div>}</div>)}</SectionCard><SectionCard title="Surgeries & Vaccinations">{(ehrData.surgeries || []).map((surgery, index) => <div key={`s${index}`} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)' }}><strong>{surgery.event}</strong> — {surgery.date} {surgery.description && `(${surgery.description})`}</div>)}{(ehrData.vaccinations || []).map((vaccination, index) => <div key={`v${index}`} style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(36,84,128,0.06)' }}><strong>{vaccination.event}</strong> — {vaccination.date}</div>)}</SectionCard></div>}
            </>
          ) : (
            <SectionCard title="Patient Details"><div style={{ color: '#5b7088', textAlign: 'center', padding: '2rem' }}>Click a patient to view details.</div></SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default DoctorPatients;
