import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSupport } from "./support-form";

const message = "Ogłoszenie ma zdjęcia z innego miasta.";

test("a valid message parses with a trimmed email and no listing", () => {
  assert.deepEqual(parseSupport({ email: "  ola@example.com ", message, website: "" }), {
    kind: "message",
    values: { email: "ola@example.com", message, listing: null },
  });
});

test("an email without a domain is rejected and only that field is flagged", () => {
  assert.deepEqual(parseSupport({ email: "ola@", message }), { kind: "invalid", fields: ["email"] });
  assert.deepEqual(parseSupport({ email: "", message }), { kind: "invalid", fields: ["email"] });
});

test("a message needs 20 characters after trimming", () => {
  assert.deepEqual(parseSupport({ email: "ola@example.com", message: `   ${"x".repeat(19)}   ` }), { kind: "invalid", fields: ["message"] });
  assert.equal(parseSupport({ email: "ola@example.com", message: "x".repeat(20) }).kind, "message");
  assert.deepEqual(parseSupport({ email: "ola@example.com", message: "x".repeat(4001) }), { kind: "invalid", fields: ["message"] });
});

test("a filled honeypot is a bot even when the rest is valid or missing", () => {
  assert.deepEqual(parseSupport({ email: "ola@example.com", message, website: "https://spam.example" }), { kind: "bot" });
  assert.deepEqual(parseSupport({ website: "x" }), { kind: "bot" });
});

test("a listing reference is kept when it looks like a public id and dropped otherwise", () => {
  const parse = (listing: string) => {
    const r = parseSupport({ email: "ola@example.com", message, listing });
    return r.kind === "message" ? r.values.listing : r.kind;
  };
  assert.equal(parse("sub:Ab3_x-9Z"), "sub:Ab3_x-9Z");
  assert.equal(parse("kQ9vX2LmP0aB7cDe"), "kQ9vX2LmP0aB7cDe");
  assert.equal(parse("<script>"), null);
  assert.equal(parse(""), null);
});
