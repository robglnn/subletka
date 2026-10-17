import "server-only";
import { cityListings, cityOverview } from "@/db/agent-search";
import { rentByCity } from "@/db/rent";
import { CITIES, type City, type Locale } from "@/lib/domain";
import { llmsFullTxt, llmsTxt } from "@/lib/llms-txt";

export async function renderLlmsTxt(site: string) {
  const [counts, rents] = await Promise.all([Promise.all(CITIES.map((c) => cityOverview(c, "en"))), Promise.all(CITIES.map(rentByCity))]);
  return llmsTxt(site, counts, new Date(), rents);
}

export async function renderLlmsFullTxt(site: string, lang: Locale) {
  const lists = await Promise.all(CITIES.map(async (c) => [c, await cityListings(c)] as const));
  return llmsFullTxt(site, lang, Object.fromEntries(lists) as Record<City, Awaited<ReturnType<typeof cityListings>>>);
}
