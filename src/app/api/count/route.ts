import type { NextRequest } from "next/server";
import { browseCount } from "@/db/listings";
import { isCity } from "@/lib/domain";
import { Filters } from "@/lib/search-params";

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  if (!isCity(params.city ?? "")) return Response.json({ error: "city" }, { status: 400 });
  const total = await browseCount({ ...Filters.parse(params), city: params.city as "warszawa" | "krakow" });
  return Response.json({ total });
}
