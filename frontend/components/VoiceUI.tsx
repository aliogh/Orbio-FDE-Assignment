"use client";

import { useEffect, useRef, useState } from "react";
import { createVoiceSession, dispatchVoiceTool, endVoiceSession } from "@/lib/api";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
type Speaker = "agent" | "user" | null;

const BAR_COUNT = 42;
// Below this RMS (0..1 from analyser frequency bytes / 255) we treat the
// channel as silent. Set high enough that ambient noise / muted TTS doesn't
// flip the active-speaker state.
const SPEAKING_THRESHOLD = 0.06;
const AGENT_COLOR = "oklch(0.85 0.20 138)";
const USER_COLOR = "oklch(0.92 0.06 145)";

const iconBtnStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 999,
  background: "rgba(232,239,228,0.06)",
  border: "1px solid rgba(232,239,228,0.10)",
  color: "var(--ink-invert)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function WaveLane({
  who,
  label,
  sublabel,
  color,
  active,
  level,
  barsRef,
}: {
  who: "agent" | "user";
  label: string;
  sublabel: string;
  color: string;
  active: boolean;
  level: number;
  barsRef: React.RefObject<(HTMLSpanElement | null)[]>;
}) {
  // dB-style readout (decorative — derived from the level state).
  const db = level > 0.001
    ? Math.max(-60, 20 * Math.log10(level)).toFixed(0)
    : "−∞";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: active ? 1 : 0.55,
        transition: "opacity 0.4s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 130, flexShrink: 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: active ? color : "rgba(232,239,228,0.10)",
            color: active ? "var(--bg-ink)" : "var(--ink-invert)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 16,
            transition: "background 0.4s, color 0.4s, box-shadow 0.4s",
            boxShadow: active
              ? `0 0 0 4px ${color.replace(")", " / 0.18)")}`
              : "none",
          }}
        >
          {who === "agent" ? "S" : "T"}
        </div>
        <div style={{ lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.005em" }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              color: "rgba(232,239,228,0.5)",
            }}
          >
            {sublabel}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 3,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            style={{
              width: 4,
              height: 6,
              background: active ? color : "rgba(232,239,228,0.25)",
              borderRadius: 2,
              transition: "background 0.4s",
              transformOrigin: "center",
            }}
          />
        ))}
      </div>

      <div
        style={{
          width: 60,
          flexShrink: 0,
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: active ? color : "rgba(232,239,228,0.35)",
          transition: "color 0.4s",
        }}
      >
        {db === "−∞" ? "−∞ dB" : `${db} dB`}
      </div>
    </div>
  );
}

