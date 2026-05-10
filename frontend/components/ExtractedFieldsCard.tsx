import type { ConversationRow } from "@/lib/types";

const LABELS: Record<string, string> = {
  full_name: "Nombre completo",
  has_driver_license: "Licencia de conducir",
  city: "Ciudad",
  availability: "Disponibilidad",
  preferred_schedule: "Horario preferido",
  prior_experience: "Experiencia previa",
  start_date: "Fecha de inicio",
};

export default function ExtractedFieldsCard({
  conversation,
}: {
  conversation: ConversationRow;
}) {
  const fields = conversation.extracted_fields as Record<string, unknown>;
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6">
      <h2 className="font-semibold text-stone-900 mb-4">Datos recopilados</h2>
      <dl className="space-y-3 text-sm">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k}>
            <dt className="text-stone-500">{label}</dt>
            <dd className="text-stone-900 font-medium">
              {fields[k] === undefined || fields[k] === null
                ? "—"
                : typeof fields[k] === "boolean"
                ? (fields[k] ? "Sí" : "No")
                : String(fields[k])}
            </dd>
          </div>
        ))}
      </dl>
      {conversation.summary && (
        <div className="mt-6 pt-4 border-t border-stone-100">
          <div className="text-stone-500 text-sm mb-1">Resumen</div>
          <p className="text-stone-900 text-sm">{conversation.summary}</p>
        </div>
      )}
    </div>
  );
}
