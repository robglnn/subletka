import assert from "node:assert/strict";
import { test } from "node:test";
import { availability, minStay } from "./i18n/format";

const at = new Date("2026-10-15T22:30:00Z");

test("the next free date reads as now once it is today in Warsaw, and as a date after that", () => {
  assert.equal(availability("en", { availableFrom: "2026-10-16", availableTo: null }, at), "now");
  assert.equal(availability("pl", { availableFrom: "2026-10-16", availableTo: null }, at), "od zaraz");
  assert.equal(availability("en", { availableFrom: "2026-10-17", availableTo: null }, at), "from 17 Oct");
  assert.equal(availability("pl", { availableFrom: null, availableTo: null }, at), "od zaraz");
});

test("an end date shows as a range in both languages", () => {
  assert.equal(availability("en", { availableFrom: "2027-02-01", availableTo: "2027-08-31" }, at), "1 Feb 2027 – 31 Aug 2027");
  assert.equal(availability("pl", { availableFrom: "2027-02-01", availableTo: "2027-08-31" }, at), "1 lut 2027 – 31 sie 2027");
  assert.equal(availability("en", { availableFrom: "2026-10-01", availableTo: "2026-12-31" }, at), "now – 31 Dec");
});

test("minimum stays read in months from four weeks up and in days below", () => {
  assert.equal(minStay("en", 121), "4 mo min");
  assert.equal(minStay("pl", 121), "min. 4 miesiące");
  assert.equal(minStay("pl", 30), "min. 1 miesiąc");
  assert.equal(minStay("en", 7), "7 days min");
  assert.equal(minStay("en", null), null);
});
