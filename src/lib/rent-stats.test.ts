import assert from "node:assert/strict";
import { test } from "node:test";
import { cityRent, median, type RentInput } from "./rent-stats";

const rent = (monthlyPln: number, over: Partial<RentInput> = {}): RentInput => ({
  kind: "room",
  district: "Mokotów",
  monthlyPln,
  price: { amount: monthlyPln, currency: "PLN" },
  outlier: false,
  minutes: 20,
  ...over,
});

test("median takes the middle value, or the rounded mean of the two middle values", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1000, 1001]), 1001);
});

test("a median needs three typical listings, so outliers count as listings but never move the median or the lowest rent", () => {
  const stats = cityRent(
    "warszawa",
    [rent(2000), rent(2200), rent(100, { outlier: true }), rent(4000, { kind: "flat" }), rent(4200, { kind: "flat" }), rent(9000, { kind: "flat" })],
    null,
    () => null,
  );
  assert.deepEqual(stats.kinds.room, { listings: 3, medianPln: null, lowest: { amount: 2000, currency: "PLN" } });
  assert.deepEqual(stats.kinds.flat, { listings: 3, medianPln: 4200, lowest: { amount: 4000, currency: "PLN" } });
  assert.deepEqual(stats.kinds.studio, { listings: 0, medianPln: null, lowest: null });
  assert.equal(stats.all.listings, 6);
  assert.equal(stats.all.medianPln, 4000);
});

test("districts sort by median with the rest after them, and fall back to the district's own travel time", () => {
  const updatedAt = new Date("2026-10-17T06:00:00Z");
  const stats = cityRent(
    "warszawa",
    [rent(3000, { district: "Wola", minutes: 12 }), rent(3100, { district: "Wola", minutes: 14 }), rent(3200, { district: "Wola", minutes: null }), rent(2000), rent(2100), rent(2200)],
    updatedAt,
    (slug) => (slug === "bemowo" ? 30 : null),
  );
  assert.deepEqual(
    stats.districts.slice(0, 2).map((d) => [d.name, d.medianPln, d.minutes]),
    [
      ["Mokotów", 2100, 20],
      ["Wola", 3100, 13],
    ],
  );
  assert.equal(stats.districts.find((d) => d.slug === "bemowo")?.minutes, 30);
  assert.ok(stats.districts.slice(2).every((d) => d.medianPln === null));
  assert.equal(stats.updatedAt, updatedAt);
});
