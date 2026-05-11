import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidSessionCookie } from "@/lib/auth";

export const config = {
  matcher: ["/recruiter/:path*"],
};

export async function middleware(req: NextRequest) {
  // Allow the login page itself and its API route
  if (
    req.nextUrl.pathname === "/recruiter/login" ||
    req.nextUrl.pathname.startsWith("/api/recruiter")
  ) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!(await isValidSessionCookie(cookie))) {
    const url = req.nextUrl.clone();
    url.pathname = "/recruiter/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
