import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const levelStyle = {
  'Safe':             { bg: 'rgba(16,185,129,0.08)',  badge: 'rgba(16,185,129,0.2)',  color: '#047857', icon: '✅' },
  'Moderate':         { bg: 'rgba(245,158,11,0.08)', badge: 'rgba(245,158,11,0.2)', color: '#d97706', icon: '⚠️' },
  'High Risk':        { bg: 'rgba(239,68,68,0.08)',  badge: 'rgba(239,68,68,0.2)',  color: '#dc2626', icon: '🚨' },
  'Insufficient Data':{ bg: 'rgba(100,116,139,0.08)', badge: 'rgba(100,116,139,0.2)', color: '#475569', icon: '⚪' },
};

const DRUG_HINTS = [
  'Type a medicine and press Enter',
  'Try a drug name from the dropdown',
  'Enter brand or generic names',
  'Add all medications you are currently taking',
];

const FALLBACK_DRUG_OPTIONS = [
  'Warfarin', 'Ibuprofen', 'Aspirin', 'Metformin', 'Alcohol', 'Simvastatin',
  'Amiodarone', 'Paracetamol', 'Amoxicillin', 'Omeprazole', 'Clopidogrel',
  'SSRIs', 'Tramadol', 'Atenolol', 'Atorvastatin', 'Cefalexin', 'Cetirizine',
  'Hydrochlorothiazide', 'Insulin', 'Levothyroxine', 'Pantoprazole',
];

