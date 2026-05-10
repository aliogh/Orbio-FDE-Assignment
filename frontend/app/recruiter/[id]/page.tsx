"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";
import ExtractedFieldsCard from "@/components/ExtractedFieldsCard";
import TranscriptView from "@/components/TranscriptView";
import type { ConversationRow, TurnRow } from "@/lib/types";

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [turns, setTurns] = useState<TurnRow[]>([]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    (async () => {
      const { data: cs } = await sb
        .from("conversations")
        .select("*")
        .eq("id", id)
        .limit(1);
      setConv(cs?.[0] ?? null);
      const { data: ts } = await sb
        .from("turns")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at");
      setTurns((ts ?? []) as TurnRow[]);
    })();
  }, [id]);

  function exportAtsJson() {
    if (!conv) return;
    const payload = {
      candidate: {
        full_name: conv.candidate_name,
        ...conv.extracted_fields,
      },
      qualified: conv.qualified,
      disqualification_reason: conv.disqualification_reason,
      summary: conv.summary,
      source: conv.source,
      started_at: conv.started_at,
      ended_at: conv.ended_at,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `candidate-${conv.id.slice(0, 8)}.json`;
    a.click();
  }

  if (!conv) return <div className="p-12 text-center text-stone-400">Cargando…</div>;

  return (
    <main className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <Link href="/recruiter" className="text-sm text-stone-500 hover:underline">
          ← Volver
        </Link>
        <div className="flex items-center justify-between mt-2 mb-6">
          <h1 className="text-2xl font-bold text-stone-900">
            {conv.candidate_name ?? "Candidato sin nombre"}
          </h1>
          <button
            onClick={exportAtsJson}
            className="px-4 py-2 rounded-full border border-stone-300 text-sm"
          >
            Exportar a ATS (mock)
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <ExtractedFieldsCard conversation={conv} />
          <TranscriptView turns={turns} />
        </div>
      </div>
    </main>
  );
}
