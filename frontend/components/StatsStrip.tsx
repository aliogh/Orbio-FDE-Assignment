"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Stats {
  total: number;
  qualified: number;
  qualifiedRate: number;
  abandoned: number;
}

export default function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    (async () => {
      const { data } = await sb
        .from("conversations")
        .select("qualified, status");
      const rows = data ?? [];
      const total = rows.length;
      const qualified = rows.filter((r) => r.qualified === true).length;
      const abandoned = rows.filter((r) => r.status === "abandoned").length;
      setStats({
        total,
        qualified,
        qualifiedRate: total ? qualified / total : 0,
        abandoned,
      });
    })();
  }, []);

  if (!stats) return <div className="h-20 animate-pulse bg-stone-100 rounded-xl" />;

  const cells = [
    { label: "Total candidatos", value: stats.total },
    { label: "Calificados", value: stats.qualified },
    { label: "Tasa de calificación", value: `${(stats.qualifiedRate * 100).toFixed(0)}%` },
    { label: "Abandonados", value: stats.abandoned },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cells.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="text-xs text-stone-500">{c.label}</div>
          <div className="text-2xl font-bold text-stone-900">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
