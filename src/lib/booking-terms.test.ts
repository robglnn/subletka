import assert from "node:assert/strict";
import { test } from "node:test";
import { depositAmount, depositOf, importedCancellation } from "./booking-terms";
import { CANCELLATIONS } from "./domain";
import { getDictionary } from "./i18n/dictionaries";
import { plural } from "./i18n/format";
import { depositColumns, depositTermOf, NativeForm } from "./native-form";

test("a policy maps by its free-cancellation days, so a 14-day 'Flexible' is the middle term", () => {
  assert.equal(importedCancellation("Friendly (7-days)"), "flexible");
  assert.equal(importedCancellation("Flexible (14-days)"), "moderate");
  assert.equal(importedCancellation(" Strict (30-days) "), "strict");
  assert.equal(importedCancellation("Strict (30 days)"), "strict");
});

test("a bare vocabulary word maps to itself and anything else stays unknown, so its row is hidden", () => {
  assert.equal(importedCancellation("Moderate"), "moderate");
  assert.equal(importedCancellation("neighbourly"), null);
  assert.equal(importedCancellation("full refund up to 14 days before"), null);
  assert.equal(importedCancellation(""), null);
  assert.equal(importedCancellation(null), null);
});

test("a zero deposit reads as none, months win over an amount, and a missing deposit is unknown", () => {
  assert.deepEqual(depositOf(0, null), { kind: "none" });
  assert.deepEqual(depositOf(null, 2), { kind: "months", months: 2 });
  assert.deepEqual(depositOf(500, null), { kind: "amount", amount: 500 });
  assert.equal(depositOf(null, null), null);
  assert.deepEqual([depositAmount({ kind: "none" }, 3000), depositAmount({ kind: "months", months: 2 }, 3000), depositAmount(null, 3000)], [0, 6000, null]);
});

test("the vocabulary is the owner's one or two words in each language", () => {
  const pl = getDictionary("pl").listing;
  const en = getDictionary("en").listing;
  assert.deepEqual(CANCELLATIONS.map((c) => [pl.cancellationTerms[c], en.cancellationTerms[c]]), [
    ["elastyczna", "flexible"],
    ["umiarkowana", "moderate"],
    ["ścisła", "strict"],
  ]);
  assert.deepEqual([pl.depositNone, en.depositNone], ["brak", "none"]);
  assert.deepEqual([1, 2, 5].map((n) => plural("pl", pl.depositMonths, n)), ["1 miesiąc", "2 miesiące", "5 miesięcy"]);
  assert.deepEqual([1, 2].map((n) => plural("en", en.depositMonths, n)), ["1 month", "2 months"]);
});

const form = {
  website: "",
  availableFrom: "2026-11-15",
  price: "700",
  bills: "",
  furnished: "",
  pets: "",
  city: "krakow",
  district: "Kazimierz",
  placeType: "whole_place",
  contactEmail: "ola@example.com",
};

test("the post form takes only the fixed vocabulary and round-trips each deposit choice", () => {
  assert.equal(NativeForm.safeParse({ ...form, cancellationPolicy: "strict" }).data?.cancellationPolicy, "strict");
  assert.equal(NativeForm.safeParse({ ...form, cancellationPolicy: "full refund 14 days before" }).success, false);
  const amountMissing = NativeForm.safeParse({ ...form, depositTerm: "amount", deposit: "" });
  assert.deepEqual(amountMissing.error?.issues.map((i) => i.path[0]), ["deposit"]);
  for (const [term, deposit, columns] of [
    ["none", "", { deposit: 0, depositMonths: null }],
    ["2", "", { deposit: null, depositMonths: 2 }],
    ["amount", "1500", { deposit: 1500, depositMonths: null }],
    ["", "", { deposit: null, depositMonths: null }],
  ] as const) {
    const parsed = NativeForm.parse({ ...form, depositTerm: term, deposit });
    assert.deepEqual(depositColumns(parsed), columns);
    assert.equal(depositTermOf(columns.deposit, columns.depositMonths), term);
  }
});
