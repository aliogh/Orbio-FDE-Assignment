import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidSessionCookie } from "@/lib/auth";

// Gate the entire app behind the password. Everything except the login page
// itself, the login API route, and Next.js internals requires a valid session
// cookie. The matcher's negative lookahead handles `_next` assets + favicon;
// the function body short-circuits `/login` and the login POST endpoint.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — always allowed
  if (pathname === "/login" || pathname === "/api/recruiter/login") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!(await isValidSessionCookie(cookie))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the user's intended destination so we can return them there
    // after a successful login.
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
