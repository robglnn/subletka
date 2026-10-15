import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimByEmail } from "@/db/native";
import { googleConfig, requestOrigin } from "@/lib/env";
import { safeNext, STATE_COOKIE, verifiedEmail } from "@/lib/google";
import { encodeSession, sessionCookie } from "@/lib/session";

const Pending = z.object({ state: z.string(), next: z.string() });

const readPending = (raw: string | undefined) => {
  try {
    return Pending.parse(JSON.parse(raw ?? ""));
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return new Response("not found", { status: 404 });
  const origin = requestOrigin(request.headers);
  const pending = readPending(request.cookies.get(STATE_COOKIE)?.value);
  const next = safeNext(pending?.next);
  const fail = NextResponse.redirect(new URL(next, origin));
  fail.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/google" });
  const code = request.nextUrl.searchParams.get("code");
  if (!pending || !code || request.nextUrl.searchParams.get("state") !== pending.state) return fail;
  const email = await verifiedEmail(cfg, origin, code);
  if (!email) return fail;
  await claimByEmail(email);
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/google" });
  response.cookies.set(sessionCookie(encodeSession(email, cfg.authSecret)));
  return response;
}
