"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/recruiter/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        router.replace(next);
      } else {
        setErr("Contraseña incorrecta.");
      }
    } finally {
      setLoading(false);
    }
  }

  const labelFloated = focused || pw.length > 0;

  return (
    <main className="ds-base login-shell">
      {/* === Left: brand stage === */}
      <section className="login-stage">
        {/* soft green glow */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto -120px -180px auto",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(0.82 0.22 138 / 0.45) 0%, transparent 60%)",
            filter: "blur(10px)",
            pointerEvents: "none",
          }}
        />
        {/* grain */}
        <svg
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.15,
            pointerEvents: "none",
            mixBlendMode: "overlay",
          }}
        >
          <filter id="loginGrain">
            <feTurbulence baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#loginGrain)" />
        </svg>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="orbio-mark" style={{ color: "var(--ink-invert)" }}>
            Orbio
          </span>
          <span
            className="ds-eyebrow"
            style={{ color: "rgba(232,239,228,0.55)" }}
          >
            Internal · Take-home
          </span>
        </div>

        <div
          style={{
            position: "relative",
            marginTop: "auto",
            marginBottom: "auto",
            maxWidth: 460,
          }}
        >
          <div
            className="ds-eyebrow"
            style={{ color: "rgba(232,239,228,0.55)", marginBottom: 18 }}
          >
            01 — Welcome
          </div>
          <h1
            className="ds-display login-display"
            style={{ fontSize: "clamp(40px, 6vw, 64px)", color: "var(--ink-invert)" }}
          >
            Orbio{" "}
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              FDE
            </span>
            <br />
            Assignment.
          </h1>
          <p
            style={{
              marginTop: 22,
              color: "rgba(232,239,228,0.65)",
              fontSize: 15,
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            A small recruiting tool for Grupo Sazón — chat, voice, and a tidy
            panel for the recruiting team. Built for the field, designed for the
            candidate.
          </p>
        </div>

        {/* bottom-right signature */}
        <div
          style={{
            position: "relative",
            alignSelf: "flex-end",
            textAlign: "right",
            color: "var(--ink-invert)",
          }}
        >
          <div
            className="ds-eyebrow"
            style={{ color: "rgba(232,239,228,0.45)", marginBottom: 8 }}
          >
            Submitted by
          </div>
          <div
            className="login-signature"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 30,
              lineHeight: 1.0,
              letterSpacing: "-0.01em",
            }}
          >
            Alí
            <br />
            <span style={{ fontStyle: "italic" }}>Ghanbari</span>
          </div>
        </div>
      </section>

      {/* === Right: form === */}
      <section className="login-pane">
        {/* Sazón crest — pinned top-right on desktop, inline at top on mobile */}
        <div className="login-sazon-crest">
          <SazonDrop />
          <div style={{ lineHeight: 1.1 }}>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 18,
                color: "var(--ink)",
              }}
            >
              Sazón
            </div>
            <div
              className="ds-eyebrow"
              style={{ fontSize: 9, color: "var(--ink-muted)" }}
            >
              Grupo
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="login-form" style={{ marginTop: "auto" }}>
          <div className="ds-eyebrow" style={{ marginBottom: 14 }}>
            Sign in
          </div>
          <h2
            className="ds-display login-heading"
            style={{ fontSize: 38, marginBottom: 8 }}
          >
            Private demo.
          </h2>
          <p
            style={{
              color: "var(--ink-muted)",
              fontSize: 15,
              marginBottom: 36,
              maxWidth: 320,
            }}
          >
            Enter your access password to view the recruiter and candidate flows.
          </p>

          <div style={{ position: "relative", marginBottom: 8 }}>
            <label
              style={{
                position: "absolute",
                left: 2,
                top: labelFloated ? -10 : 14,
                fontSize: labelFloated ? 11 : 15,
                color: focused ? "var(--ink)" : "var(--ink-soft)",
                fontFamily: labelFloated
                  ? "var(--font-mono)"
                  : "var(--font-sans)",
                letterSpacing: labelFloated ? "0.14em" : "0",
                textTransform: labelFloated ? "uppercase" : "none",
                transition: "all 0.22s cubic-bezier(.2,.7,.3,1)",
                pointerEvents: "none",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="ds-field"
              style={{ paddingTop: 18, paddingBottom: 10 }}
              autoFocus
            />
          </div>

          {err && (
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "oklch(0.58 0.18 25)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.02em",
              }}
            >
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !pw}
            className="ds-btn ds-btn--primary"
            style={{ width: "100%", marginTop: 24, padding: "16px 22px" }}
          >
            {loading ? "Verificando…" : "Enter"}
            {!loading && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7h8M7 3l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          <div
            style={{
              marginTop: 28,
              paddingTop: 22,
              borderTop: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "var(--ink-soft)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
            }}
          >
            <span>v1.0 · FDE</span>
            <span>orbio.work</span>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div
          className="ds-base"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-paper)",
            color: "var(--ink-soft)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Cargando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
