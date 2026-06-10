import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  STATION_COOKIE,
  STUDENT_COOKIE,
  verifySessionToken,
} from "@/lib/session";

/**
 * Route guards + Supabase session refresh.
 * Layouts re-verify server-side; this exists to keep sessions fresh and to
 * bounce signed-out visitors to the right login quickly.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/staff")) {
    return staffProxy(request);
  }

  if (pathname.startsWith("/student") && pathname !== "/student/login") {
    const token = request.cookies.get(STUDENT_COOKIE)?.value;
    const session = token ? await verifySessionToken(token, "student") : null;
    if (!session) {
      return NextResponse.redirect(new URL("/student/login", request.url));
    }
  }

  if (pathname.startsWith("/station") && pathname !== "/station/setup") {
    const token = request.cookies.get(STATION_COOKIE)?.value;
    const session = token ? await verifySessionToken(token, "station") : null;
    if (!session) {
      return NextResponse.redirect(new URL("/station/setup", request.url));
    }
  }

  return NextResponse.next({ request });
}

async function staffProxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token if needed (writes cookies via setAll above).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname !== "/staff/login") {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }
  if (user && request.nextUrl.pathname === "/staff/login") {
    return NextResponse.redirect(new URL("/staff", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/staff/:path*", "/student/:path*", "/station/:path*"],
};
