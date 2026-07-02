import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

const API_BASE = env.NEXT_PUBLIC_API_URL;

// Server-side proxy for the MFA step-up challenge.
//
// The browser calls this same-origin route instead of the API host directly,
// so the challenge works regardless of the API's CORS allowlist — the same
// reason login works (NextAuth's authorize() calls the API server-side).
// The pending mfaToken is read from the NextAuth session here rather than
// trusted from the client body.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.mfaToken) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  if (!body?.code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/mfa/challenge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Preserve the real client IP so the API's per-IP rate limits don't
        // collapse every user onto this server's egress address.
        ...(req.headers.get("x-forwarded-for")
          ? { "x-forwarded-for": req.headers.get("x-forwarded-for") as string }
          : {}),
      },
      body: JSON.stringify({ mfaToken: session.mfaToken, code: body.code }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({ error: "Unexpected response from authentication service" }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Authentication service unreachable. Please try again." }, { status: 502 });
  }
}
