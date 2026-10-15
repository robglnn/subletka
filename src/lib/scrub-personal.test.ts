import assert from "node:assert/strict";
import { test } from "node:test";
import { scrubPersonal } from "./scrub-personal";

test("phone numbers are stripped in the usual Polish and international forms", () => {
  assert.equal(scrubPersonal("Jasny pokój, dzwoń 600 100 200."), "Jasny pokój.");
  assert.equal(scrubPersonal("Tel. +48 600-100-200, najlepiej wieczorem"), "najlepiej wieczorem");
  assert.equal(scrubPersonal("WhatsApp: +48600100200"), null);
  assert.equal(scrubPersonal("call (22) 123 45 67 or text 0048 512 345 678"), null);
  assert.equal(scrubPersonal("Blisko hotel 600 100 200"), "Blisko hotel");
});

test("emails and introduced names are stripped, with the sentence left readable", () => {
  assert.equal(scrubPersonal("Jasny pokój. Mam na imię Anna, pisz na anna.k@example.com."), "Jasny pokój.");
  assert.equal(scrubPersonal("Bright room near the metro. My name is John Smith."), "Bright room near the metro.");
  assert.equal(scrubPersonal("Pytaj o Kasię, 512 345 678"), null);
  assert.equal(scrubPersonal("Nice flat.\nCheers, Tom"), "Nice flat.");
  assert.equal(scrubPersonal("Duży pokój.\nPozdrawiam, Marta"), "Duży pokój.");
});

test("prices, dates, areas, districts and ordinary words survive", () => {
  const text = "Pokój 14 m² na Mokotowie, 2 400 zł/mies., od 01.11.2026 do 31.01.2027 (2026-11-01). Telefon w cenie internetu? Nie, ale Wi-Fi tak. Call Center 5 min.";
  assert.equal(scrubPersonal(text), text);
  assert.equal(scrubPersonal(null), null);
  assert.equal(scrubPersonal(""), "");
});
