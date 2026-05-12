"use client";

import Link from "next/link";
import { useState } from "react";

type MotifKind = "chat" | "voice" | "recruiter";

function SazonDrop() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path
        d="M14 3 C 14 3, 22 11, 22 17.5 C 22 22.2, 18.4 25, 14 25 C 9.6 25, 6 22.2, 6 17.5 C 6 11, 14 3, 14 3 Z"
        fill="oklch(0.72 0.22 138)"
      />
      <path
        d="M11.2 9.5 C 10.3 11, 9.5 13.2, 9.4 15.5"
        stroke="oklch(0.94 0.10 140)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
    </svg>
  );
}

function ChatMotif({ animate }: { animate: boolean }) {
  return (
    <svg width="170" height="120" viewBox="0 0 170 120" fill="none">
      <rect
        x="6"
        y="22"
        rx="18"
        ry="18"
        width="98"
        height="44"
        fill="var(--bg-cream)"
        stroke="var(--line-strong)"
        strokeWidth="1"
      />
      <rect x="66" y="62" rx="18" ry="18" width="98" height="44" fill="var(--ink)" />
      <g>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={100 + i * 14}
            cy={84}
            r="3.2"
            fill="var(--ink-invert)"
          >
            {animate && (
              <animate
                attributeName="opacity"
                values="0.25;1;0.25"
                dur="1.2s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}
      </g>
      <rect x="20" y="38" rx="2" ry="2" width="60" height="3" fill="var(--ink-soft)" opacity="0.6" />
      <rect x="20" y="46" rx="2" ry="2" width="38" height="3" fill="var(--ink-soft)" opacity="0.4" />
    </svg>
  );
}

function VoiceMotif({ animate }: { animate: boolean }) {
  const bars = [12, 28, 44, 60, 78, 64, 48, 30, 16, 30, 50, 36, 22];
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" fill="none">
      <defs>
        <linearGradient id="vmgrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="oklch(0.88 0.20 135)" />
          <stop offset="1" stopColor="oklch(0.62 0.22 140)" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={8 + i * 14}
          y={60 - h / 2}
          width="6"
          height={h}
          rx="3"
          fill="url(#vmgrad)"
        >
          {animate && (
            <animate
              attributeName="height"
              values={`${h};${Math.max(8, h * 0.4)};${h * 1.1};${h}`}
              dur={`${1.0 + (i % 4) * 0.15}s`}
              begin={`${i * 0.05}s`}
              repeatCount="indefinite"
            />
          )}
          {animate && (
            <animate
              attributeName="y"
              values={`${60 - h / 2};${60 - Math.max(8, h * 0.4) / 2};${60 - (h * 1.1) / 2};${60 - h / 2}`}
              dur={`${1.0 + (i % 4) * 0.15}s`}
              begin={`${i * 0.05}s`}
              repeatCount="indefinite"
            />
          )}
        </rect>
      ))}
    </svg>
  );
}

function RecruiterMotif({ animate }: { animate: boolean }) {
  return (
    <svg width="180" height="120" viewBox="0 0 180 120" fill="none">
      <rect x="20" y="22" rx="10" ry="10" width="140" height="22" fill="var(--bg-cream)" stroke="var(--line-strong)" />
      <circle cx="32" cy="33" r="5" fill="var(--accent)" />
      <rect x="44" y="29" width="48" height="3.5" rx="2" fill="var(--ink-muted)" />
      <rect x="44" y="36" width="28" height="3" rx="1.5" fill="var(--ink-soft)" />
      <rect x="124" y="29" width="22" height="8" rx="4" fill="var(--moss-soft)" />

      <rect x="20" y="50" rx="10" ry="10" width="140" height="22" fill="var(--bg-cream)" stroke="var(--line-strong)" />
      <circle cx="32" cy="61" r="5" fill="var(--moss)" />
      <rect x="44" y="57" width="36" height="3.5" rx="2" fill="var(--ink-muted)" />
      <rect x="44" y="64" width="50" height="3" rx="1.5" fill="var(--ink-soft)" />
      <rect x="124" y="57" width="22" height="8" rx="4" fill="var(--moss-soft)" />

      <rect x="20" y="78" rx="10" ry="10" width="140" height="22" fill="var(--bg-cream)" stroke="var(--line-strong)" />
      <circle cx="32" cy="89" r="5" fill="var(--ink-soft)" />
      <rect x="44" y="85" width="40" height="3.5" rx="2" fill="var(--ink-muted)" />
      <rect x="44" y="92" width="32" height="3" rx="1.5" fill="var(--ink-soft)" />
      <rect x="124" y="85" width="22" height="8" rx="4" fill="var(--bg-card)" stroke="var(--line-strong)" />

      {animate && (
        <line x1="20" y1="32" x2="160" y2="32" stroke="var(--accent-deep)" strokeWidth="1.2" opacity="0.85">
          <animate attributeName="y1" values="32;100;32" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="y2" values="32;100;32" dur="2.4s" repeatCount="indefinite" />
        </line>
      )}
    </svg>
  );
}

