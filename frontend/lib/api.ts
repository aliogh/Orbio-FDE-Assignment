import type {
  ChatHistoryTurn,
  ChatResponse,
  VoiceSessionResponse,
} from "./types";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function postChat(args: {
  message: string;
  conversationId?: string;
  history: ChatHistoryTurn[];
}): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      conversation_id: args.conversationId,
      history: args.history,
    }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  return res.json();
}

export async function postChatNudge(args: {
  conversationId: string;
  history: ChatHistoryTurn[];
  nudgeCount: 1 | 2;
}): Promise<{ assistant_message: string; nudge_count: number }> {
  const res = await fetch(`${BACKEND}/api/chat/nudge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: args.conversationId,
      history: args.history,
      nudge_count: args.nudgeCount,
    }),
  });
  if (!res.ok) throw new Error(`nudge failed: ${res.status}`);
  return res.json();
}

export async function createVoiceSession(): Promise<VoiceSessionResponse> {
  const res = await fetch(`${BACKEND}/api/voice/session`, { method: "POST" });
  if (!res.ok) throw new Error(`voice session failed: ${res.status}`);
  return res.json();
}

export async function dispatchVoiceTool(args: {
  conversationId: string;
  name: string;
  args: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${BACKEND}/api/voice/tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: args.conversationId,
      name: args.name,
      args: args.args,
    }),
  });
  if (!res.ok) return { ok: false, error: `tool dispatch failed: ${res.status}` };
  return res.json();
}

export async function endVoiceSession(conversationId: string): Promise<void> {
  await fetch(`${BACKEND}/api/voice/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {
    /* best-effort */
  });
}