export default function VoiceUI() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker>(null);
  const [agentLevel, setAgentLevel] = useState(0);
  const [userLevel, setUserLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const conversationIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Audio analysis plumbing
  const audioCtxRef = useRef<AudioContext | null>(null);
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const userBufRef = useRef<Uint8Array | null>(null);
  const agentBufRef = useRef<Uint8Array | null>(null);
  const userMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);

  // Bar element refs — we mutate height directly to avoid 60fps React renders.
  const userBarsRef = useRef<(HTMLSpanElement | null)[]>(
    Array(BAR_COUNT).fill(null),
  );
  const agentBarsRef = useRef<(HTMLSpanElement | null)[]>(
    Array(BAR_COUNT).fill(null),
  );

  // Elapsed timer
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function mmss(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function attachAnalyser(stream: MediaStream, who: "agent" | "user") {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    if (who === "user") {
      userAnalyserRef.current = analyser;
      userBufRef.current = buf;
    } else {
      agentAnalyserRef.current = analyser;
      agentBufRef.current = buf;
    }
  }

  function startAnimation() {
    if (rafRef.current != null) return;
    let lastSpeaker: Speaker = null;
    let lastAgentLevel = 0;
    let lastUserLevel = 0;

    const tick = () => {
      const sample = (
        analyser: AnalyserNode | null,
        buf: Uint8Array | null,
        bars: (HTMLSpanElement | null)[],
        baseColor: string,
        isActive: boolean,
      ) => {
        if (!analyser || !buf) return 0;
        analyser.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
        // Map BAR_COUNT bars across the FFT bins.
        const binsPerBar = Math.max(1, Math.floor(buf.length / BAR_COUNT));
        let totalEnergy = 0;
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < binsPerBar; j++) {
            sum += buf[i * binsPerBar + j] ?? 0;
          }
          const avg = sum / binsPerBar / 255; // 0..1
          totalEnergy += avg;
          const el = bars[i];
          if (el) {
            // Idle baseline so the bars don't fully collapse — they "breathe".
            const base = isActive ? 6 : 4;
            const reactive = isActive ? avg * 50 : avg * 14;
            el.style.height = `${base + reactive}px`;
            el.style.background = isActive ? baseColor : "rgba(232,239,228,0.25)";
          }
        }
        return totalEnergy / BAR_COUNT;
      };

      const aLevel = sample(
        agentAnalyserRef.current,
        agentBufRef.current,
        agentBarsRef.current,
        AGENT_COLOR,
        lastSpeaker !== "user",
      );
      const uLevel = sample(
        userAnalyserRef.current,
        userBufRef.current,
        userBarsRef.current,
        USER_COLOR,
        lastSpeaker !== "agent",
      );

      // Decide active speaker — the louder of the two, if either is above
      // threshold. Sticky so we don't flicker on syllable gaps.
      const aSpeaking = aLevel > SPEAKING_THRESHOLD;
      const uSpeaking = uLevel > SPEAKING_THRESHOLD;
      let next: Speaker = lastSpeaker;
      if (aSpeaking && uSpeaking) {
        next = aLevel >= uLevel ? "agent" : "user";
      } else if (aSpeaking) {
        next = "agent";
      } else if (uSpeaking) {
        next = "user";
      }
      if (next !== lastSpeaker) {
        lastSpeaker = next;
        setActiveSpeaker(next);
      }

      // Throttle level state updates — only commit when the change is large
      // enough to matter for the dB readout (avoids per-frame React renders).
      if (Math.abs(aLevel - lastAgentLevel) > 0.02) {
        lastAgentLevel = aLevel;
        setAgentLevel(aLevel);
      }
      if (Math.abs(uLevel - lastUserLevel) > 0.02) {
        lastUserLevel = uLevel;
        setUserLevel(uLevel);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopAnimation() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAgentLevel(0);
    setUserLevel(0);
    setActiveSpeaker(null);
    [userBarsRef.current, agentBarsRef.current].forEach((bars) => {
      bars.forEach((el) => {
        if (el) el.style.height = "6px";
      });
    });
  }

  async function start() {
    setPhase("connecting");
    setErrMsg(null);
    setElapsed(0);
    const sessionT0 = performance.now();
    try {
      const session = await createVoiceSession();
      setConversationId(session.conversation_id);
      conversationIdRef.current = session.conversation_id;
      console.log("[realtime] session minted", {
        model: session.model,
        cid: session.conversation_id,
      });

      // Audio analysis context — lazily created on first call.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = audioCtxRef.current ?? new AudioCtx!();
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio (the agent's voice) — attach analyser when track lands.
      pc.ontrack = (ev) => {
        if (audioRef.current) {
          audioRef.current.srcObject = ev.streams[0];
        }
        attachAnalyser(ev.streams[0], "agent");
      };

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mic.getTracks().forEach((t) => {
        userMicTrackRef.current = t;
        pc.addTrack(t, mic);
      });
      attachAnalyser(mic, "user");
      startAnimation();

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
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
        try {
          const evt = JSON.parse(ev.data);
          if (!evt.type) return;
          if (evt.type.endsWith(".delta")) return;
          const t = ((performance.now() - sessionT0) / 1000).toFixed(2);
          const summary: Record<string, unknown> = { type: evt.type, t };
          if (evt.transcript) summary.transcript = evt.transcript;
          if (evt.item?.role) summary.role = evt.item.role;
          if (evt.response?.status) summary.status = evt.response.status;
          if (evt.error) summary.error = evt.error;
          console.log("[realtime]", JSON.stringify(summary));

          if (evt.type === "response.function_call_arguments.done") {
            const call_id = evt.call_id;
            const name = evt.name;
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
          stop();
        }
      };

      setPhase("live");
    } catch (err) {
      console.error(err);
      stopAnimation();
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
    userMicTrackRef.current = null;
    stopAnimation();
    setPhase("ended");
    if (cid) {
      void endVoiceSession(cid);
    }
  }

  function toggleMute() {
    const t = userMicTrackRef.current;
    if (!t) return;
    t.enabled = !t.enabled;
    setMuted(!t.enabled);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
      pcRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, []);

  const isLive = phase === "live";

  return (
    <main
      className="ds-base"
      style={{
        flex: 1,
        background: "var(--bg-ink)",
        color: "var(--ink-invert)",
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
      }}
    >
      {/* Soft glow corresponding to active speaker */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset:
            activeSpeaker === "agent"
              ? "auto auto -240px -240px"
              : activeSpeaker === "user"
                ? "-240px -240px auto auto"
                : "auto -240px -240px auto",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            activeSpeaker === "agent"
              ? "radial-gradient(circle, oklch(0.78 0.22 138 / 0.32) 0%, transparent 60%)"
              : activeSpeaker === "user"
                ? "radial-gradient(circle, oklch(0.88 0.12 145 / 0.22) 0%, transparent 60%)"
                : "radial-gradient(circle, oklch(0.78 0.22 138 / 0.10) 0%, transparent 60%)",
          filter: "blur(20px)",
          transition: "inset 1.2s ease, background 1.2s ease",
          pointerEvents: "none",
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="orbio-mark" style={{ color: "var(--ink-invert)" }}>
            Orbio
          </span>
          <span
            style={{
              color: "rgba(232,239,228,0.4)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            /
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "rgba(232,239,228,0.6)",
              letterSpacing: "0.05em",
            }}
          >
            voice · sazón
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {isLive && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "oklch(0.78 0.12 145)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  background: "oklch(0.78 0.12 145)",
                  borderRadius: 999,
                  boxShadow: "0 0 0 4px oklch(0.78 0.12 145 / 0.15)",
                }}
              />
              LIVE
            </span>
          )}
          {(isLive || phase === "ended") && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "rgba(232,239,228,0.7)",
              }}
            >
              {mmss(elapsed)}
            </span>
          )}
        </div>
      </div>

      {/* Center stack */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          className="ds-eyebrow"
          style={{ color: "rgba(232,239,228,0.5)", marginBottom: 18 }}
        >
          {phase === "idle" && "02 — Realtime · 90s"}
          {phase === "connecting" && "Conectando…"}
          {isLive && (activeSpeaker === "user" ? "Tú hablas" : activeSpeaker === "agent" ? "Sazón habla" : "Esperando…")}
          {phase === "ended" && "Llamada terminada"}
          {phase === "error" && "Error de conexión"}
        </div>

        <h1
          className="ds-display"
          style={{
            fontSize: "clamp(32px, 5vw, 44px)",
            marginBottom: 26,
            maxWidth: 620,
          }}
        >
          {phase === "idle" && (
            <>
              Habla con el asistente de{" "}
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400 }}>
                Grupo Sazón
              </span>
              .
            </>
          )}
          {phase === "connecting" && "Estableciendo enlace…"}
          {isLive && (
            <>
              Entrevista por{" "}
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400 }}>
                voz
              </span>{" "}
              en vivo.
            </>
          )}
          {phase === "ended" && "Gracias por tu tiempo."}
          {phase === "error" && (
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
              {errMsg ?? "algo falló"}
            </span>
          )}
        </h1>

        {/* Two-channel waveform */}
        <div
          style={{
            width: "100%",
            maxWidth: 640,
            background: "rgba(232,239,228,0.04)",
            border: "1px solid rgba(232,239,228,0.08)",
            borderRadius: "var(--r-lg)",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            backdropFilter: "blur(8px)",
            opacity: isLive ? 1 : 0.5,
            transition: "opacity 0.4s",
          }}
        >
          <WaveLane
            who="agent"
            label="Sazón AI"
            sublabel="agent · es-mx"
            color={AGENT_COLOR}
            active={activeSpeaker === "agent"}
            level={agentLevel}
            barsRef={agentBarsRef}
          />
          <div style={{ height: 1, background: "rgba(232,239,228,0.08)" }} />
          <WaveLane
            who="user"
            label="Tú"
            sublabel="candidato · mic"
            color={USER_COLOR}
            active={activeSpeaker === "user"}
            level={userLevel}
            barsRef={userBarsRef}
          />
        </div>

        {conversationId && (
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "rgba(232,239,228,0.4)",
              letterSpacing: "0.06em",
            }}
          >
            CID · {conversationId.slice(0, 8)}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          paddingTop: 14,
        }}
      >
        {phase === "idle" && (
          <button
            onClick={start}
            className="ds-btn"
            style={{
              padding: "16px 30px",
              borderRadius: 999,
              background: "var(--accent)",
              color: "var(--bg-ink)",
              fontWeight: 500,
            }}
          >
            Empezar llamada
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 7h8M7 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {phase === "connecting" && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "rgba(232,239,228,0.6)",
              letterSpacing: "0.08em",
            }}
          >
            CONECTANDO…
          </span>
        )}

        {isLive && (
          <>
            <button
              onClick={toggleMute}
              title={muted ? "Activar mic" : "Silenciar mic"}
              style={{
                ...iconBtnStyle,
                background: muted
                  ? "rgba(248,180,180,0.14)"
                  : "rgba(232,239,228,0.06)",
                color: muted ? "oklch(0.78 0.18 25)" : "var(--ink-invert)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3 8a5 5 0 0 0 10 0M8 13v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                {muted && (
                  <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                )}
              </svg>
            </button>

            <button
              onClick={stop}
              style={{
                padding: "14px 28px",
                borderRadius: 999,
                border: 0,
                background: "oklch(0.58 0.18 25)",
                color: "white",
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: "-0.005em",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ width: 8, height: 8, background: "white", borderRadius: 2 }} />
              Terminar llamada
            </button>
          </>
        )}

        {(phase === "ended" || phase === "error") && (
          <button
            onClick={start}
            className="ds-btn ds-btn--ghost"
            style={{
              color: "var(--ink-invert)",
              boxShadow: "inset 0 0 0 1px rgba(232,239,228,0.20)",
            }}
          >
            Volver a intentar
          </button>
        )}
      </div>

      {/* Bottom strip */}
      <div
        style={{
          position: "relative",
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "rgba(232,239,228,0.4)",
          letterSpacing: "0.06em",
        }}
      >
        <span>
          SESSION {conversationId ? conversationId.slice(0, 4).toUpperCase() : "----"} ·
          REALTIME · OPENAI
        </span>
        <span>ENC · E2E · 48KHZ</span>
      </div>

      <audio ref={audioRef} autoPlay />
    </main>
  );
}
