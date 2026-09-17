import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';
import { appRoutes } from '../../data/appData';

const EMPTY = { report_type: '' };

const REPORT_TYPES = ['Blood Test', 'Urine Test', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Biopsy', 'Prescription', 'Other'];

function PatientUploadRecord() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setError('Only PDF, JPG and PNG files are supported.');
      e.target.value = '';
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.report_type) {
      setError('Please select a report type.');
      return;
    }
    if (!selectedFile) {
      setError('Please select a file.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('report_type', form.report_type);
      formData.append('report_file', selectedFile);

      const result = await api.uploadPatientRecord(formData);
      setSuccess('Record uploaded successfully! AI analysis will be generated shortly.');
      setForm(EMPTY);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (result.report_id) {
        pollProcessingStatus(result.report_id);
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const pollProcessingStatus = async (reportId) => {
    const maxAttempts = 20;
    const interval = 3000;
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await api.getReportProcessingStatus(reportId);
        if (status.processing_status === 'COMPLETED' || status.processing_status === 'FAILED') {
          if (status.processing_status === 'FAILED') {
            setError('Processing failed: ' + (status.processing_error || 'Unknown error'));
          }
          return;
        }
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, interval);
        }
      } catch {
        // Ignore polling errors
      }
    };

    poll();
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Medical Records"
        title="Upload Record"
        subtitle="Add a report to your health records."
      >
        <Link to={appRoutes.patient.records} className="btn btn--ghost">
          Back to Records
        </Link>
      </PageHeader>

      <div className="content-grid">
        <SectionCard title="Report Details">
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Report Type *</label>
              <select
                required
                value={form.report_type}
                onChange={(e) => {
                  setSuccess('');
                  setError('');
                  setForm({ ...form, report_type: e.target.value });
                }}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.8rem', border: '2px solid rgba(36,84,128,0.1)', fontSize: '1rem' }}
              >
                <option value="">Select type</option>
                {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div
              style={{ padding: '2rem', borderRadius: '1.2rem', border: '2px dashed rgba(36,84,128,0.3)', backgroundColor: 'rgba(19,117,255,0.03)', textAlign: 'center', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📄</div>
              <div style={{ fontWeight: 700 }}>Click to choose a report file</div>
              <div style={{ color: '#5b7088', fontSize: '0.9rem' }}>Supports PDF, JPG, PNG.</div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
                style={{ display: 'none' }} id="file-upload" />
            </div>
            {selectedFile && (
              <div style={{ marginTop: '0.75rem', color: '#1e293b', fontWeight: 600 }}>
                Selected file: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {success && <div style={{ padding: '0.8rem', borderRadius: '0.8rem', backgroundColor: 'rgba(16,185,129,0.1)', color: '#047857', fontWeight: 600 }}>{success}</div>}
            {error && <div style={{ padding: '0.8rem', borderRadius: '0.8rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626', fontWeight: 600 }}>{error}</div>}

            <button type="submit" disabled={saving} className="btn btn--primary" style={{ width: '100%' }}>
              {saving ? 'Uploading...' : 'Save Record'}
            </button>

            {success && (
              <button type="button" className="btn btn--secondary" style={{ width: '100%' }} onClick={() => navigate(appRoutes.patient.records)}>
                Go to Medical Records
              </button>
            )}
          </form>
        </SectionCard>

        <div className="page-stack">
          <SectionCard title="How it works">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', color: '#5b7088' }}>
              {['Select the report type.', 'Upload a PDF, JPG, or PNG of your medical report.', 'The system will automatically extract text and generate an AI analysis.', 'View the analysis in the AI Summary page after upload.'].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                  <span style={{ background: 'rgba(19,117,255,0.1)', color: '#1375ff', borderRadius: '50%', width: '1.6rem', height: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: '0.85rem' }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default PatientUploadRecord;
