import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/env";
import { safeNext } from "@/lib/google";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next")?.toString());
  const response = NextResponse.redirect(new URL(next, requestOrigin(request.headers)), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
