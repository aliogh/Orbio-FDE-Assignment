export type Role = "user" | "assistant";

export interface ChatHistoryTurn {
  role: Role;
  content: string;
}

export interface ChatResponse {
  conversation_id: string;
  assistant_message: string;
  tool_calls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  completed: boolean;
}

export interface VoiceSessionResponse {
  conversation_id: string;
  client_secret: string;
  model: string;
}

export interface ConversationRow {
  id: string;
  source: "chat" | "voice";
  language: string | null;
  candidate_name: string | null;
  qualified: boolean | null;
  disqualification_reason: string | null;
  extracted_fields: Record<string, unknown>;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
  status: "in_progress" | "completed" | "abandoned";
}

export interface TurnRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: unknown;
  created_at: string;
}
