import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleConfig, requestOrigin } from "@/lib/env";
import { authorizeUrl, safeNext, STATE_COOKIE } from "@/lib/google";

export async function GET(request: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return new Response("not found", { status: 404 });
  const state = randomBytes(16).toString("base64url");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(authorizeUrl(cfg, requestOrigin(request.headers), state));
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return response;
}
