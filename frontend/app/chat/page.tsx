import ChatUI from "@/components/ChatUI";

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-stone-50 py-12 px-4">
      <h1 className="text-2xl font-bold text-center mb-8 text-stone-900">
        Grupo Sazón — Entrevista por chat
      </h1>
      <ChatUI />
    </main>
  );
}
