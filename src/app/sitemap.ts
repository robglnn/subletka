import type { MetadataRoute } from "next";
import { activeListingStamps } from "@/db/listings";
import { CITIES, DISTRICTS, LOCALES } from "@/lib/domain";
import { siteUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${site}/pl${path}`,
    lastModified,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${site}/${l}${path}`])) },
  });
  const listings = await activeListingStamps();
  return [
    entry(""),
    ...CITIES.map((c) => entry(`/${c}`)),
    ...CITIES.flatMap((c) => DISTRICTS[c].map((d) => entry(`/${c}/${d.slug}`))),
    entry("/post"),
    entry("/about"),
    entry("/privacy"),
    entry("/terms"),
    entry("/contact"),
    ...listings.map((l) => entry(`/l/${encodeURIComponent(l.id)}`, l.updatedAt)),
  ];
}
