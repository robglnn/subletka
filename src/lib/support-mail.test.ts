import assert from "node:assert/strict";
import { test } from "node:test";
import { supportEmail } from "./support-mail";

const base = {
  id: "0b7c2f4e-0000-4000-8000-000000000001",
  email: "ola@example.com",
  message: "Ogłoszenie ma zdjęcia z innego miasta.",
  lang: "pl" as const,
  delivery: "pending" as const,
  deliveryError: null,
  createdAt: new Date("2026-10-15T00:00:00Z"),
  deliveredAt: null,
};

test("a listing report replies to the sender and links the listing in the sender's language", () => {
  assert.deepEqual(supportEmail({ ...base, listingId: "sub:Ab3_x-9Z" }, "support@subletka.com", "https://subletka.com"), {
    from: { name: "Subletka", address: "no-reply@subletka.com" },
    to: "support@subletka.com",
    replyTo: "ola@example.com",
    subject: "subletka: listing report sub:Ab3_x-9Z",
    text: [
      "Ogłoszenie ma zdjęcia z innego miasta.",
      "",
      "--",
      "from: ola@example.com",
      "listing: https://subletka.com/pl/l/sub%3AAb3_x-9Z",
      "lang: pl",
      "id: 0b7c2f4e-0000-4000-8000-000000000001",
    ].join("\n"),
  });
});

test("a general message names the sender in the subject and has no listing line", () => {
  const mail = supportEmail({ ...base, listingId: null }, "inbox@example.org", "https://subletka.com");
  assert.equal(mail.subject, "subletka: message from ola@example.com");
  assert.equal(mail.to, "inbox@example.org");
  assert.equal(mail.text.includes("listing:"), false);
});
