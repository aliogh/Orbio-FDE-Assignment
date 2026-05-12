import { NextResponse } from "next/server";
import { COOKIE_NAME, makeSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();
  if (password !== process.env.RECRUITER_PASSWORD) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await makeSessionCookie(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