function DrugInteractionChecker() {
  const [medicines, setMedicines] = useState(['', '', '']);
  const [results, setResults] = useState(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCommonDrug, setSelectedCommonDrug] = useState('');
  const [drugOptions, setDrugOptions] = useState([]);
  const [hintIndex, setHintIndex] = useState(0);

  const updateMedicine = (i, val) => {
    const updated = [...medicines];
    updated[i] = val;
    setMedicines(updated);
  };

  const addField = () => setMedicines(prev => [...prev, '']);
  const removeField = (i) => setMedicines(prev => prev.filter((_, idx) => idx !== i));

  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === medicines.length - 1 && medicines[index].trim()) {
        addField();
      }
      handleCheck();
    }
  };

  const cycleHint = () => setHintIndex((prev) => (prev + 1) % DRUG_HINTS.length);

  useEffect(() => {
    let isMounted = true;

    api.getDrugList()
      .then((list) => {
        if (!isMounted) return;
        const normalized = Array.isArray(list) ? list.filter(Boolean) : [];
        setDrugOptions(normalized.length ? normalized : FALLBACK_DRUG_OPTIONS);
      })
      .catch(() => {
        if (isMounted) setDrugOptions(FALLBACK_DRUG_OPTIONS);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCheck = async () => {
    const filled = [...new Map(
      medicines
        .map((m) => m.trim())
        .filter(Boolean)
        .map((medicine) => [medicine.toLowerCase(), medicine]),
    ).values()];
    if (filled.length < 2) {
      setError('Please enter at least two different medicines to check for interactions.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.checkDrugInteraction(filled);
      const mapped = data.map((r) => ({
        drug1: r.medicine1,
        drug2: r.medicine2,
        level: r.interaction_level,
        desc: r.description,
        alt: r.suggested_alternative,
        ai_estimate: r.ai_estimate,
        evidence_source: r.evidence_source,
      }));
      setResults(mapped.sort((a, b) => {
        const priority = { 'High Risk': 0, Moderate: 1, Safe: 2, 'Insufficient Data': 3 };
        return (priority[a.level] ?? 3) - (priority[b.level] ?? 3);
      }));
      setChecked(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => { setMedicines(['', '', '']); setResults(null); setChecked(false); setError(''); };

  const summary = results ? {
    safe: results.filter(r => r.level === 'Safe').length,
    moderate: results.filter(r => r.level === 'Moderate').length,
    high: results.filter(r => r.level === 'High Risk').length,
    insufficient: results.filter(r => r.level === 'Insufficient Data').length,
  } : null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Drug Interaction Checker"
        title="Check Medicine Interactions"
        subtitle="Enter your medicines to detect potential interactions and risks."
      />

      <div className="two-col-grid" style={{ gridTemplateColumns: checked ? '380px 1fr' : '560px', gap: '1.4rem', justifyContent: 'center' }}>

        {/* Input */}
        <div className="page-stack">
          <SectionCard title="💊 Enter Medicines">
            <div style={{ marginBottom: '1rem' }}>
              <label className="field-label" style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
                Add a medicine from the dropdown
              </label>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={selectedCommonDrug}
                  onChange={(e) => setSelectedCommonDrug(e.target.value)}
                  className="input-field"
                  style={{ flex: 1, minWidth: '220px' }}
                >
                  <option value="">Select a medicine</option>
                  {drugOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    if (!selectedCommonDrug) return;
                    const empty = medicines.findIndex(x => !x.trim());
                    if (empty !== -1) updateMedicine(empty, selectedCommonDrug);
                    else setMedicines(prev => [...prev, selectedCommonDrug]);
                    setSelectedCommonDrug('');
                  }}
                  disabled={!selectedCommonDrug}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="flex-col" style={{ gap: '0.7rem', marginBottom: '1rem' }}>
              {medicines.map((m, i) => (
                <div key={i} className="chat-input-row" style={{ alignItems: 'center' }}>
                  <div className="avatar-circle" style={{ width: '24px', height: '24px', fontSize: '0.75rem', flexShrink: 0 }}>{i + 1}</div>
                  <input
                    value={m}
                    onChange={(e) => updateMedicine(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    placeholder={i === medicines.length - 1 ? DRUG_HINTS[hintIndex] : `Medicine ${i + 1}`}
                    className="input-field"
                    onFocus={cycleHint}
                  />
                  <button
                    type="button"
                    onClick={() => addField()}
                    className="btn btn--ghost"
                    style={{ minWidth: 'auto', padding: '0.5rem 0.7rem', borderRadius: '0.8rem', fontSize: '0.9rem' }}
                  >
                    +
                  </button>
                  {medicines.length > 2 && (
                    <button onClick={() => removeField(i)} className="btn btn--sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'none', padding: '0.5rem 0.7rem', borderRadius: '0.6rem' }}>×</button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={addField} className="btn btn--ghost" style={{ width: '100%', padding: '0.7rem', border: '2px dashed rgba(36,84,128,0.2)', marginBottom: '1rem' }}>
              + Add Another Medicine
            </button>
            {error && (
              <div className="alert alert--error" style={{ marginBottom: '1rem' }}>{error}</div>
            )}

            <div className="chat-input-row">
              <button onClick={handleCheck} disabled={loading} className="btn btn--primary btn--lg" style={{ flex: 1 }}>
                {loading ? '🔍 Checking...' : '🔍 Check Interactions'}
              </button>
              {checked && (
                <button onClick={handleReset} className="btn btn--ghost btn--lg">Reset</button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Results */}
        {checked && results && (
          <div className="page-stack">
            <div className="three-col-grid" style={{ gap: '0.7rem' }}>
              {[
                { label: 'Safe', count: summary.safe, ...levelStyle['Safe'] },
                { label: 'Moderate', count: summary.moderate, ...levelStyle['Moderate'] },
                { label: 'High Risk', count: summary.high, ...levelStyle['High Risk'] },
                { label: 'No Data', count: summary.insufficient, ...levelStyle['Insufficient Data'] },
              ].map(s => (
                <div key={s.label} className="stat-summary" style={{ background: s.bg, border: `1.5px solid ${s.color}20`, padding: '0.9rem' }}>
                  <div className="stat-summary__value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.count}</div>
                  <div className="stat-summary__label" style={{ color: s.color, fontSize: '0.82rem' }}>{s.label}</div>
                </div>
              ))}
            </div>

            <SectionCard title="Interaction Results">
              {results.length === 0 ? (
                <div className="empty-state" style={{ padding: '1.5rem' }}>
                  <div className="empty-state__icon">✅</div>
                  <div className="empty-state__title">No interaction results returned</div>
                  <div className="empty-state__desc">Keep your medication list and dosage details available for your pharmacist.</div>
                </div>
              ) : <div className="flex-col" style={{ gap: '1rem' }}>
                {results.map((r, i) => {
                  const s = levelStyle[r.level] || levelStyle['Safe'];
                  return (
                    <div key={i} className="highlight-card" style={{ padding: '1.2rem', background: s.bg, border: `1.5px solid ${s.color}25` }}>
                      <div className="flex-between" style={{ marginBottom: '0.6rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                          {r.drug1} <span style={{ color: '#8da2b8' }}>+</span> {r.drug2}
                        </div>
                        <span className="pill" style={{ background: s.badge, color: s.color, fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}>
                          {s.icon} {r.level}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#365067', marginBottom: r.alt ? '0.6rem' : 0, lineHeight: 1.6 }}>{r.desc}</div>
                      {r.alt && (
                        <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '0.7rem', background: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 700, color: '#0d5ad0' }}>💡 Alternative:</span>
                          <span style={{ color: '#365067' }}>{r.alt}</span>
                        </div>
                      )}
                      {(r.evidence_source && r.evidence_source !== 'none') && (
                        <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                          Source: {r.evidence_source.replace(/_/g, ' ')}
                        </div>
                      )}
                      {r.ai_estimate && (
                        <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: '0.7rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: '0.82rem', color: '#92400e' }}>
                          <span style={{ fontWeight: 700 }}>🤖 AI estimate:</span> {r.ai_estimate.prediction} risk ({Math.round((r.ai_estimate.confidence || 0) * 100)}% model confidence)
                          <span style={{ marginLeft: '0.4rem', opacity: 0.8 }}>— not clinically verified</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
              <div className="highlight-card highlight-card--warning" style={{ fontSize: '0.82rem', marginTop: '1rem' }}>
                ⚠️ Always consult your pharmacist or doctor before changing medications.
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

export default DrugInteractionChecker;
