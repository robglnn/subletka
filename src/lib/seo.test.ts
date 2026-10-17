import assert from "node:assert/strict";
import { test } from "node:test";
import { findForbidden } from "./forbidden-copy";
import { cityRent } from "./rent-stats";
import { cityDescription, pageMetadata, rentDescription } from "./seo";

test("city descriptions carry the live count and the median rent in the language's currency", () => {
  const warsaw = { total: 383, medianPln: 5383 };
  assert.equal(cityDescription("pl", "warszawa", warsaw), "383 pokoje i mieszkania na miesiąc w Warszawie. Mediana czynszu 5\u00a0380 zł.");
  assert.equal(cityDescription("en", "warszawa", warsaw), "383 rooms and flats by the month in Warsaw. Median rent €1,260.");
  assert.equal(cityDescription("pl", "krakow", { total: 1, medianPln: 3204 }), "1 pokój lub mieszkanie na miesiąc w Krakowie. Mediana czynszu 3\u00a0200 zł.");
  assert.equal(cityDescription("en", "krakow", { total: 1, medianPln: 3204 }), "1 room or flat by the month in Kraków. Median rent €750.");
  assert.equal(cityDescription("pl", "krakow", { total: 55, medianPln: null }), "55 pokoi i mieszkań na miesiąc w Krakowie.");
});

test("an empty city gets a description with no count and no median", () => {
  assert.equal(cityDescription("pl", "warszawa", { total: 0, medianPln: null }), "Pokoje i mieszkania na miesiąc w Warszawie.");
  assert.equal(cityDescription("en", "krakow", { total: 0, medianPln: null }), "Rooms and flats by the month in Kraków.");
});

test("the city description reaches the page, Open Graph and Twitter metadata and names nothing forbidden", () => {
  const description = cityDescription("en", "krakow", { total: 42, medianPln: 3900 });
  const meta = pageMetadata("en", "/krakow", "Sublets in Kraków", description);
  assert.equal(meta.description, "42 rooms and flats by the month in Kraków. Median rent €915.");
  assert.equal(meta.openGraph?.description, meta.description);
  assert.equal(meta.twitter?.description, meta.description);
  assert.deepEqual(findForbidden(description), []);
});

test("the rent page description lists the median per type and the date, and skips types without a median", () => {
  const row = (monthlyPln: number, kind: "room" | "flat") => ({ kind, district: "Wola", monthlyPln, price: { amount: monthlyPln, currency: "PLN" as const }, outlier: false, minutes: null });
  const rent = cityRent("warszawa", [row(2000, "room"), row(2100, "room"), row(2200, "room"), row(4000, "flat")], new Date("2026-10-16T05:00:00Z"), () => null);
  const today = new Date("2026-10-17T12:00:00Z");
  assert.equal(rentDescription("pl", rent, today), "Mediana miesięcznego czynszu w Warszawie: pokój 2\u00a0100 zł. Według dzielnic, stan na 16 października 2026.");
  assert.equal(rentDescription("en", rent, today), "Median monthly rent in Warsaw: room €490. By district, as of 16 October 2026.");
  assert.equal(rentDescription("en", cityRent("krakow", [], null, () => null), today), "Median monthly rent in Kraków. By district, as of 17 October 2026.");
  assert.deepEqual(findForbidden(rentDescription("pl", rent, today)), []);
});
