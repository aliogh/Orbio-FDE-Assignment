"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { ConversationRow } from "@/lib/types";

type Filter = "all" | "qualified" | "disqualified" | "incomplete";

export default function CandidatesTable() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    (async () => {
      setLoading(true);
      let q = sb
        .from("conversations")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(200);
      if (filter === "qualified") q = q.eq("qualified", true);
      if (filter === "disqualified") q = q.eq("qualified", false);
      if (filter === "incomplete") q = q.is("qualified", null);
      const { data } = await q;
      setRows((data ?? []) as ConversationRow[]);
      setLoading(false);
    })();
  }, [filter]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="flex gap-2 p-3 border-b border-stone-200 text-sm">
        {(["all", "qualified", "disqualified", "incomplete"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full ${
              filter === f
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-700"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="p-8 text-center text-stone-400">Cargando...</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Ciudad</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Idioma</th>
              <th className="text-left px-4 py-2">Canal</th>
              <th className="text-left px-4 py-2">Inicio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-stone-100 hover:bg-stone-50 cursor-pointer"
              >
                <td className="px-4 py-2">
                  <Link href={`/recruiter/${r.id}`} className="block">
                    {r.candidate_name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {(r.extracted_fields as { city?: string }).city ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {r.qualified === true && (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      ✓ Calificado
                    </span>
                  )}
                  {r.qualified === false && (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">
                      ✗ {r.disqualification_reason}
                    </span>
                  )}
                  {r.qualified === null && (
                    <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                      {r.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{r.language ?? "—"}</td>
                <td className="px-4 py-2">{r.source}</td>
                <td className="px-4 py-2 text-stone-500">
                  {new Date(r.started_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
