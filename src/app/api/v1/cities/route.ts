import type { NextRequest } from "next/server";
import { cities } from "@/lib/agent-api";
import { apiJson, limited } from "@/lib/agent-http";
import { siteUrl } from "@/lib/env";

export const GET = limited("api", async (request: NextRequest) => {
  const { status, body } = await cities(Object.fromEntries(request.nextUrl.searchParams), siteUrl());
  return apiJson(body, status);
});
