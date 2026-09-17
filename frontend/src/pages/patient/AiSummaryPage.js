import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api, fileUrl } from '../../services/api';
import { appRoutes } from '../../data/appData';

const STATUS_CONFIG = {
  NORMAL: { color: '#059669', bg: 'rgba(5,150,105,0.1)',  border: 'rgba(5,150,105,0.25)',  icon: '✅' },
  HIGH:   { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)',   icon: '▲' },
  LOW:    { color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)',   icon: '▼' },
  UNKNOWN:{ color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', icon: '?' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.UNKNOWN;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.78rem',
      fontWeight: 700, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, letterSpacing: '0.02em',
    }}>
      {cfg.icon} {status}
    </span>
  );
}

function OverallBanner({ findings, hasOcrText, hasSummary }) {
  if (!findings || findings.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1rem 1.25rem', borderRadius: '0.9rem', marginBottom: '1.2rem',
        background: hasSummary ? 'rgba(19,117,255,0.05)' : 'rgba(100,116,139,0.07)',
        border: `1.5px solid ${hasSummary ? 'rgba(19,117,255,0.18)' : 'rgba(100,116,139,0.18)'}`,
      }}>
        <span style={{ fontSize: '1.5rem' }}>{hasSummary ? '📋' : '⚠️'}</span>
        <div>
          <div style={{ fontWeight: 700, color: hasSummary ? '#1375ff' : '#475569', fontSize: '0.95rem' }}>
            {hasSummary ? 'AI analysis available — see summary below' : 'No structured values detected'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
            {hasOcrText ? 'Could not extract known parameters from this report.' : 'No OCR text available — parameter-level analysis requires report text.'}
          </div>
        </div>
      </div>
    );
  }
  const high   = findings.filter(f => f.status === 'HIGH').length;
  const low    = findings.filter(f => f.status === 'LOW').length;
  const normal = findings.filter(f => f.status === 'NORMAL').length;
  const abnormal = high + low;

  const { color, bg, border, icon, label } = abnormal === 0
    ? { color: '#059669', bg: 'rgba(5,150,105,0.08)',  border: 'rgba(5,150,105,0.2)',  icon: '✅', label: 'All parameters within normal range' }
    : { color: '#dc2626', bg: 'rgba(220,38,38,0.07)',  border: 'rgba(220,38,38,0.18)', icon: '⚠️', label: `${abnormal} parameter${abnormal > 1 ? 's' : ''} outside normal range` };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem',
      padding: '1rem 1.25rem', borderRadius: '0.9rem',
      background: bg, border: `1.5px solid ${border}`, marginBottom: '1.2rem',
    }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color, fontSize: '0.95rem' }}>{label}</div>
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
          {normal} Normal &nbsp;·&nbsp;
          <span style={{ color: '#dc2626' }}>{high} High</span> &nbsp;·&nbsp;
          <span style={{ color: '#d97706' }}>{low} Low</span>
        </div>
      </div>
    </div>
  );
}