function OptionCard({
  href,
  n,
  tag,
  title,
  desc,
  motif,
  active,
  onHover,
  onLeave,
}: {
  href: string;
  n: string;
  tag: string;
  title: string;
  desc: string;
  motif: MotifKind;
  active: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const dark = motif === "voice";
  return (
    <Link
      href={href}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      style={{
        position: "relative",
        background: dark ? "var(--bg-ink)" : "var(--bg-paper)",
        color: dark ? "var(--ink-invert)" : "var(--ink)",
        border: dark ? "1px solid var(--bg-ink)" : "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        padding: "22px 22px 24px",
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        cursor: "pointer",
        overflow: "hidden",
        transition: "transform 0.25s cubic-bezier(.2,.7,.3,1), box-shadow 0.25s",
        transform: active ? "translateY(-3px)" : "translateY(0)",
        boxShadow: active ? "var(--shadow-lift)" : "var(--shadow-card)",
        minHeight: 320,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.06em",
            color: dark ? "rgba(232,239,228,0.45)" : "var(--ink-soft)",
          }}
        >
          {n}
        </span>
        <span
          className="ds-eyebrow"
          style={{ color: dark ? "rgba(232,239,228,0.45)" : "var(--ink-muted)" }}
        >
          {tag}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0" }}>
        {motif === "chat" && <ChatMotif animate={active} />}
        {motif === "voice" && <VoiceMotif animate={active} />}
        {motif === "recruiter" && <RecruiterMotif animate={active} />}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            {title}
          </h3>
          <span
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "translateX(0)" : "translateX(-6px)",
              transition: "all 0.22s",
              color: dark ? "var(--ink-invert)" : "var(--ink)",
              fontSize: 18,
            }}
          >
            →
          </span>
        </div>
        <p
          style={{
            marginTop: 6,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: dark ? "rgba(232,239,228,0.65)" : "var(--ink-muted)",
            maxWidth: 280,
          }}
        >
          {desc}
        </p>
      </div>
    </Link>
  );
}

export default function Home() {
  const [hover, setHover] = useState<MotifKind | null>(null);

  async function signOut() {
    try {
      await fetch("/api/recruiter/login", { method: "DELETE" });
    } catch {
      /* fall through to redirect anyway */
    }
    window.location.href = "/login";
  }

  return (
    <main
      className="ds-base"
      style={{
        minHeight: "100vh",
        background: "var(--bg-cream)",
        padding: "36px 56px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Top nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 24,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="orbio-mark">Orbio</span>
          <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            /
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-muted)",
              letterSpacing: "0.05em",
            }}
          >
            sazón · campaign-01
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--moss)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "var(--moss)",
                borderRadius: 999,
                boxShadow: "0 0 0 4px oklch(0.58 0.09 145 / 0.18)",
              }}
            />
            ACTIVE
          </span>
          <button
            onClick={signOut}
            className="ds-btn ds-btn--ghost"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 4,
          marginBottom: 8,
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 600 }}>
          <div className="ds-eyebrow" style={{ marginBottom: 14 }}>
            02 — Choose your channel
          </div>
          <h1 className="ds-display" style={{ fontSize: "clamp(36px, 5vw, 60px)", margin: 0 }}>
            Hire delivery drivers, <br />
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              the way they work.
            </span>
          </h1>
        </div>
        <div
          style={{
            padding: "14px 18px",
            background: "var(--bg-paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: 280,
          }}
        >
          <SazonDrop />
          <div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 18,
                color: "var(--ink)",
                lineHeight: 1,
              }}
            >
              Sazón
            </div>
            <div
              className="ds-eyebrow"
              style={{ fontSize: 9, color: "var(--ink-muted)", marginTop: 2 }}
            >
              Grupo · Cliente
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--line)", margin: "0 4px" }} />
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              lineHeight: 1.4,
            }}
          >
            12 plazas
            <br />
            MX · CDMX
          </div>
        </div>
      </div>

      {/* 3 channel cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          flex: 1,
        }}
      >
        <OptionCard
          href="/chat"
          n="01"
          tag="Conversational"
          title="Chat"
          desc="Apply by text. Best for quiet moments, careful answers, and accessibility."
          motif="chat"
          active={hover === "chat"}
          onHover={() => setHover("chat")}
          onLeave={() => setHover(null)}
        />
        <OptionCard
          href="/voice"
          n="02"
          tag="Realtime"
          title="Voice"
          desc="Apply by voice in 90 seconds. Natural turn-taking with our agent."
          motif="voice"
          active={hover === "voice"}
          onHover={() => setHover("voice")}
          onLeave={() => setHover(null)}
        />
        <OptionCard
          href="/recruiter"
          n="03"
          tag="Internal"
          title="Recruiters"
          desc="Triage candidates, listen to transcripts, decide next steps."
          motif="recruiter"
          active={hover === "recruiter"}
          onHover={() => setHover("recruiter")}
          onLeave={() => setHover(null)}
        />
      </div>

      {/* Footer strip */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-soft)",
          letterSpacing: "0.06em",
        }}
      >
        <span>ORBIO.WORK / FDE / ALÍ GHANBARI</span>
        <span>2026 — V1</span>
      </div>
    </main>
  );
}
