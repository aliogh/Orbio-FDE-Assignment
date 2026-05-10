import type { TurnRow } from "@/lib/types";

export default function TranscriptView({ turns }: { turns: TurnRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6">
      <h2 className="font-semibold text-stone-900 mb-4">Transcripción</h2>
      <div className="space-y-3">
        {turns.map((t) => (
          <div key={t.id} className="text-sm">
            <div className="text-xs text-stone-400 mb-1">
              {t.role} · {new Date(t.created_at).toLocaleTimeString()}
            </div>
            {t.content && (
              <div
                className={
                  t.role === "user"
                    ? "text-stone-900"
                    : t.role === "assistant"
                    ? "text-stone-700"
                    : "text-stone-400 italic"
                }
              >
                {t.content}
              </div>
            )}
            {Boolean(t.tool_calls) && (
              <pre className="mt-1 text-xs bg-stone-50 rounded p-2 overflow-x-auto text-stone-500">
                {JSON.stringify(t.tool_calls, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
