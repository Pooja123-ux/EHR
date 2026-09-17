import { useState, useEffect } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const riskStyle = {
  LOW:    { bg: 'rgba(16,185,129,0.1)',  color: '#047857', border: '#10b981' },
  MEDIUM: { bg: 'rgba(245,158,11,0.1)', color: '#d97706', border: '#f59e0b' },
  HIGH:   { bg: 'rgba(239,68,68,0.1)',  color: '#dc2626', border: '#ef4444' },
};

function DiseasePrediction() {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDiseasePredictions()
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const parseSymptoms = () =>
    text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const handlePredict = async () => {
    const symptoms = parseSymptoms();
    if (symptoms.length === 0) {
      setError('Please enter at least one symptom.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await api.predictDisease(symptoms);
      const sorted = [...data].sort((a, b) => parseFloat(b.probability) - parseFloat(a.probability));
      const risk = sorted[0]?.risk_level || 'LOW';
      setResults({
        diseases: sorted.slice(0, 3).map((p) => ({ name: p.predicted_disease, prob: parseFloat(p.probability) })),
        risk,
        recommendation: sorted[0]?.recommendation || '',
        symptomCount: symptoms.length,
        symptoms,
      });
      setHistory((previous) => [...data, ...previous].slice(0, 20));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => { setText(''); setResults(null); setError(''); };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Disease Risk Prediction"
        title="Check Possible Conditions"
        subtitle="Enter your symptoms for risk-based condition analysis."
      />
      <div className={`two-col-grid`} style={{ gap: '1.4rem', justifyContent: 'center', gridTemplateColumns: results ? '1fr 1fr' : '600px' }}>

        {/* Input Panel */}
        <div className="page-stack">
          <SectionCard title="🩺 Enter Your Symptoms">
            <div className="chat-input-row" style={{ marginBottom: '1rem' }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handlePredict())}
                placeholder="Enter symptoms separated by commas"
                className="input-field"
              />
              <button onClick={handlePredict} className="btn btn--secondary">Predict</button>
            </div>

            {!text.trim() && (
              <div className="empty-state" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                <div className="empty-state__desc">Add at least one symptom to get a prediction</div>
              </div>
            )}

            {error && (
              <div className="alert alert--error" style={{ marginBottom: '1rem' }}>{error}</div>
            )}

            <div className="chat-input-row">
              <button
                onClick={handlePredict}
                disabled={parseSymptoms().length === 0 || loading}
                className="btn btn--primary btn--lg"
                style={{ flex: 1 }}
              >
                {loading ? '🔍 Analyzing...' : '🔍 Predict Conditions'}
              </button>
              {results && (
                <button onClick={handleReset} className="btn btn--ghost btn--lg">Reset</button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Results Panel */}
        {results && (
          <div className="page-stack">
            <SectionCard title="🎯 Prediction Results">
              <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '1rem', padding: '1rem', borderRadius: '1rem', background: riskStyle[results.risk].bg, border: `2px solid ${riskStyle[results.risk].border}20`, marginBottom: '1.2rem' }}>
                <div style={{ fontSize: '2rem' }}>{results.risk === 'LOW' ? '🟢' : results.risk === 'MEDIUM' ? '🟡' : '🔴'}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: riskStyle[results.risk].color }}>Risk Level: {results.risk}</div>
                  <div style={{ fontSize: '0.85rem', color: '#5b7088' }}>Based on {results.symptomCount} symptom{results.symptomCount > 1 ? 's' : ''}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {results.diseases.map((d, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700 }}>{d.name}</span>
                      <span style={{ fontWeight: 800, color: i === 0 ? riskStyle[results.risk].color : '#5b7088' }}>{d.prob}%</span>
                    </div>
                    <div style={{ height: '10px', borderRadius: '999px', background: 'rgba(19,117,255,0.1)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${d.prob}%`, background: i === 0 ? `linear-gradient(90deg, ${riskStyle[results.risk].border}, ${riskStyle[results.risk].color})` : 'linear-gradient(90deg, #94a3b8, #64748b)', borderRadius: '999px', transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="💡 Recommendations">
              <div className="flex-col flex-gap--sm">
                {results.recommendation.split('. ').filter(Boolean).map((r, i) => (
                  <div key={i} className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.7rem', padding: '0.75rem 1rem', borderRadius: '0.8rem', background: riskStyle[results.risk].bg, borderLeft: `3px solid ${riskStyle[results.risk].border}` }}>
                    <span style={{ fontWeight: 800, color: riskStyle[results.risk].color }}>{i + 1}.</span>
                    <span style={{ fontWeight: 600, color: '#365067' }}>{r}.</span>
                  </div>
                ))}
              </div>
              <div className="highlight-card highlight-card--warning" style={{ fontSize: '0.82rem', marginTop: '1rem' }}>
                ⚠️ This is an AI-based prediction tool. Always consult a qualified doctor for diagnosis.
              </div>
            </SectionCard>

            <SectionCard title="Recent Predictions">
              <div style={{ color: '#5b7088', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
                Saved predictions are shown for reference and are not a diagnosis.
              </div>
              {historyLoading ? (
                <div style={{ color: '#5b7088' }}>Loading history...</div>
              ) : history.length === 0 ? (
                <div style={{ color: '#5b7088' }}>No previous predictions.</div>
              ) : (
                <div className="flex-col" style={{ gap: '0.6rem' }}>
                  {history.slice(0, 6).map((item) => {
                    const style = riskStyle[item.risk_level] || riskStyle.LOW;
                    return (
                      <div key={item.prediction_id} style={{ padding: '0.7rem 0.85rem', borderRadius: '0.7rem', background: style.bg, borderLeft: `3px solid ${style.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                          <strong>{item.predicted_disease}</strong>
                          <span style={{ color: style.color, fontWeight: 700 }}>{item.probability}%</span>
                        </div>
                        <div style={{ color: '#5b7088', fontSize: '0.78rem', marginTop: '0.25rem' }}>
                          {item.symptoms || 'Symptoms not recorded'}{item.prediction_date ? ` · ${new Date(item.prediction_date).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

export default DiseasePrediction;
