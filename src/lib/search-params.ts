import { z } from "zod";
import { DEFAULT_SORT, PLACE_FILTERS, SORTS } from "@/lib/domain";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const optional = <T extends z.ZodType>(s: T) => z.preprocess((v) => first(v) || undefined, s.optional().catch(undefined));
const flag = z.preprocess((v) => first(v) === "1", z.boolean());

export const Filters = z.object({
  from: optional(isoDay),
  to: optional(isoDay),
  type: z.preprocess(
    (v) => String(first(v) ?? "").split(",").filter(Boolean),
    z.array(z.enum(PLACE_FILTERS)).catch([]),
  ),
  max: optional(z.coerce.number().int().positive().max(1_000_000)),
  furnished: flag,
  pets: flag,
  sort: z.preprocess((v) => first(v) || DEFAULT_SORT, z.enum(SORTS).catch(DEFAULT_SORT)),
  page: z.preprocess((v) => first(v) || 1, z.coerce.number().int().min(1).max(50).catch(1)),
});
export type Filters = z.infer<typeof Filters>;
