import assert from "node:assert/strict";
import { test } from "node:test";
import type { Price } from "./domain";
import { priceView } from "./i18n/format";

const price = (p: Partial<Price>): { price: Price } => ({
  price: { amount: 2400, currency: "PLN", period: "month", billsIncluded: null, startingAt: false, ...p },
});

const plain = (s: string) => s.replace(/\s/g, " ");

test("starting prices read 'od' in Polish and 'from' in English, in the language's one currency", () => {
  assert.equal(plain(priceView("pl", price({ startingAt: true })).main), "od 2 400 zł");
  assert.equal(plain(priceView("en", price({ startingAt: true })).main), "from €560");
  assert.equal(plain(priceView("pl", price({ amount: 560, currency: "EUR", startingAt: true })).main), "od 2 390 zł");
  assert.equal(plain(priceView("en", price({ amount: 560, currency: "EUR", startingAt: true })).main), "from €560");
});

test("exact prices carry no prefix", () => {
  assert.equal(plain(priceView("pl", price({})).main), "2 400 zł");
  assert.equal(priceView("en", price({})).unit, "/mo");
});
