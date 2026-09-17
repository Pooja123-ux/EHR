import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import { api } from '../../services/api';

const FALLBACK = (
  'The AI assistant is currently unavailable. ' +
  'Please ensure Ollama is running locally with llama3.2 model, ' +
  'or consult clinical references directly.'
);

function DoctorAiAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hello, Doctor. I'm your clinical AI assistant powered by a local LLM. Ask me about drug interactions, dosages, differential diagnoses, or treatment guidelines.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || loading) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const data = await api.doctorAiChat(question);
      const reply = data?.response || FALLBACK;
      setMessages((prev) => [...prev, { role: 'ai', text: reply, offline: !data?.response }]);
    } catch (err) {
      setError(err.message || 'Request failed');
      setMessages((prev) => [...prev, { role: 'ai', text: FALLBACK, offline: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Doctor Portal"
        title="AI Clinical Assistant"
        subtitle="Evidence-based clinical decision support powered by a local LLM."
      />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <SectionCard title="Chat">
          <div style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
            {/* Message list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', paddingRight: '0.25rem' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%',
                    padding: '0.85rem 1.1rem',
                    borderRadius: '1.2rem',
                    backgroundColor: m.role === 'user'
                      ? 'rgba(19,117,255,0.1)'
                      : m.offline
                        ? 'rgba(239,68,68,0.07)'
                        : 'rgba(16,185,129,0.08)',
                    color: m.role === 'user' ? '#1375ff' : m.offline ? '#b91c1c' : '#065f46',
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.role === 'ai' && (
                      <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: m.offline ? '#dc2626' : '#047857' }}>
                        {m.offline ? '⚠️ Offline' : '🤖 AI Assistant'}
                      </span>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '0.85rem 1.1rem', borderRadius: '1.2rem', backgroundColor: 'rgba(16,185,129,0.08)', color: '#047857', fontSize: '0.9rem' }}>
                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem' }}>🤖 AI Assistant</span>
                    Thinking…
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {error && (
              <p style={{ fontSize: '0.82rem', color: '#dc2626', marginBottom: '0.5rem' }}>
                ⚠️ {error}
              </p>
            )}

            {/* Input row */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask a clinical question…"
                disabled={loading}
                style={{
                  flex: 1, padding: '0.9rem 1rem', borderRadius: '1rem',
                  border: '2px solid rgba(36,84,128,0.12)', fontSize: '1rem',
                  opacity: loading ? 0.6 : 1,
                }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                style={{
                  padding: '0.9rem 1.5rem', borderRadius: '1rem', border: 'none',
                  background: 'linear-gradient(135deg,#1375ff,#00a7c7)',
                  color: '#fff', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading || !input.trim() ? 0.55 : 1,
                }}
              >
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default DoctorAiAssistant;
