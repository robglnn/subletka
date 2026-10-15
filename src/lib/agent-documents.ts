import "server-only";
import { cityListings, cityOverview } from "@/db/agent-search";
import { CITIES, type City, type Locale } from "@/lib/domain";
import { llmsFullTxt, llmsTxt } from "@/lib/llms-txt";

export async function renderLlmsTxt(site: string) {
  return llmsTxt(site, await Promise.all(CITIES.map((c) => cityOverview(c, "en"))));
}

export async function renderLlmsFullTxt(site: string, lang: Locale) {
  const lists = await Promise.all(CITIES.map(async (c) => [c, await cityListings(c)] as const));
  return llmsFullTxt(site, lang, Object.fromEntries(lists) as Record<City, Awaited<ReturnType<typeof cityListings>>>);
}
