import type { NextRequest } from "next/server";
import { search } from "@/lib/agent-api";
import { apiJson, limited } from "@/lib/agent-http";
import { fromSearchParams } from "@/lib/agent-query";
import { siteUrl } from "@/lib/env";

export const GET = limited("api", async (request: NextRequest) => {
  const { status, body } = await search(fromSearchParams(request.nextUrl.searchParams), siteUrl());
  return apiJson(body, status);
});
