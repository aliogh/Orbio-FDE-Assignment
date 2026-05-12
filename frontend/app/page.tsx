import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-8">
      <div className="max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-stone-900 mb-2">
          Grupo Sazón
        </h1>
        <p className="text-stone-600 mb-10">
          Proceso de selección para repartidores. Hiring delivery drivers.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <Link
            href="/chat"
            className="rounded-2xl border border-stone-200 bg-white p-6 hover:shadow-md transition"
          >
            <div className="text-2xl mb-2">💬</div>
            <div className="font-semibold text-stone-900">Chat</div>
            <div className="text-sm text-stone-500">Aplica por mensaje.</div>
          </Link>
          <Link
            href="/voice"
            className="rounded-2xl border border-stone-200 bg-white p-6 hover:shadow-md transition"
          >
            <div className="text-2xl mb-2">🎙️</div>
            <div className="font-semibold text-stone-900">Voz</div>
            <div className="text-sm text-stone-500">Aplica con tu voz.</div>
          </Link>
          <Link
            href="/recruiter"
            className="rounded-2xl border border-stone-200 bg-white p-6 hover:shadow-md transition"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold text-stone-900">Reclutadores</div>
            <div className="text-sm text-stone-500">Panel de candidatos.</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
