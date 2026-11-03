import assert from "node:assert/strict";
import { test } from "node:test";
import type { Listing } from "./domain";
import { findForbidden } from "./forbidden-copy";
import type { PhotoKey } from "./photo";
import { shareCard, shareImagePath, shareVersion } from "./share-image";

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: "AbCdEfGhIjKlMnOp",
  origin: "imported",
  city: "warszawa",
  district: "Mokotów",
  lat: 52.19,
  lng: 21.03,
  description: "Jasne mieszkanie.",
  textLang: "pl",
  price: { amount: 820, currency: "EUR", period: "month", billsIncluded: true, startingAt: false },
  deposit: null,
  cancellation: null,
  additionalCosts: null,
  availableFrom: null,
  availableTo: null,
  minStayDays: 30,
  placeType: "whole_place",
  rooms: 1,
  areaM2: 38,
  roommates: null,
  furnished: true,
  petsAllowed: false,
  photos: ["IcOUAiuq6mQaH9Xbb_6-hN" as PhotoKey, "ZzOUAiuq6mQaH9Xbb_6-hN" as PhotoKey],
  postedAt: new Date("2026-10-15T00:00:00Z"),
  areaBadge: false,
  minutesToCentre: 17,
  ...over,
});

test("share cards carry the first photo, the card title and the monthly price only", () => {
  const pl = shareCard("pl", listing({ price: { amount: 200, currency: "EUR", period: "week", billsIncluded: false, startingAt: false } }))!;
  assert.equal(pl.photo, "IcOUAiuq6mQaH9Xbb_6-hN");
  assert.deepEqual(Object.keys(pl).sort(), ["photo", "price", "title", "unit"]);
  assert.match(`${pl.price}${pl.unit}`, /mies/);
  assert.doesNotMatch(`${pl.price}${pl.unit}`, /tydz|week/);
  for (const lang of ["pl", "en"] as const) {
    const card = shareCard(lang, listing())!;
    assert.deepEqual(findForbidden(`${card.title} ${card.price}${card.unit}`), []);
    assert.doesNotMatch(card.price, /\u202f/);
  }
});

test("listings without photos keep the site share image", () => {
  assert.equal(shareCard("pl", listing({ photos: [] })), null);
});

test("share image urls change when the photo, title or price changes", () => {
  const card = shareCard("en", listing())!;
  assert.match(shareImagePath("en", "AbCdEfGhIjKlMnOp", card), /^\/share\/en\/AbCdEfGhIjKlMnOp\.jpg\?v=[A-Za-z0-9_-]{10}$/);
  assert.equal(shareVersion(card), shareVersion({ ...card }));
  assert.notEqual(shareVersion(card), shareVersion({ ...card, price: "€900" }));
  assert.notEqual(shareVersion(card), shareVersion({ ...card, photo: "ZzOUAiuq6mQaH9Xbb_6-hN" as PhotoKey }));
});
