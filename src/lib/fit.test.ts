import assert from "node:assert/strict";
import { test } from "node:test";
import { areaFacts, districtAt } from "./area";
import { diversify } from "./diversify";
import { buildingKeys, FIT_WEIGHTS, fitScore, pricePool, type FitInput } from "./fit";

const TODAY = "2026-10-15";

const input = (over: Partial<FitInput> = {}): FitInput => ({
  id: "x",
  origin: "imported",
  city: "warszawa",
  placeType: "whole_place",
  rooms: 1,
  areaM2: 30,
  priceMonthly: 5000,
  priceOutlier: false,
  areaScore: 60,
  minutes: 25,
  photos: 6,
  description: 400,
  hasDeposit: true,
  hasRoommates: false,
  availableFrom: null,
  sourceUpdatedAt: new Date("2026-10-14T00:00:00Z"),
  ...over,
});

test("the best-fit weights are the plan's: value 30, area 25, commute 20, quality 15, freshness 10", () => {
  assert.deepEqual(FIT_WEIGHTS, { value: 30, area: 25, commute: 20, quality: 15, freshness: 10 });
});

test("a cheaper place for its size, a better area, a shorter trip, a fuller listing and a sooner date each raise the fit", () => {
  const pool = [input({ id: "a" }), input({ id: "b", priceMonthly: 6000 }), input({ id: "c", priceMonthly: 4000 })];
  const predict = pricePool(pool);
  const score = (over: Partial<FitInput>) => {
    const l = input(over);
    return fitScore(l, predict(l), TODAY);
  };
  const base = score({});
  assert.ok(score({ priceMonthly: 4000 }) > base);
  assert.ok(score({ areaScore: 85 }) > base);
  assert.ok(score({ minutes: 10 }) > base);
  assert.ok(score({ photos: 1, description: 0, hasDeposit: false }) < base);
  assert.ok(score({ availableFrom: "2027-02-01" }) < base);
  assert.ok(score({ sourceUpdatedAt: null }) < base);
});

test("price outliers do not move the typical price other listings are compared with", () => {
  const typical = [input({ id: "a" }), input({ id: "b" })];
  const outlier = input({ id: "c", priceMonthly: 50_000, priceOutlier: true });
  assert.equal(pricePool([...typical, outlier])(input()), pricePool(typical)(input()));
});

test("a building is every listing within 80 m of the first one placed there, so one a coordinate step apart stays one building, or the source and district without coordinates, or the listing itself", () => {
  const at = (id: string, lat: number | null, lng: number | null, over = {}) => ({ id, origin: "imported" as const, city: "warszawa" as const, source: "s", district: "Praga-Północ", lat, lng, ...over });
  const keys = buildingKeys([
    at("a", 52.24905, 21.03849),
    at("b", 52.24912, 21.03861),
    at("c", 52.2493, 21.0389),
    at("d", 52.2502, 21.0405),
    at("e", null, null),
    at("f", null, null, { origin: "native", source: null }),
    at("g", 52.249, 21.038),
    at("h", 52.249, 21.039),
  ]);
  assert.equal(keys.get("g"), keys.get("h"));
  assert.equal(keys.get("a"), keys.get("b"));
  assert.equal(keys.get("a"), keys.get("c"));
  assert.notEqual(keys.get("a"), keys.get("d"));
  assert.equal(keys.get("e"), "s:Praga-Północ");
  assert.equal(keys.get("f"), "f");
});

test("area facts come from the listing's own spot, fall back to its district, and are empty when neither is known", () => {
  assert.equal(districtAt("warszawa", 52.199, 21.017), "Mokotów");
  assert.equal(districtAt("krakow", 50.0617, 19.9373), "Stare Miasto");
  const centre = areaFacts("warszawa", null, 52.2297, 21.0122);
  assert.ok(centre.badge && centre.minutes !== null && centre.minutes <= 5);
  const edge = areaFacts("warszawa", null, 52.32, 21.0);
  assert.ok(!edge.badge && edge.minutes !== null && edge.minutes > 30);
  assert.deepEqual(areaFacts("krakow", "Krowodrza", null, null), { score: 75, badge: true, minutes: 24 });
  assert.deepEqual(areaFacts("warszawa", "Nowhere", null, null), { score: null, badge: false, minutes: null });
});

test("the diversity pass keeps best-fit order but moves a third card in a row from one building behind the next other one, within its group", () => {
  const item = (id: string, building: string, group = 0, kind = id.startsWith("w") ? "whole" : "room") => ({ id, building, group, kind });
  const order = (xs: ReturnType<typeof item>[], screen = { size: 0, run: 3 }) => diversify(xs, 2, screen).map((x) => x.id).join(" ");
  assert.equal(order([item("a1", "a"), item("a2", "a"), item("a3", "a"), item("a4", "a"), item("b1", "b"), item("c1", "c")]), "a1 a2 b1 a3 a4 c1");
  assert.equal(order([item("a1", "a"), item("a2", "a"), item("a3", "a"), item("b1", "b", 1)]), "a1 a2 a3 b1");
  assert.equal(order([item("a1", "a"), item("b1", "b"), item("a2", "a")]), "a1 b1 a2");
});

test("the first screen mixes rooms and whole places when its group has both", () => {
  const item = (id: string) => ({ id, building: id, group: 0, kind: id.startsWith("w") ? "whole" : "room" });
  const order = (ids: string[]) => diversify(ids.map(item), 2).map((x) => x.id).join(" ");
  assert.equal(order(["w1", "w2", "w3", "w4", "w5", "r1", "w6"]), "w1 w2 w3 r1 w4 w5 w6");
  assert.equal(order(["w1", "w2", "w3", "w4", "w5", "w6", "w7", "r1"]), "w1 w2 w3 r1 w4 w5 w6 w7");
  assert.equal(order(["w1", "w2", "w3", "w4"]), "w1 w2 w3 w4");
});
