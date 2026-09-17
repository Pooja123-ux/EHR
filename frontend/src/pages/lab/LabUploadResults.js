import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const REPORT_TYPES = ['Blood Test', 'Urine Test', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Biopsy', 'Other'];

// Each template defines fields with label, unit, reference range, and default value.
// The OCR text is generated in "Parameter: value unit  [ref_low - ref_high]" format
// so the backend regex extractor and LLM can parse NORMAL/HIGH/LOW correctly.
const TEMPLATES = {
  'Blood Test': [
    { key: 'hb',          label: 'Hemoglobin',           unit: 'g/dL',    ref: '13.0 - 17.0',  default: '12.5' },
    { key: 'rbc',         label: 'RBC Count',            unit: 'mill/cmm',ref: '4.5 - 5.5',    default: '4.8'  },
    { key: 'wbc',         label: 'WBC Count',            unit: '/cumm',   ref: '4000 - 11000', default: '7200' },
    { key: 'platelets',   label: 'Platelet Count',       unit: 'lakh/cmm',ref: '1.5 - 4.0',    default: '2.1'  },
    { key: 'pcv',         label: 'PCV / Hematocrit',     unit: '%',       ref: '40 - 50',      default: '38'   },
    { key: 'glucose',     label: 'Blood Glucose Fasting',unit: 'mg/dL',   ref: '70 - 100',     default: '95'   },
    { key: 'cholesterol', label: 'Total Cholesterol',    unit: 'mg/dL',   ref: '< 200',        default: '185'  },
    { key: 'hdl',         label: 'HDL Cholesterol',      unit: 'mg/dL',   ref: '> 40',         default: '45'   },
    { key: 'ldl',         label: 'LDL Cholesterol',      unit: 'mg/dL',   ref: '< 130',        default: '110'  },
    { key: 'triglycerides',label:'Triglycerides',        unit: 'mg/dL',   ref: '< 150',        default: '140'  },
    { key: 'vitd',        label: 'Vitamin D',            unit: 'ng/mL',   ref: '30 - 100',     default: '18'   },
    { key: 'vitb12',      label: 'Vitamin B12',          unit: 'pg/mL',   ref: '200 - 900',    default: '350'  },
    { key: 'tsh',         label: 'TSH',                  unit: 'mIU/L',   ref: '0.4 - 4.0',    default: '2.1'  },
    { key: 'creatinine',  label: 'Serum Creatinine',     unit: 'mg/dL',   ref: '0.6 - 1.2',    default: '0.9'  },
    { key: 'urea',        label: 'Blood Urea',           unit: 'mg/dL',   ref: '15 - 40',      default: '22'   },
  ],
  'Urine Test': [
    { key: 'colour',      label: 'Colour',               unit: '',        ref: 'Pale Yellow',  default: 'Yellow',    qualitative: true },
    { key: 'transparency',label: 'Transparency',         unit: '',        ref: 'Clear',        default: 'Clear',     qualitative: true },
    { key: 'ph',          label: 'pH',                   unit: '',        ref: '4.5 - 8.0',    default: '6.0' },
    { key: 'spgravity',   label: 'Specific Gravity',     unit: '',        ref: '1.005 - 1.030',default: '1.015' },
    { key: 'protein',     label: 'Protein',              unit: '',        ref: 'Absent',       default: 'Absent',    qualitative: true },
    { key: 'glucose',     label: 'Glucose',              unit: '',        ref: 'Absent',       default: 'Absent',    qualitative: true },
    { key: 'ketones',     label: 'Ketone Bodies',        unit: '',        ref: 'Absent',       default: 'Absent',    qualitative: true },
    { key: 'blood',       label: 'Blood',                unit: '',        ref: 'Absent',       default: 'Absent',    qualitative: true },
    { key: 'pus',         label: 'Pus Cells',            unit: '/HPF',    ref: '0 - 5',        default: '2-3' },
    { key: 'rbc_urine',   label: 'Red Blood Cells',      unit: '/HPF',    ref: '0 - 2',        default: '0-1' },
    { key: 'epithelial',  label: 'Epithelial Cells',     unit: '/HPF',    ref: '0 - 5',        default: '1-2' },
    { key: 'bacteria',    label: 'Bacteria',             unit: '',        ref: 'Absent',       default: 'Absent',    qualitative: true },
  ],
  'ECG': [
    { key: 'rate',        label: 'Heart Rate',           unit: 'bpm',     ref: '60 - 100',     default: '78' },
    { key: 'pr',          label: 'PR Interval',          unit: 'ms',      ref: '120 - 200',    default: '160' },
    { key: 'qrs',         label: 'QRS Duration',         unit: 'ms',      ref: '80 - 120',     default: '90' },
    { key: 'qt',          label: 'QT Interval',          unit: 'ms',      ref: '350 - 440',    default: '400' },
    { key: 'rhythm',      label: 'Rhythm',               unit: '',        ref: 'Normal Sinus', default: 'Normal Sinus Rhythm', qualitative: true },
    { key: 'axis',        label: 'Electrical Axis',      unit: '',        ref: 'Normal',       default: 'Normal',    qualitative: true },
    { key: 'impression',  label: 'Impression',           unit: '',        ref: '',             default: 'Normal ECG. No significant ST-T changes.', qualitative: true },
  ],
  'X-Ray': [
    { key: 'region',      label: 'Region',               unit: '',        ref: '',             default: 'Chest PA View',     qualitative: true },
    { key: 'lungs',       label: 'Lungs',                unit: '',        ref: 'Clear',        default: 'Clear lung fields bilaterally. No consolidation or effusion.', qualitative: true },
    { key: 'heart',       label: 'Heart',                unit: '',        ref: 'Normal size',  default: 'Normal cardiac size and contour.', qualitative: true },
    { key: 'bones',       label: 'Bony Structures',      unit: '',        ref: 'Intact',       default: 'Bony structures intact. No fracture seen.', qualitative: true },
    { key: 'impression',  label: 'Impression',           unit: '',        ref: '',             default: 'Normal chest X-ray. No acute cardiopulmonary abnormality.', qualitative: true },
  ],
  'MRI': [
    { key: 'region',      label: 'Region / Sequence',    unit: '',        ref: '',             default: 'Brain MRI - T1, T2, FLAIR sequences', qualitative: true },
    { key: 'findings',    label: 'Findings',             unit: '',        ref: '',             default: 'No intracranial hemorrhage, mass lesion, or midline shift. Ventricles normal in size.', qualitative: true },
    { key: 'white_matter',label: 'White Matter',         unit: '',        ref: 'Normal',       default: 'Normal white matter signal intensity.', qualitative: true },
    { key: 'impression',  label: 'Impression',           unit: '',        ref: '',             default: 'Normal MRI of the brain. No significant abnormality detected.', qualitative: true },
  ],
  'CT Scan': [
    { key: 'region',      label: 'Region',               unit: '',        ref: '',             default: 'CT Abdomen and Pelvis with contrast', qualitative: true },
    { key: 'liver',       label: 'Liver',                unit: '',        ref: 'Normal',       default: 'Normal size and attenuation. No focal lesion.', qualitative: true },
    { key: 'kidneys',     label: 'Kidneys',              unit: '',        ref: 'Normal',       default: 'Both kidneys normal in size and density. No calculi.', qualitative: true },
    { key: 'findings',    label: 'Other Findings',       unit: '',        ref: '',             default: 'No free fluid or lymphadenopathy.', qualitative: true },
    { key: 'impression',  label: 'Impression',           unit: '',        ref: '',             default: 'No acute abdominal pathology identified.', qualitative: true },
  ],
  'Ultrasound': [
    { key: 'region',      label: 'Region',               unit: '',        ref: '',             default: 'Abdomen and Pelvis', qualitative: true },
    { key: 'liver',       label: 'Liver',                unit: '',        ref: 'Normal',       default: 'Normal size (14 cm). Homogeneous echotexture. No focal lesion.', qualitative: true },
    { key: 'gallbladder', label: 'Gallbladder',          unit: '',        ref: 'Normal',       default: 'Normal. No calculi or wall thickening.', qualitative: true },
    { key: 'kidneys',     label: 'Kidneys',              unit: '',        ref: 'Normal',       default: 'Both kidneys normal in size and echogenicity.', qualitative: true },
    { key: 'impression',  label: 'Impression',           unit: '',        ref: '',             default: 'No significant abnormality detected on ultrasound.', qualitative: true },
  ],
  'Biopsy': [
    { key: 'site',        label: 'Biopsy Site',          unit: '',        ref: '',             default: 'Skin lesion, left forearm', qualitative: true },
    { key: 'gross',       label: 'Gross Examination',    unit: '',        ref: '',             default: 'Received: 0.5 x 0.4 cm tissue fragment in formalin.', qualitative: true },
    { key: 'microscopy',  label: 'Microscopy',           unit: '',        ref: 'Benign',       default: 'Sections show stratified squamous epithelium. No malignant cells identified.', qualitative: true },
    { key: 'diagnosis',   label: 'Histopathological Diagnosis', unit: '', ref: 'Benign',       default: 'Benign fibrous tissue. No evidence of malignancy.', qualitative: true },
  ],
  'Other': [
    { key: 'findings',    label: 'Findings',             unit: '',        ref: '',             default: '', qualitative: true },
    { key: 'impression',  label: 'Impression / Conclusion', unit: '',     ref: '',             default: '', qualitative: true },
  ],
};

function buildOcrText(reportType, patientName, date, values) {
  const fields = TEMPLATES[reportType] || TEMPLATES['Other'];
  const lines = [
    `Patient Name: ${patientName || 'Patient'}`,
    `Date: ${date}`,
    `Test: ${reportType}`,
    `Lab Reference: LAB-${Math.floor(Math.random() * 90000 + 10000)}`,
    '',
    '--- RESULTS ---',
  ];
  fields.forEach((f) => {
    const val = (values[f.key] ?? f.default).toString().trim();
    if (!val) return;
    if (f.qualitative) {
      // Format: "Label: value  [ref]"
      const ref = f.ref ? `  [${f.ref}]` : '';
      lines.push(`${f.label}: ${val}${ref}`);
    } else {
      // Format: "Label value unit  ref_low - ref_high"
      // This matches the regex extractor pattern in llm_service.py
      const ref = f.ref ? `  ${f.ref}` : '';
      lines.push(`${f.label} ${val} ${f.unit}${ref}`);
    }
  });
  return lines.join('\n');
}

function LabUploadResults() {
  const [searchParams] = useSearchParams();
  const prePatientId  = searchParams.get('patient_id')  || '';
  const preReportType = decodeURIComponent(searchParams.get('report_type') || '');

  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patient_id: prePatientId, report_type: preReportType });
  const [values, setValues] = useState({});
  const [reportFile, setReportFile] = useState(null);
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.labPatients().then(setPatients).catch(() => {});
  }, []);

  // Reset values when report type changes
  const handleTypeChange = (type) => {
    const fields = TEMPLATES[type] || TEMPLATES['Other'];
    const defaults = {};
    fields.forEach((f) => { defaults[f.key] = f.default; });
    setForm((prev) => ({ ...prev, report_type: type }));
    setValues(defaults);
    setOcrReady(false);
    setOcrText('');
    setSuccess('');
    setError('');
  };

  const handleExtract = () => {
    if (!form.report_type) { setError('Please select a report type first.'); return; }
    setError('');
    const patient = patients.find((p) => p.patient_id === parseInt(form.patient_id));
    const text = buildOcrText(form.report_type, patient?.full_name, new Date().toLocaleDateString(), values);
    setOcrText(text);
    setOcrReady(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient_id) { setError('Please select a patient.'); return; }
    if (!form.report_type) { setError('Please select a report type.'); return; }
    if (!ocrReady) { setError('Please extract OCR first.'); return; }
    setError(''); setSuccess(''); setSaving(true);
    try {
      const fd = new FormData();
      fd.append('patient_id', form.patient_id);
      fd.append('report_type', form.report_type);
      fd.append('ocr_text', ocrText);
      if (reportFile) fd.append('report_file', reportFile);
      await api.uploadLabReportFile(fd);
      setSuccess('Report saved. AI analysis will be generated automatically.');
      setForm({ patient_id: '', report_type: '' });
      setValues({});
      setReportFile(null);
      setOcrReady(false);
      setOcrText('');
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const fields = TEMPLATES[form.report_type] || [];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Lab Portal" title="Upload Results"
        subtitle="Enter test values — structured OCR is generated automatically for AI analysis." />

      <div className="content-grid">
        {/* Left: Form */}
        <SectionCard title="Report Details">
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Patient *</label>
              <select required value={form.patient_id}
                onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}>
                <option value="">Select patient</option>
                {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.full_name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Report Type *</label>
              <select required value={form.report_type} onChange={(e) => handleTypeChange(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}>
                <option value="">Select type</option>
                {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Dynamic parameter fields */}
            {fields.length > 0 && (
              <div style={{ display: 'grid', gap: '0.7rem', borderTop: '2px solid rgba(36,84,128,0.08)', paddingTop: '0.8rem' }}>
                <div style={{ fontWeight: 700, color: '#5b7088', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Test Values
                </div>
                {fields.map((f) => (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</div>
                      {f.ref && <div style={{ fontSize: '0.78rem', color: '#5b7088' }}>Ref: {f.ref}</div>}
                    </div>
                    {f.qualitative && f.label.toLowerCase().includes('impression') || f.qualitative && (values[f.key] || f.default).length > 30 ? (
                      <textarea
                        rows={2}
                        value={values[f.key] ?? f.default}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        style={{ padding: '0.5rem 0.7rem', borderRadius: '0.7rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    ) : (
                      <input
                        value={values[f.key] ?? f.default}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        style={{ padding: '0.55rem 0.7rem', borderRadius: '0.7rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '0.9rem' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                Report File <span style={{ fontWeight: 400, color: '#5b7088' }}>(PDF, JPG, PNG — optional)</span>
              </label>
              <input type="file" accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setReportFile(e.target.files?.[0] || null)} />
              {reportFile && <div style={{ color: '#047857', fontSize: '0.85rem', marginTop: '0.3rem', fontWeight: 600 }}>{reportFile.name} ready</div>}
            </div>

            {/* Extract button */}
            {form.report_type && (
              <div onClick={handleExtract} style={{
                padding: '1.2rem', borderRadius: '1.2rem', cursor: 'pointer', textAlign: 'center',
                border: `2px dashed ${ocrReady ? 'rgba(16,185,129,0.4)' : 'rgba(36,84,128,0.3)'}`,
                background: ocrReady ? 'rgba(16,185,129,0.04)' : 'rgba(19,117,255,0.03)',
              }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>{ocrReady ? '✅' : '📄'}</div>
                <div style={{ fontWeight: 700 }}>{ocrReady ? 'OCR Generated — Click to Regenerate' : 'Generate Structured OCR Text'}</div>
                <div style={{ color: '#5b7088', fontSize: '0.85rem' }}>Creates parseable text for AI NORMAL/HIGH/LOW analysis</div>
              </div>
            )}

            {success && <div style={{ padding: '0.8rem', borderRadius: '0.8rem', background: 'rgba(16,185,129,0.1)', color: '#047857', fontWeight: 600 }}>{success}</div>}
            {error   && <div style={{ padding: '0.8rem', borderRadius: '0.8rem', background: 'rgba(239,68,68,0.1)',  color: '#dc2626', fontWeight: 600 }}>{error}</div>}

            {ocrReady && (
              <button type="submit" disabled={saving}
                style={{ width: '100%', padding: '1rem', borderRadius: '1rem', border: 'none', background: 'linear-gradient(135deg,#1375ff,#00a7c7)', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}>
                {saving ? 'Uploading...' : 'Save Report'}
              </button>
            )}
          </form>
        </SectionCard>

        {/* Right: OCR preview */}
        <div className="page-stack">
          {ocrReady ? (
            <SectionCard title="📄 Generated OCR Text (sent to AI)">
              <div style={{ padding: '1rem', borderRadius: '1rem', background: 'rgba(0,0,0,0.03)', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.8, maxHeight: '500px', overflowY: 'auto' }}>
                {ocrText}
              </div>
              <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '0.8rem', background: 'rgba(19,117,255,0.06)', border: '1px solid rgba(19,117,255,0.15)', fontSize: '0.85rem', color: '#1e40af', lineHeight: 1.6 }}>
                💡 This structured text is sent to the AI pipeline. The backend will extract each parameter, compare against reference ranges, and classify as <strong>NORMAL / HIGH / LOW</strong>. The patient will see the full analysis in their AI Summary page.
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="How it works">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', color: '#5b7088' }}>
                {[
                  'Select the patient and report type.',
                  'Fill in the actual test values in the fields that appear.',
                  'Click "Generate Structured OCR Text" — this creates a parseable format.',
                  'The backend AI extracts each parameter and classifies it as NORMAL, HIGH, or LOW against reference ranges.',
                  'The patient sees a full analysis with color-coded findings in their AI Summary page.',
                  'Optionally attach the original PDF or image file.',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                    <span style={{ background: 'rgba(19,117,255,0.1)', color: '#1375ff', borderRadius: '50%', width: '1.6rem', height: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: '0.85rem' }}>{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default LabUploadResults;
