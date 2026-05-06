/**
 * Chat.jsx — Interfaz conversacional con el agente LangGraph.
 * Restyled to match the dark design system.
 */

import { useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Send } from 'lucide-react';

import { sendMessage } from '../api/client.js';
import { useAppContext } from '../context/AppContext.jsx';

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-end' }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--primary-soft)', border: '1px solid var(--border)',
          display: 'grid', placeItems: 'center', color: 'var(--primary)',
        }}>
          <BotMessageSquare size={14} />
        </div>
      )}
      <div style={{
        maxWidth: '70%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        fontSize: 14,
        lineHeight: 1.55,
        wordBreak: 'break-word',
        ...(isUser
          ? { background: 'var(--primary-2)', color: '#fff' }
          : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }),
      }}>
        {text.split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'var(--primary-soft)', border: '1px solid var(--border)',
        display: 'grid', placeItems: 'center', color: 'var(--primary)',
      }}>
        <BotMessageSquare size={14} />
      </div>
      <div style={{
        padding: '10px 14px',
        borderRadius: '16px 16px 16px 4px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-dim)',
        fontSize: 14,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>El asesor está pensando</span>
        <span style={{ display: 'inline-flex', gap: 3, fontSize: '1.1rem', color: 'var(--text-mute)' }}>
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat page
// ---------------------------------------------------------------------------

export default function Chat() {
  const { chatHistory, setChatHistory } = useAppContext();
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  const addMsg = (role, text) => setChatHistory(prev => [...prev, { role, text }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addMsg('user', text);
    setLoading(true);
    try {
      const data = await sendMessage(text);
      addMsg('agent', data.reply);
    } catch (err) {
      addMsg('agent', `⚠ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Page header */}
      <div className="topbar" style={{ marginBottom: 0, paddingBottom: 20, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BotMessageSquare size={26} /> Asesor IA
          </h1>
          <div className="page-sub">Pregúntame sobre tu presupuesto, gastos o finanzas</div>
        </div>
      </div>

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 0',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {chatHistory.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} text={msg.text} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 10,
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta… (Enter para enviar)"
          disabled={loading}
          rows={2}
          className="input"
          style={{
            flex: 1, resize: 'none',
            ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="btn primary"
          style={{
            padding: '11px 16px', flexShrink: 0,
            ...(loading || !input.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
