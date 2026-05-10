import StatsStrip from "@/components/StatsStrip";
import CandidatesTable from "@/components/CandidatesTable";

export default function RecruiterDashboard() {
  return (
    <main className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Candidatos</h1>
        <p className="text-stone-500 mb-6">Panel de reclutadores — Grupo Sazón</p>
        <StatsStrip />
        <CandidatesTable />
      </div>
    </main>
  );
}
