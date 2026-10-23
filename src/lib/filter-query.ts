import { DEFAULT_SORT, KIND_FILTERS, PLACE_KINDS, typeParam, type PlaceKind } from "@/lib/domain";
import type { Filters } from "@/lib/search-params";

export const filterQuery = (f: Partial<Filters>) => {
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.type?.length) q.set("type", typeParam(f.type));
  if (f.max) q.set("max", String(f.max));
  if (f.furnished) q.set("furnished", "1");
  if (f.pets) q.set("pets", "1");
  if (f.sort && f.sort !== DEFAULT_SORT) q.set("sort", f.sort);
  if (f.page && f.page > 1) q.set("page", String(f.page));
  return q;
};

export const activeFilterCount = (f: Filters) => (f.max ? 1 : 0) + (f.furnished ? 1 : 0) + (f.pets ? 1 : 0) + (f.sort !== DEFAULT_SORT ? 1 : 0);

export const isFiltered = (f: Filters) => activeFilterCount(f) > 0 || f.type.length > 0 || Boolean(f.from || f.to);

export const kindHrefs = (path: string, f: Filters) =>
  Object.fromEntries(
    PLACE_KINDS.map((k) => {
      const q = filterQuery({ ...f, type: KIND_FILTERS[k], page: 1 }).toString();
      return [k, q ? `${path}?${q}` : path];
    }),
  ) as Record<PlaceKind, string>;
