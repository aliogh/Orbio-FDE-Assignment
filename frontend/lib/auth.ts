// Web Crypto API — compatible with both Node.js (18+) and Edge runtime

const SECRET = process.env.RECRUITER_COOKIE_SECRET ?? "dev-secret-change-me";
export const COOKIE_NAME = "recruiter_session";

async function sign(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeSessionCookie(): Promise<string> {
  const value = "true";
  const sig = await sign(value);
  return `${value}.${sig}`;
}

export async function isValidSessionCookie(
  raw: string | undefined
): Promise<boolean> {
  if (!raw) return false;
  const dotIndex = raw.indexOf(".");
  if (dotIndex === -1) return false;
  const value = raw.slice(0, dotIndex);
  const sig = raw.slice(dotIndex + 1);
  if (!value || !sig) return false;
  const expected = await sign(value);
  if (sig.length !== expected.length) return false;
  // Constant-time comparison using Web Crypto verify
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  // Convert the provided sig hex back to bytes
  const sigBytes = new Uint8Array(
    sig.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(value));
}
