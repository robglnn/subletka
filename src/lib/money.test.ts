import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney } from "./i18n/format";
import { displayMoney } from "./money";

test("EUR converts to zł in Polish, rounded to 10", () => {
  assert.deepEqual(displayMoney({ amount: 1257, currency: "EUR" }, "pl"), { amount: 5370, currency: "PLN" });
  assert.equal(formatMoney("pl", { amount: 1257, currency: "EUR" }), "5\u00a0370 zł");
});

test("PLN converts to EUR in English, rounded to 5", () => {
  assert.deepEqual(displayMoney({ amount: 2600, currency: "PLN" }, "en"), { amount: 610, currency: "EUR" });
  assert.equal(formatMoney("en", { amount: 2600, currency: "PLN" }), "€610");
});

test("same-currency amounts are shown exactly", () => {
  assert.deepEqual(displayMoney({ amount: 2600, currency: "PLN" }, "pl"), { amount: 2600, currency: "PLN" });
  assert.deepEqual(displayMoney({ amount: 1257, currency: "EUR" }, "en"), { amount: 1257, currency: "EUR" });
  assert.equal(formatMoney("en", { amount: 1257, currency: "EUR" }), "€1,257");
});
