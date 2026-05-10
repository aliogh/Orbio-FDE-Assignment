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

export async function createVoiceSession(): Promise<VoiceSessionResponse> {
  const res = await fetch(`${BACKEND}/api/voice/session`, { method: "POST" });
  if (!res.ok) throw new Error(`voice session failed: ${res.status}`);
  return res.json();
}
