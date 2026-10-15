import { z } from "zod";
import { CITIES, CURRENCIES, GENDERS, PLACE_TYPES, PRICE_PERIODS, TERM_KINDS } from "@/lib/domain";
import { decodeEntities } from "@/lib/decode-entities";
import { scrubSourceNames } from "@/lib/scrub-sources";

const cleanText = (text: string) => scrubSourceNames(decodeEntities(text));
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const https = z.url({ protocol: /^https$/ });
const count = z.number().int().nonnegative();

export const ImportedListing = z.object({
  id: z.string().min(3).max(200),
  source: z.string().regex(/^[a-z0-9_]+$/).max(40),
  sourceId: z.string().min(1).max(200),
  sourceUrl: https,
  sourceName: z.string().min(1).max(60),
  city: z.enum(CITIES),
  district: z.string().max(80).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  title: z.string().max(300).transform(cleanText),
  lang: z.string().max(8).nullish(),
  description: z.string().max(4000).transform(cleanText).nullish(),
  price: z.object({
    amount: z.number().int().positive(),
    currency: z.enum(CURRENCIES),
    period: z.enum(PRICE_PERIODS),
    billsIncluded: z.boolean().nullish(),
    startingAt: z.boolean().nullish(),
  }),
  deposit: count.nullish(),
  cancellationPolicy: z.string().max(80).nullish(),
  availableFrom: isoDay.nullish(),
  availableTo: isoDay.nullish(),
  minStayDays: count.nullish(),
  termKind: z.enum(TERM_KINDS),
  placeType: z.enum(PLACE_TYPES),
  rooms: count.nullish(),
  areaM2: z.number().nonnegative().nullish(),
  roommates: z
    .object({
      count: count.nullish(),
      genders: z.enum(GENDERS).nullish(),
      preferredTenantGender: z.enum(["female", "male"]).nullish(),
    })
    .nullish(),
  furnished: z.boolean().nullish(),
  petsAllowed: z.boolean().nullish(),
  photos: z.array(https).max(12),
  postedAt: z.iso.datetime({ offset: true }).nullish(),
  sourceUpdatedAt: z.iso.datetime({ offset: true }).nullish(),
  lastReviewAt: isoDay.nullish(),
  fetchedAt: z.iso.datetime({ offset: true }),
});
export type ImportedListing = z.infer<typeof ImportedListing>;

const IngestBody = z.object({
  fetchedAt: z.string().optional(),
  activeSourceUrls: z.record(z.string().regex(/^[a-z0-9_]+$/), z.array(z.string())).default({}),
  listings: z.array(z.unknown()),
});

export type IngestBatch = {
  received: number;
  listings: ImportedListing[];
  activeSourceUrls: Record<string, string[]>;
  rejected: { index: number; id: unknown; issues: string[] }[];
};

export const parseIngest = (body: unknown): IngestBatch | null => {
  const envelope = IngestBody.safeParse(body);
  if (!envelope.success) return null;
  const { listings: raw, activeSourceUrls } = envelope.data;
  const bySourceUrl = new Map<string, ImportedListing>();
  const rejected: IngestBatch["rejected"] = [];
  raw.forEach((item, index) => {
    const r = ImportedListing.safeParse(item);
    if (r.success) bySourceUrl.set(r.data.sourceUrl, r.data);
    else
      rejected.push({
        index,
        id: (item as { id?: unknown } | null)?.id,
        issues: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`),
      });
  });
  return { received: raw.length, listings: [...bySourceUrl.values()], activeSourceUrls, rejected };
};