function FindingsTable({ findings }) {
  if (!findings || findings.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
        <thead>
          <tr style={{ background: 'rgba(19,117,255,0.05)' }}>
            {['Parameter', 'Value', 'Unit', 'Reference Range', 'Status', 'Confidence'].map(h => (
              <th key={h} style={{
                padding: '0.65rem 0.9rem', textAlign: 'left',
                fontWeight: 700, color: '#475569', fontSize: '0.78rem',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                borderBottom: '2px solid rgba(19,117,255,0.1)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => {
            const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.UNKNOWN;
            const isQualitative = ['text', 'categorical', 'qualitative', 'imaging_finding', 'medication'].includes((f.type || '').toLowerCase());
            const hasRef = f.reference_low != null && f.reference_high != null;
            const displayRef = hasRef
              ? `${f.reference_low} - ${f.reference_high} ${f.unit || ''}`
              : (f.reference || (isQualitative ? 'Qualitative result' : 'Reference range not provided in report'));
            return (
              <tr key={i} style={{
                background: f.status !== 'NORMAL' && f.status !== 'Unknown' ? cfg.bg : 'transparent',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
              }}>
                <td style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: '#1e293b' }}>
                  {f.parameter}
                  {isQualitative && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.4rem', textTransform: 'uppercase' }}>Qualitative</span>}
                </td>
                <td style={{ padding: '0.65rem 0.9rem', fontWeight: 700, color: cfg.color, fontSize: '0.95rem', fontStyle: isQualitative ? 'italic' : 'normal' }}>
                  {f.value}
                  {f.unit_mismatch && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#dc2626', marginLeft: '0.4rem' }}>UNIT MISMATCH</span>}
                </td>
                <td style={{ padding: '0.65rem 0.9rem', color: '#64748b' }}>{f.unit}</td>
                <td style={{ padding: '0.65rem 0.9rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.82rem' }}>{displayRef}</td>
                <td style={{ padding: '0.65rem 0.9rem' }}><StatusBadge status={f.status} /></td>
                <td style={{ padding: '0.65rem 0.9rem', fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{f.confidence || 'LOW'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KeyMetrics({ findings }) {
  if (!findings || findings.length === 0) return null;
  const abnormal = findings.filter(f => f.status !== 'NORMAL');
  if (abnormal.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.2rem' }}>
      {abnormal.map((f, i) => {
        const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.UNKNOWN;
        return (
          <div key={i} style={{
            padding: '0.75rem 1rem', borderRadius: '0.8rem', minWidth: '130px',
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            display: 'flex', flexDirection: 'column', gap: '0.2rem',
          }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{f.parameter}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: cfg.color }}>{f.value} <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{f.unit}</span></div>
            <StatusBadge status={f.status} />
          </div>
        );
      })}
    </div>
  );
}

function TrendComparison({ trends }) {
  const comparable = (trends || []).filter((trend) => trend.direction !== 'New');
  if (comparable.length === 0) return null;
  return (
    <div style={{ marginTop: '1.2rem' }}>
      <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem', marginBottom: '0.7rem' }}>Compared with your previous report</div>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {comparable.map((trend) => {
          const direction = trend.direction === 'Up' ? '▲ Increased' : trend.direction === 'Down' ? '▼ Decreased' : '● Unchanged';
          const color = trend.direction === 'Up' ? '#dc2626' : trend.direction === 'Down' ? '#d97706' : '#059669';
          const statusChanged = trend.previous_status !== trend.current_status;
          return (
            <div key={trend.parameter} style={{ padding: '0.8rem 0.95rem', borderRadius: '0.75rem', background: 'rgba(19,117,255,0.04)', border: '1px solid rgba(19,117,255,0.12)', display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div><strong>{trend.parameter}</strong><span style={{ color: '#64748b', marginLeft: '0.45rem', fontSize: '0.85rem' }}>{trend.previous_value} → {trend.current_value} {trend.unit}</span></div>
              <div style={{ color, fontWeight: 800, fontSize: '0.85rem' }}>{direction}{statusChanged ? ` · ${trend.previous_status} → ${trend.current_status}` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AiSummaryPage() {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [analyzingVision, setAnalyzingVision] = useState(false);
  const [visionError, setVisionError] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState('');
  const [processingStatus, setProcessingStatus] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: 'Hi! I can explain your medical report in simple language. Ask me anything about your results.' },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api.patientRecords()
      .then((data) => {
        setRecords(data);
        const paramId = searchParams.get('report');
        if (paramId) {
          const match = data.find((r) => r.report_id === parseInt(paramId));
          setSelectedReport(match || data[0] || null);
        } else if (data.length > 0) {
          setSelectedReport(data[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRecords(false));
  }, []);

  useEffect(() => {
    if (!selectedReport) return;
    setSummaryData(null);
    setLoadingSummary(true);
    setProcessingStatus(null);
    api.getAiSummary(selectedReport.report_id)
      .then((data) => {
        setSummaryData(data);
        if (data?.generated_at) {
          setProcessingStatus('COMPLETED');
        }
      })
      .catch(() => setSummaryData(null))
      .finally(() => setLoadingSummary(false));
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport) return;
    setChatMessages([
      { role: 'ai', text: 'Hi! I can explain this medical report in simple language. Ask me anything about your results.' },
    ]);
    setChatInput('');
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport) return;
    let timer = null;
    const poll = async () => {
      try {
        const status = await api.getReportProcessingStatus(selectedReport.report_id);
        setProcessingStatus(status.processing_status);
        if (status.processing_status === 'COMPLETED') {
          if (!summaryData) {
            setLoadingSummary(true);
            api.getAiSummary(selectedReport.report_id)
              .then(setSummaryData)
              .catch(() => setSummaryData(null))
              .finally(() => setLoadingSummary(false));
          }
          return;
        }
        if (status.processing_status === 'FAILED') {
          return;
        }
        timer = setTimeout(poll, 3000);
      } catch {
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { if (timer) clearTimeout(timer); };
  }, [selectedReport]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChat = async (e) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || !selectedReport) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: q }]);
    setChatLoading(true);
    try {
      const data = await api.aiSummaryChat(selectedReport.report_id, q);
      setChatMessages((prev) => [...prev, { role: 'ai', text: data.response }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, I could not process that right now. Please try again later.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleVisionAnalysis = async () => {
    if (!selectedReport) return;
    setAnalyzingVision(true);
    setVisionError('');
    try {
      const data = await api.analyzeReportImage(selectedReport.report_id);
      setSelectedReport((prev) => ({ ...prev, report_type: data.report_type, ocr_text: data.ocr_text }));
      setSummaryData(null);
    } catch (err) {
      setVisionError(err.message || 'Vision analysis failed');
    } finally {
      setAnalyzingVision(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selectedReport) return;
    setReanalyzing(true);
    setReanalyzeError('');
    try {
      const data = await api.reanalyzeReport(selectedReport.report_id);
      setSelectedReport((prev) => ({ ...prev, ocr_text: data.ocr_text }));
      setSummaryData({
        ...summaryData,
        ocr_text: data.ocr_text,
        summary: data.summary,
        structured_data: data.structured_data,
        findings: data.structured_data?.parameters || summaryData?.findings || [],
        imaging_findings: data.structured_data?.findings || summaryData?.imaging_findings || [],
      });
    } catch (err) {
      setReanalyzeError(err.message || 'Re-analysis failed');
    } finally {
      setReanalyzing(false);
    }
  };

  if (loadingRecords) return (
    <div className="page-stack">
      <div style={{ padding: '2rem', textAlign: 'center' }}>Loading reports...</div>
    </div>
  );

  const findings = summaryData?.findings || [];
  const trends = summaryData?.trends || [];
  const structured = summaryData?.structured_data || {};
  const imagingFindings = summaryData?.imaging_findings || [];
  const impression = structured?.impression || '';
  const rawUncertain = structured?.uncertain_items;
  const uncertainItems = Array.isArray(rawUncertain)
    ? rawUncertain.filter((u) => typeof u === 'string' && u.trim().length > 0)
    : (typeof rawUncertain === 'string' && rawUncertain.trim().length > 0 ? [rawUncertain.trim()] : []);
  const SYSTEM_NOTE_PATTERNS = [
    'extractable text', 'extraction failed', 'no extractable', 'uploaded', 'pdf uploaded',
    'image uploaded', 'ocr text', 'no specific', 'cannot be automatically',
    'consult your doctor', 'lab needs to', 'no text', 'no analysis',
  ];
  const displayUncertainItems = uncertainItems.filter((item) => {
    const lower = item.toLowerCase();
    return !SYSTEM_NOTE_PATTERNS.some((p) => lower.includes(p));
  });

  const hasImagingFindings = imagingFindings.length > 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="AI Summary"
        title="Medical Report Analysis"
        subtitle="Report analysis with parameter-level NORMAL / HIGH / LOW classification."
      >
        <button className="btn btn--primary" onClick={() => window.print()}>⬇ Download</button>
        <Link to={appRoutes.patient.records} className="btn btn--ghost">← Records</Link>
      </PageHeader>

      {records.length === 0 ? (
        <SectionCard>
          <div className="empty-state">
            <div className="empty-state__icon">📋</div>
            <div className="empty-state__title">No lab reports found</div>
            <div className="empty-state__desc">Reports will appear here once your doctor requests lab tests.</div>
          </div>
        </SectionCard>
      ) : (
        <>
          {/* Report selector */}
          <SectionCard title="Select Report">
            <div className="auto-grid auto-grid--tight">
              {records.map((r) => (
                <button
                  key={r.report_id}
                  onClick={() => setSelectedReport(r)}
                  className={`btn ${selectedReport?.report_id === r.report_id ? 'btn--secondary' : 'btn--ghost'}`}
                >
                  {r.report_type || `Report #${r.report_id}`}
                  <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.4rem' }}>
                    {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : ''}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.4rem' }}>
            {/* Left — report details + preview */}
            <div className="page-stack">
              <SectionCard title="Report Details">
                <div className="flex-col flex-gap--sm">
                  {[
                    { label: 'Report Type', value: selectedReport?.report_type },
                    { label: 'Date', value: selectedReport?.uploaded_at ? new Date(selectedReport.uploaded_at).toLocaleDateString() : '—' },
                    { label: 'Hospital', value: selectedReport?.hospital || '—' },
                    { label: 'Doctor',   value: selectedReport?.doctor   || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="detail-row">
                      <span className="detail-row__label">{label}</span>
                      <span className="detail-row__value">{value}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Report Preview">
                <div className="flex-center" style={{
                  aspectRatio: '1/1.1', borderRadius: '1rem',
                  background: 'linear-gradient(135deg,rgba(19,117,255,0.06),rgba(0,182,201,0.04))',
                  border: '2px dashed rgba(36,84,128,0.15)',
                  flexDirection: 'column', gap: '1rem',
                }}>
                  <div style={{ fontSize: '3rem' }}>📄</div>
                  <div style={{ fontWeight: 700, color: '#5b7088' }}>{selectedReport?.report_type || 'Report'}</div>
                  {selectedReport?.report_file ? (
                    <>
                      <a href={fileUrl(selectedReport.report_file)} target="_blank" rel="noreferrer" className="btn btn--ghost">
                        View Full Report
                      </a>
                      <button
                        onClick={handleVisionAnalysis}
                        disabled={analyzingVision}
                        className="btn btn--secondary"
                        style={{ marginTop: '0.5rem' }}
                      >
                        {analyzingVision ? 'Analyzing Image...' : '🔬 Analyze with Vision Model'}
                      </button>
                      <button
                        onClick={handleReanalyze}
                        disabled={reanalyzing}
                        className="btn btn--primary"
                        style={{ marginTop: '0.5rem' }}
                      >
                        {reanalyzing ? 'Re-analyzing...' : '🔄 Re-analyze Report'}
                      </button>
                    </>
                  ) : (
                    <div className="empty-state__desc">No file attached</div>
                  )}
                  {visionError && (
                    <div style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{visionError}</div>
                  )}
                  {reanalyzeError && (
                    <div style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{reanalyzeError}</div>
                  )}
                </div>
              </SectionCard>
            </div>

            {/* Right — AI analysis */}
            <div className="page-stack">
              {processingStatus && processingStatus !== 'COMPLETED' && processingStatus !== 'FAILED' && (
                <SectionCard>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem', borderRadius: '0.9rem', marginBottom: '1.2rem',
                    background: 'rgba(19,117,255,0.05)', border: '1.5px solid rgba(19,117,255,0.18)',
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>⏳</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1375ff', fontSize: '0.95rem' }}>Processing Report</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                        Status: {processingStatus} — AI analysis will appear here shortly.
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}
              {processingStatus === 'FAILED' && (
                <SectionCard>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem', borderRadius: '0.9rem', marginBottom: '1.2rem',
                    background: 'rgba(220,38,38,0.05)', border: '1.5px solid rgba(220,38,38,0.18)',
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#dc2626', fontSize: '0.95rem' }}>Processing Failed</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                        The report could not be processed. Please try re-analyzing or contact support.
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}
              {loadingSummary ? (
                <SectionCard>
                  <div className="loading-state">
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
                    <div>Generating AI analysis...</div>
                  </div>
                </SectionCard>
              ) : summaryData ? (
                <>
                  {/* Header banner */}
                  <SectionCard title="🤖 AI Analysis">
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: '1.2rem', padding: '0.75rem 1rem', borderRadius: '0.75rem',
                      background: 'rgba(19,117,255,0.05)', border: '1px solid rgba(19,117,255,0.12)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>✅</span>
                        <span style={{ fontWeight: 700, color: '#1375ff', fontSize: '0.9rem' }}>Analysis Available</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {summaryData.generated_at ? new Date(summaryData.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>

                    {/* Overall status */}
                    {!hasImagingFindings && <OverallBanner findings={findings} hasOcrText={!!summaryData.ocr_text} hasSummary={!!summaryData.summary} />}

                    {/* Abnormal metrics cards */}
                    {!hasImagingFindings && <KeyMetrics findings={findings} />}

                    {/* Findings table or imaging findings */}
                    {hasImagingFindings ? (
                      imagingFindings.length > 0 ? (
                        <div style={{ marginBottom: '1.2rem' }}>
                          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem', marginBottom: '0.7rem' }}>Key Findings</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {imagingFindings.map((f, i) => (
                              <div key={i} style={{
                                padding: '0.75rem 1rem', borderRadius: '0.75rem',
                                background: 'rgba(19,117,255,0.04)', border: '1px solid rgba(19,117,255,0.12)',
                                fontSize: '0.92rem', color: '#334155', lineHeight: 1.6,
                              }}>
                                {f}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: '1.25rem', borderRadius: '0.8rem',
                          background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)',
                          marginBottom: '1.2rem',
                        }}>
                          {!summaryData.ocr_text && (
                            <div style={{
                              padding: '0.65rem 0.9rem', borderRadius: '0.6rem',
                              background: 'rgba(19,117,255,0.06)', border: '1px solid rgba(19,117,255,0.15)',
                              fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.6,
                            }}>
                              💡 To get parameter-level analysis, the lab needs to include OCR text when uploading this report.
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      findings.length > 0 ? (
                        <FindingsTable findings={findings} />
                      ) : (
                        <div style={{
                          padding: '1.25rem', borderRadius: '0.8rem',
                          background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)',
                          marginBottom: '1.2rem',
                        }}>
                          {!summaryData.ocr_text && (
                            <div style={{
                              padding: '0.65rem 0.9rem', borderRadius: '0.6rem',
                              background: 'rgba(19,117,255,0.06)', border: '1px solid rgba(19,117,255,0.15)',
                              fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.6,
                            }}>
                              💡 Parameter-level NORMAL/HIGH/LOW analysis requires the report text to be uploaded along with the file.
                            </div>
                          )}
                        </div>
                      )
                    )}
                    {!hasImagingFindings && findings.length > 0 && <TrendComparison trends={trends} />}

                    {/* Impression */}
                    {impression && (
                      <div className="ai-summary-highlight" style={{ marginTop: findings.length > 0 ? '1.2rem' : 0 }}>
                        <div className="ai-summary-highlight__header">
                          <div className="ai-summary-highlight__title">
                            <span className="ai-summary-highlight__icon">📋</span>
                            Impression
                          </div>
                        </div>
                        <div className="ai-summary-highlight__body">
                          {impression}
                        </div>
                      </div>
                    )}

                    {/* Uncertain items */}
                    {displayUncertainItems.length > 0 && (
                      <div style={{
                        marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '0.7rem',
                        background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                        fontSize: '0.85rem', color: '#92400e', lineHeight: 1.6,
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>⚠️ Notes</div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                          {displayUncertainItems.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Report summary - always shown */}
                    <div className="ai-summary-highlight" style={{ marginTop: (findings.length > 0 || impression || displayUncertainItems.length > 0) ? '1.2rem' : 0 }}>
                      <div className="ai-summary-highlight__header">
                        <div className="ai-summary-highlight__title">
                          <span className="ai-summary-highlight__icon">📋</span>
                          Report Summary
                        </div>
                        <div className="ai-summary-highlight__meta">
                          <span className="ai-summary-highlight__status">
                            <span>✅</span> Analysis Available
                          </span>
                          <span className="ai-summary-highlight__date">
                            {summaryData.generated_at ? new Date(summaryData.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </span>
                        </div>
                      </div>
                      <div className="ai-summary-highlight__body">
                        {summaryData.summary || 'No analysis available. Please try again later.'}
                      </div>
                      {!summaryData.ocr_text && findings.length === 0 && (
                        <div style={{
                          marginTop: '1rem', padding: '0.65rem 0.9rem', borderRadius: '0.6rem',
                          background: 'rgba(19,117,255,0.06)', border: '1px solid rgba(19,117,255,0.15)',
                          fontSize: '0.8rem', color: '#1e40af',
                        }}>
                          💡 To get parameter-level NORMAL/HIGH/LOW analysis, the lab needs to include OCR text when uploading this report.
                        </div>
                      )}
                    </div>

                    {/* Disclaimer */}
                    <div style={{
                      marginTop: '1.2rem', padding: '0.75rem 1rem', borderRadius: '0.7rem',
                      background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                      fontSize: '0.8rem', color: '#92400e', lineHeight: 1.6,
                    }}>
                      ⚕️ This analysis is AI-generated for informational purposes only. Please consult your doctor for medical advice.
                    </div>
                  </SectionCard>

                  {/* Chat */}
                  <SectionCard title="💬 Ask AI About This Report">
                    <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1rem' }}>
                      {chatMessages.map((msg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: '1.1rem',
                            background: msg.role === 'user' ? 'rgba(19,117,255,0.1)' : 'rgba(16,185,129,0.08)',
                            color: msg.role === 'user' ? '#1375ff' : '#065f46',
                            fontSize: '0.92rem', lineHeight: 1.6,
                          }}>
                            {msg.role === 'ai' && <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.25rem', color: '#047857' }}>🤖 AI Assistant</div>}
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                          <div style={{
                            maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: '1.1rem',
                            background: 'rgba(16,185,129,0.08)', color: '#065f46',
                            fontSize: '0.92rem', lineHeight: 1.6,
                          }}>
                            <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.25rem', color: '#047857' }}>🤖 AI Assistant</div>
                            Thinking...
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleChat} style={{ display: 'flex', gap: '0.6rem' }}>
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask about your report..."
                        className="input-field"
                        style={{ margin: 0 }}
                      />
                      <button type="submit" className="btn btn--primary" disabled={chatLoading}>{chatLoading ? 'Thinking...' : 'Send'}</button>
                    </form>
                  </SectionCard>
                </>
              ) : (
                <SectionCard>
                  <div className="empty-state">
                    <div className="empty-state__icon">🤖</div>
                    <div className="empty-state__title">No AI Summary Yet</div>
                    <div className="empty-state__desc">
                      The AI summary will be generated automatically after the lab uploads and processes this report.
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AiSummaryPage;
