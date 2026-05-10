"use client";

import { useEffect, useRef, useState } from "react";
import { postChat } from "@/lib/api";
import type { ChatHistoryTurn } from "@/lib/types";

export default function ChatUI() {
  const [history, setHistory] = useState<ChatHistoryTurn[]>([
    {
      role: "assistant",
      content: "👋 ¡Hola! Soy el asistente de Grupo Sazón. ¿Cómo te llamas?",
    },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history]);

  async function send() {
    if (!input.trim() || busy || completed) return;
    const userTurn: ChatHistoryTurn = { role: "user", content: input.trim() };
    const next = [...history, userTurn];
    setHistory(next);
    setInput("");
    setBusy(true);
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

  return (
    <div className="flex flex-col h-[80vh] max-w-2xl mx-auto bg-white rounded-2xl shadow border border-stone-200">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
        {history.map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`px-4 py-2 rounded-2xl max-w-[85%] ${
                t.role === "user"
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-900"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-4 py-2 rounded-2xl bg-stone-100 text-stone-500 italic">
              ...
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-stone-200 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={
            completed
              ? "Conversación completada — ¡gracias!"
              : "Escribe tu respuesta..."
          }
          disabled={busy || completed}
          className="flex-1 px-4 py-2 border border-stone-300 rounded-full focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button
          onClick={send}
          disabled={busy || completed || !input.trim()}
          className="px-6 py-2 rounded-full bg-stone-900 text-white disabled:bg-stone-300"
        >
          Enviar
        </button>
      </div>
      {completed && (
        <div className="px-6 py-3 bg-emerald-50 text-emerald-800 text-sm border-t border-emerald-200">
          ✅ Pantalla de finalización: nuestro equipo se pondrá en contacto pronto.
        </div>
      )}
    </div>
  );
}
