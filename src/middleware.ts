import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Confinement côté serveur de l'admin local (rôle `local`) à l'onglet Administration.
 * Double la redirection côté client (dashboard-shell) par un contrôle non contournable :
 * même avec JS désactivé ou navigation directe, un compte local est renvoyé vers /dashboard/admin.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (
    token?.role === "local" &&
    pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/dashboard/admin")
  ) {
    return NextResponse.redirect(new URL("/dashboard/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
