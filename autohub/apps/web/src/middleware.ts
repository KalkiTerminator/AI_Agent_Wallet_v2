import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/usage", "/settings", "/onboarding", "/tools", "/org"];
const adminRoutes = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));
  const isAdmin = adminRoutes.some((r) => pathname.startsWith(r));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // MFA step-up: session exists but TOTP not yet completed
  if (isProtected && session?.mfaPending) {
    return NextResponse.redirect(new URL("/auth/mfa", req.url));
  }

  if (isAdmin && session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
