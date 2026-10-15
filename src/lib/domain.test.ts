import assert from "node:assert/strict";
import { test } from "node:test";
import { approximateLocation, isPastDates, warsawDay } from "./domain";

test("the listing day turns over at midnight in Warsaw, not UTC", () => {
  assert.equal(warsawDay(new Date("2026-10-15T21:59:59Z")), "2026-10-15");
  assert.equal(warsawDay(new Date("2026-10-15T22:00:00Z")), "2026-10-16");
  assert.equal(warsawDay(new Date("2026-12-31T22:59:59Z")), "2026-12-31");
  assert.equal(warsawDay(new Date("2026-12-31T23:00:00Z")), "2027-01-01");
});

test("a listing is past its dates only after its last available day, and never without an end date", () => {
  assert.equal(isPastDates("2026-10-14", "2026-10-15"), true);
  assert.equal(isPastDates("2026-10-15", "2026-10-15"), false);
  assert.equal(isPastDates(null, "2026-10-15"), false);
});

test("a listing is placed at its coordinates, else at its district's centre, else nowhere", () => {
  assert.deepEqual(approximateLocation({ city: "warszawa", district: "Mokotów", lat: 52.2, lng: 21.0 }), { center: [52.2, 21.0], radiusM: 450 });
  assert.deepEqual(approximateLocation({ city: "warszawa", district: "Mokotów", lat: null, lng: null })?.radiusM, 900);
  assert.equal(approximateLocation({ city: "warszawa", district: null, lat: null, lng: null }), null);
});
