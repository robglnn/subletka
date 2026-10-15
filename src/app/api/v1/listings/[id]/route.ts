import type { NextRequest } from "next/server";
import { listing } from "@/lib/agent-api";
import { apiJson, limited } from "@/lib/agent-http";
import { siteUrl } from "@/lib/env";

export const GET = limited("api", async (request: NextRequest, ctx: RouteContext<"/api/v1/listings/[id]">) => {
  const { id } = await ctx.params;
  const { status, body } = await listing({ ...Object.fromEntries(request.nextUrl.searchParams), id: decodeURIComponent(id) }, siteUrl());
  return apiJson(body, status);
});
