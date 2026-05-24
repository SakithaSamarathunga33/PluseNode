import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Never gate the login page itself.
  if (pathname.startsWith("/login")) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get("pn_session")

  try {
    const res = await fetch(`${GO_API}/api/auth/status`, {
      headers: sessionCookie
        ? { Cookie: `pn_session=${sessionCookie.value}` }
        : {},
      cache: "no-store",
    })

    const data = (await res.json()) as { enabled: boolean; loggedIn: boolean }

    if (!data.enabled) {
      // No login configured — pass through.
      return NextResponse.next()
    }

    if (!data.loggedIn) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Valid session — pass through and forward any refreshed cookie from Go.
    const response = NextResponse.next()
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) {
      response.headers.set("set-cookie", setCookie)
    }
    return response
  } catch {
    // Go API unreachable (startup, update) — don't block the user.
    return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|login).*)"],
}
