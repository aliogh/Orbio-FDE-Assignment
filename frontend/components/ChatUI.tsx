"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postChat, postChatNudge } from "@/lib/api";
import type { ChatHistoryTurn } from "@/lib/types";

const SESSION_ID = "4F2A";
const IDLE_NUDGE_MS = 30_000;
const MAX_NUDGES = 2;

function AgentAvatar({ size = 38 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        background: "var(--bg-ink)",
        color: "var(--ink-invert)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        fontSize: size > 30 ? 18 : 13,
        boxShadow:
          size > 30
            ? "inset 0 0 0 2px oklch(0.72 0.22 138), 0 0 0 4px oklch(0.72 0.22 138 / 0.18)"
            : "inset 0 0 0 2px oklch(0.72 0.22 138)",
      }}
    >
      S
    </div>
  );
}

function Bubble({
  turn,
  appearDelay,
}: {
  turn: ChatHistoryTurn;
  appearDelay: number;
}) {
  const isUser = turn.role === "user";
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), appearDelay);
    return () => clearTimeout(t);
  }, [appearDelay]);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 8,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(6px)",
        transition: "all 0.32s cubic-bezier(.2,.7,.3,1)",
      }}
    >
      {!isUser && <AgentAvatar size={26} />}
      <div
        style={{
          maxWidth: "72%",
          padding: "11px 15px 10px",
          borderRadius: isUser ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
          background: isUser ? "var(--bg-ink)" : "var(--bg-cream)",
          color: isUser ? "var(--ink-invert)" : "var(--ink)",
          fontSize: 14,
          lineHeight: 1.45,
          border: isUser ? "none" : "1px solid var(--line)",
          whiteSpace: "pre-wrap",
        }}
      >
        {turn.content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <AgentAvatar size={26} />
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "20px 20px 20px 6px",
          background: "var(--bg-cream)",
          border: "1px solid var(--line)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        aria-label="El asistente está escribiendo"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "var(--ink-muted)",
              display: "inline-block",
              animation: `orbioDot 1.1s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatUI() {
  const [history, setHistory] = useState<ChatHistoryTurn[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy el asistente de Grupo Sazón. ¿Cómo te llamas?",
    },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Nudge state lives in refs so the idle effect can read the latest values
  // without re-subscribing every time they change. nudgeCount resets to 0
  // whenever the candidate sends a turn (they're engaged again).
  const nudgeCountRef = useRef(0);
  const historyRef = useRef(history);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history, busy]);

  // Idle re-engagement: 60s after the agent's last reply (and reset on every
  // keystroke), POST /api/chat/nudge to have the agent check in. Capped at
  // MAX_NUDGES; after that the 5-min sweep handles abandonment.
  useEffect(() => {
    if (busy || completed || !conversationId) return;
    if (nudgeCountRef.current >= MAX_NUDGES) return;
    const t = setTimeout(async () => {
      const nextCount = (nudgeCountRef.current + 1) as 1 | 2;
      try {
        const res = await postChatNudge({
          conversationId,
          history: historyRef.current,
          nudgeCount: nextCount,
        });
        nudgeCountRef.current = nextCount;
        setHistory((prev) => [
          ...prev,
          { role: "assistant", content: res.assistant_message },
        ]);
      } catch {
        /* best-effort — silent on nudge failure */
      }
    }, IDLE_NUDGE_MS);
    return () => clearTimeout(t);
  }, [history, busy, completed, conversationId, input]);

  async function send() {
    if (!input.trim() || busy || completed) return;
    const userTurn: ChatHistoryTurn = { role: "user", content: input.trim() };
    const next = [...history, userTurn];
    setHistory(next);
    setInput("");
    setBusy(true);
    nudgeCountRef.current = 0;  // user re-engaged → reset the counter
    try {
      const res = await postChat({
        message: userTurn.content,
        conversationId,
        history,
      });
      setConversationId(res.conversation_id);
      setHistory([...next, { role: "assistant", content: res.assistant_message }]);
      setCompleted(res.completed);
    } catch {
      setHistory([
        ...next,
        {
          role: "assistant",
          content: "Lo siento, hubo un error de conexión. Intenta de nuevo.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const canSend = input.trim().length > 0 && !busy && !completed;

  return (
    <main
      className="ds-base"
      style={{
        flex: 1,
        background: "var(--bg-cream)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}
    >
      {/* App header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/"
            aria-label="Volver al inicio"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-muted)",
              textDecoration: "none",
              padding: "4px 8px",
              borderRadius: "var(--r-full)",
              border: "1px solid var(--line)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            ← Inicio
          </Link>
          <span className="orbio-mark" style={{ fontSize: 18 }}>
            Orbio
          </span>
          <span
            style={{
              color: "var(--ink-soft)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            /
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-muted)",
              letterSpacing: "0.05em",
            }}
          >
            chat · sazón
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-soft)",
            letterSpacing: "0.06em",
          }}
        >
          SESSION {SESSION_ID}
        </span>
      </div>

      {/* Chat surface */}
      <div
        style={{
          flex: 1,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          background: "var(--bg-paper)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-card)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Agent strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <AgentAvatar />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
              Sazón Hiring Bot
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--ink-muted)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--moss)",
                  borderRadius: 999,
                }}
              />
              {completed ? "completado" : "activo · responde en ~2s"}
            </div>
          </div>
          <span className="ds-eyebrow">ES-MX</span>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 18px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              alignSelf: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--ink-soft)",
              padding: "6px 0",
            }}
          >
            HOY
          </div>

          {history.map((turn, i) => (
            <Bubble key={i} turn={turn} appearDelay={Math.min(i, 4) * 60} />
          ))}

          {busy && <TypingBubble />}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: "1px solid var(--line)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-paper)",
          }}
        >
          <div
            style={{
              flex: 1,
              background: "var(--bg-cream)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                completed
                  ? "Conversación completada — ¡gracias!"
                  : "Escribe tu respuesta..."
              }
              disabled={busy || completed}
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: "none",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                padding: "6px 0",
                color: "var(--ink)",
              }}
            />
          </div>
          <button
            onClick={send}
            disabled={!canSend}
            aria-label="Enviar"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: 0,
              background: canSend ? "var(--bg-ink)" : "var(--ink-soft)",
              color: "var(--ink-invert)",
              cursor: canSend ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7h9M7 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {completed && (
          <div
            style={{
              padding: "12px 18px",
              background: "var(--moss-soft)",
              color: "var(--moss)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              borderTop: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "var(--moss)",
                borderRadius: 999,
              }}
            />
            Pantalla de finalización — nuestro equipo se pondrá en contacto pronto.
          </div>
        )}
      </div>
    </main>
  );
}
