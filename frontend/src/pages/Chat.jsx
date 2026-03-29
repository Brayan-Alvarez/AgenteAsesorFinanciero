/**
 * Chat.jsx — Conversational interface connected to the LangGraph financial agent.
 *
 * Layout:
 *   ┌─────────────────────────────┐
 *   │  header                     │
 *   ├─────────────────────────────┤
 *   │  message list (scrollable)  │
 *   ├─────────────────────────────┤
 *   │  input + send button        │
 *   └─────────────────────────────┘
 *
 * Each turn is stored as { role: "user" | "agent", text: string }.
 * The agent's greeting is pre-loaded so the user always sees a first message.
 */

import { useEffect, useRef, useState } from "react";

import { sendMessage } from "../api/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GREETING = "¡Hola! Soy tu asesor financiero personal. ¿En qué te puedo ayudar hoy?";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single chat bubble.
 *
 * @param {{ role: "user"|"agent", text: string }} props
 */
function MessageBubble({ role, text }) {
  const isUser = role === "user";
  return (
    <div style={{ ...styles.bubbleRow, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {/* Avatar — only shown for agent messages */}
      {!isUser && (
        <div style={styles.avatar} aria-hidden="true">
          🤖
        </div>
      )}

      <div
        style={{
          ...styles.bubble,
          ...(isUser ? styles.bubbleUser : styles.bubbleAgent),
        }}
      >
        {/* Render line-breaks from the agent's markdown-like responses */}
        {text.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i < text.split("\n").length - 1 && <br />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Animated "agent is thinking" indicator shown while awaiting a response. */
function TypingIndicator() {
  return (
    <div style={{ ...styles.bubbleRow, justifyContent: "flex-start" }}>
      <div style={styles.avatar} aria-hidden="true">🤖</div>
      <div style={{ ...styles.bubble, ...styles.bubbleAgent, ...styles.typingBubble }}>
        <span style={styles.typingText}>El asesor está pensando</span>
        <span style={styles.dots}>
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Chat component
// ---------------------------------------------------------------------------

export default function Chat() {
  // Conversation history: array of { role, text } objects.
  const [messages, setMessages] = useState([
    { role: "agent", text: GREETING },
  ]);

  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Ref attached to a sentinel div at the bottom of the message list so we
  // can call scrollIntoView() whenever new messages arrive.
  const bottomRef = useRef(null);

  // Auto-scroll to the latest message every time the messages array or the
  // loading state changes (loading adds/removes the typing indicator).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /** Append a message object to the conversation history. */
  const addMessage = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  /** Handle form submission (button click or Enter key). */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    addMessage("user", text);
    setLoading(true);

    try {
      const data = await sendMessage(text);
      addMessage("agent", data.reply);
    } catch (err) {
      setError(err.message);
      // Also surface the error as an agent message so it appears in-context.
      addMessage("agent", `⚠ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** Allow sending with the Enter key; Shift+Enter inserts a newline. */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>💬</span>
        <div>
          <h1 style={styles.headerTitle}>Asesor Financiero</h1>
          <p style={styles.headerSubtitle}>Pregúntame sobre tu presupuesto o gastos</p>
        </div>
      </div>

      {/* Message list */}
      <div style={styles.messageList}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} text={msg.text} />
        ))}

        {/* Typing indicator while waiting for the agent */}
        {loading && <TypingIndicator />}

        {/* Invisible sentinel — always scrolled into view */}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={styles.inputArea}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta aquí… (Enter para enviar)"
          disabled={loading}
          rows={2}
          style={{
            ...styles.textarea,
            ...(loading ? styles.textareaDisabled : {}),
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendButton,
            ...(loading || !input.trim() ? styles.sendButtonDisabled : {}),
          }}
          aria-label="Enviar mensaje"
        >
          {loading ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    backgroundColor: "#f9fafb",
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 24px",
    backgroundColor: "#fff",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: "2rem",
  },
  headerTitle: {
    margin: 0,
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "#111827",
  },
  headerSubtitle: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#6b7280",
  },

  // Message list
  messageList: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  bubbleRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  },
  avatar: {
    fontSize: "1.4rem",
    flexShrink: 0,
    lineHeight: 1,
    marginBottom: "2px",
  },
  bubble: {
    maxWidth: "70%",
    padding: "10px 14px",
    borderRadius: "16px",
    fontSize: "0.95rem",
    lineHeight: 1.55,
    wordBreak: "break-word",
  },
  bubbleUser: {
    backgroundColor: "#6366f1",
    color: "#fff",
    borderBottomRightRadius: "4px",
  },
  bubbleAgent: {
    backgroundColor: "#fff",
    color: "#111827",
    border: "1px solid #e5e7eb",
    borderBottomLeftRadius: "4px",
  },

  // Typing indicator
  typingBubble: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "10px 16px",
  },
  typingText: {
    color: "#6b7280",
    fontSize: "0.875rem",
    fontStyle: "italic",
  },
  dots: {
    display: "inline-flex",
    gap: "2px",
    color: "#9ca3af",
    fontSize: "1.2rem",
    lineHeight: 1,
    animation: "pulse 1.2s infinite",
  },

  // Input area
  inputArea: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    padding: "14px 24px",
    backgroundColor: "#fff",
    borderTop: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    resize: "none",
    padding: "10px 14px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
  },
  textareaDisabled: {
    backgroundColor: "#f3f4f6",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
  sendButton: {
    padding: "10px 20px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#6366f1",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background-color 0.15s",
  },
  sendButtonDisabled: {
    backgroundColor: "#c7d2fe",
    cursor: "not-allowed",
  },
};
