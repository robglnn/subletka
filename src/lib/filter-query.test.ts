import assert from "node:assert/strict";
import { test } from "node:test";
import { expandTypes, KIND_FILTERS, placeKind, typeParam } from "./domain";
import { activeFilterCount, filterQuery, isFiltered, kindHrefs } from "./filter-query";
import { Filters } from "./search-params";

test("whole place is studio and flat together, and every place type lands in exactly one of room or whole place", () => {
  assert.deepEqual(expandTypes(["whole"]), ["studio", "flat"]);
  assert.deepEqual(expandTypes(["flat", "whole", "room"]), ["room", "studio", "flat"]);
  assert.deepEqual([...KIND_FILTERS.room, ...KIND_FILTERS.whole].sort(), ["flat", "room", "studio"]);
});

test("a type list maps back to the segment it came from, and to none when it mixes rooms with one kind of whole place", () => {
  assert.equal(placeKind([]), "any");
  assert.equal(placeKind(["room"]), "room");
  assert.equal(placeKind(["studio", "flat"]), "whole");
  assert.equal(placeKind(["studio"]), "whole");
  assert.equal(placeKind(["room", "studio", "flat"]), "any");
  assert.equal(placeKind(["room", "studio"]), null);
});

test("the URL says type=room or type=whole, and any adds no parameter", () => {
  assert.equal(filterQuery({ type: KIND_FILTERS.any }).toString(), "");
  assert.equal(filterQuery({ type: KIND_FILTERS.room }).toString(), "type=room");
  assert.equal(filterQuery({ type: KIND_FILTERS.whole }).toString(), "type=whole");
  assert.equal(typeParam(["flat", "studio"]), "whole");
  assert.equal(typeParam(["studio"]), "studio");
});

test("type=whole and the older type=studio,flat read the same and write back as type=whole", () => {
  const whole = Filters.parse({ type: "whole" });
  assert.deepEqual(whole.type, ["studio", "flat"]);
  assert.deepEqual(Filters.parse({ type: "studio,flat" }).type, whole.type);
  assert.equal(filterQuery(whole).toString(), "type=whole");
  assert.deepEqual(Filters.parse({ type: "house" }).type, []);
});

test("segment links keep the other filters, drop the page and leave any at the bare path", () => {
  const f = Filters.parse({ from: "2026-11-01", type: "room", max: "3000", page: "3" });
  const hrefs = kindHrefs("/pl/warszawa", f);
  assert.equal(hrefs.any, "/pl/warszawa?from=2026-11-01&max=3000");
  assert.equal(hrefs.room, "/pl/warszawa?from=2026-11-01&type=room&max=3000");
  assert.equal(hrefs.whole, "/pl/warszawa?from=2026-11-01&type=whole&max=3000");
  assert.equal(kindHrefs("/en/krakow/podgorze", Filters.parse({})).any, "/en/krakow/podgorze");
});

test("the place type shows on the bar, not as a filter badge, but still counts as filtered for the empty state", () => {
  const room = Filters.parse({ type: "room" });
  assert.equal(activeFilterCount(room), 0);
  assert.equal(isFiltered(room), true);
  assert.equal(isFiltered(Filters.parse({})), false);
});
