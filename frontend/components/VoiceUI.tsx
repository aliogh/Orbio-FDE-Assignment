"use client";

import { useRef, useState } from "react";
import { createVoiceSession, dispatchVoiceTool, endVoiceSession } from "@/lib/api";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

export default function VoiceUI() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function start() {
    setPhase("connecting");
    setErrMsg(null);
    const sessionT0 = performance.now();
    try {
      const session = await createVoiceSession();
      setConversationId(session.conversation_id);
      conversationIdRef.current = session.conversation_id;
      // eslint-disable-next-line no-console
      console.log("[realtime] session minted", { model: session.model, cid: session.conversation_id });

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio (the agent's voice)
      pc.ontrack = (ev) => {
        if (audioRef.current) {
          audioRef.current.srcObject = ev.streams[0];
        }
      };

      // Local mic — enable browser DSP so the agent's playback doesn't echo back
      // into the mic (the #1 cause of VAD confusion when using laptop speakers).
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      // Data channel for control events (response.create etc.)
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        // Proactive first turn — tell the model to greet the candidate.
        // Without this, the model waits silently for user audio.
        dc.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions:
                "Saluda brevemente al candidato en español, preséntate como el asistente de selección de Grupo Sazón y pregúntale cómo se llama. Muy corto, una frase amable.",
            },
          }),
        );
      };
      dc.onmessage = (ev) => {
        // Diagnostics — log every realtime event with a relative timestamp so
        // we can spot dead air, missed VAD triggers, or duplicate responses
        // from the browser console (Cmd-Opt-J on Chrome).
        try {
          const evt = JSON.parse(ev.data);
          if (!evt.type) return;
          if (evt.type.endsWith(".delta")) return; // skip chatty per-token deltas
          const t = ((performance.now() - sessionT0) / 1000).toFixed(2);
          const summary: Record<string, unknown> = { type: evt.type, t };
          if (evt.transcript) summary.transcript = evt.transcript;
          if (evt.item?.role) summary.role = evt.item.role;
          if (evt.response?.status) summary.status = evt.response.status;
          if (evt.error) summary.error = evt.error;
          // eslint-disable-next-line no-console
          console.log("[realtime]", JSON.stringify(summary));

          // When the model fires a function call we (a) dispatch it through
          // the backend so persistence/validation mirror the chat path, (b)
          // send the real result back as a function_call_output, and (c)
          // trigger response.create so the model continues speaking.
          if (evt.type === "response.function_call_arguments.done") {
            const call_id = evt.call_id;
            const name = evt.name;
            // eslint-disable-next-line no-console
            console.log("[realtime] tool.call", { name, call_id });
            const parsedArgs = (() => {
              try {
                return JSON.parse(evt.arguments ?? "{}");
              } catch {
                return {};
              }
            })();
            (async () => {
              const cid = conversationIdRef.current;
              const result = cid
                ? await dispatchVoiceTool({ conversationId: cid, name, args: parsedArgs })
                : { ok: true, validation_error: null };
              // eslint-disable-next-line no-console
              console.log("[realtime] tool.result", { name, call_id, result });
              dc.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: JSON.stringify(result),
                  },
                }),
              );
              dc.send(JSON.stringify({ type: "response.create" }));
            })();
          }
        } catch {
          /* non-JSON frames — ignore */
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const res = await fetch(`${baseUrl}?model=${encodeURIComponent(session.model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.client_secret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
      if (!res.ok) throw new Error(`SDP exchange failed: ${res.status}`);
      const answer = { type: "answer" as const, sdp: await res.text() };
      await pc.setRemoteDescription(answer);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          setPhase("ended");
        }
      };

      setPhase("live");
    } catch (err) {
      console.error(err);
      setErrMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function stop() {
    const cid = conversationIdRef.current;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    setPhase("ended");
    // Best-effort: tell the backend the call ended so the conversation row
    // transitions out of `in_progress`. If complete_screening already fired
    // the backend will leave the row as `completed`.
    if (cid) {
      void endVoiceSession(cid);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow border border-stone-200 p-8 text-center">
      <div className="text-6xl mb-4">🎙️</div>
      <h2 className="text-xl font-bold text-stone-900 mb-2">Entrevista por voz</h2>
      <p className="text-sm text-stone-500 mb-6">
        Habla con el asistente de Grupo Sazón. El agente te hará algunas
        preguntas para ver si encajas en el puesto.
      </p>

      {phase === "idle" && (
        <button
          onClick={start}
          className="px-8 py-3 rounded-full bg-stone-900 text-white"
        >
          Empezar
        </button>
      )}
      {phase === "connecting" && (
        <p className="text-stone-500">Conectando...</p>
      )}
      {phase === "live" && (
        <>
          <p className="text-emerald-600 font-medium mb-4">● En vivo</p>
          <button
            onClick={stop}
            className="px-8 py-3 rounded-full border border-stone-300 text-stone-700"
          >
            Terminar
          </button>
        </>
      )}
      {phase === "ended" && <p className="text-stone-500">Llamada terminada.</p>}
      {phase === "error" && (
        <p className="text-red-600 text-sm">Error: {errMsg}</p>
      )}

      {conversationId && (
        <p className="mt-4 text-xs text-stone-400">ID: {conversationId}</p>
      )}

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
