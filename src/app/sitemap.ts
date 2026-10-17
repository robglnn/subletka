import type { MetadataRoute } from "next";
import { activeListingStamps } from "@/db/listings";
import { siteStamps } from "@/db/rent";
import { CITIES, DISTRICTS, LOCALES } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { rentPath } from "@/lib/hubs";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${site}/pl${path}`,
    lastModified,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${site}/${l}${path}`])) },
  });
  const [listings, stamps] = await Promise.all([activeListingStamps(), siteStamps()]);
  const hub = (path: string) => entry(path, stamps.get(path));
  return [
    hub(""),
    ...CITIES.map((c) => hub(`/${c}`)),
    ...CITIES.map((c) => hub(rentPath(c))),
    ...CITIES.flatMap((c) => DISTRICTS[c].map((d) => hub(`/${c}/${d.slug}`))),
    entry("/post"),
    entry("/about"),
    entry("/privacy"),
    entry("/terms"),
    entry("/contact"),
    ...listings.map((l) => entry(`/l/${encodeURIComponent(l.id)}`, l.updatedAt)),
  ];
}
