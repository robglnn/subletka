import { canonicalDistrict, DISTRICTS, LOCALES, type City } from "@/lib/domain";

export type HubRow = { city: City; district: string | null; lat: number | null; lng: number | null };

export const rentPath = (city: City) => `/${city}/rent`;

const districtSlug = (r: HubRow) => {
  const name = canonicalDistrict(r.city, r.district, r.lat, r.lng);
  return name ? (DISTRICTS[r.city].find((d) => d.name === name)?.slug ?? null) : null;
};

export const hubPathsOf = (r: HubRow) => {
  const slug = districtSlug(r);
  return ["", `/${r.city}`, rentPath(r.city), ...(slug ? [`/${r.city}/${slug}`] : [])];
};

export const hubPaths = (rows: HubRow[]) => [...new Set(rows.flatMap(hubPathsOf))];

export const hubUrls = (site: string, paths: string[]) => paths.flatMap((p) => LOCALES.map((l) => `${site}/${l}${p}`));

export const hubStamps = (rows: (HubRow & { updatedAt: Date })[]) => {
  const stamps = new Map<string, Date>();
  for (const r of rows)
    for (const p of hubPathsOf(r)) {
      const seen = stamps.get(p);
      if (!seen || r.updatedAt > seen) stamps.set(p, r.updatedAt);
    }
  return stamps;
};
