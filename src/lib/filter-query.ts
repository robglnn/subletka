import { DEFAULT_SORT } from "@/lib/domain";
import type { Filters } from "@/lib/search-params";

export const filterQuery = (f: Partial<Filters>) => {
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.type?.length) q.set("type", f.type.join(","));
  if (f.max) q.set("max", String(f.max));
  if (f.furnished) q.set("furnished", "1");
  if (f.pets) q.set("pets", "1");
  if (f.sort && f.sort !== DEFAULT_SORT) q.set("sort", f.sort);
  if (f.page && f.page > 1) q.set("page", String(f.page));
  return q;
};

export const activeFilterCount = (f: Filters) =>
  (f.type.length ? 1 : 0) + (f.max ? 1 : 0) + (f.furnished ? 1 : 0) + (f.pets ? 1 : 0) + (f.sort !== DEFAULT_SORT ? 1 : 0);
