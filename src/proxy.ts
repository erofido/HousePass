import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Everything except /login (and the API, which checks itself) needs the cookie. */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const ok = token ? await verifySessionToken(token) : false;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!ok && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (ok && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/", "/login", "/plan", "/stats", "/arcade", "/settings"],
};
