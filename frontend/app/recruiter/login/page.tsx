"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RecruiterLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/recruiter/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      router.replace("/recruiter");
    } else {
      setErr("Contraseña incorrecta.");
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow border border-stone-200 p-8 max-w-sm w-full"
      >
        <h1 className="text-xl font-bold text-stone-900 mb-2">Acceso reclutadores</h1>
        <p className="text-sm text-stone-500 mb-6">Introduce la contraseña compartida.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Contraseña"
          className="w-full px-4 py-2 border border-stone-300 rounded-lg mb-3"
        />
        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-lg bg-stone-900 text-white"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
