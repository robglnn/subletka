import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq, like } from "drizzle-orm";
import { runMigrations } from "../instrumentation-node";
import { db } from "./index";
import { supportMessages } from "./schema";
import { purgeSupportMessages, recordDelivery, saveSupportMessage } from "./support";

const url = process.env.DATABASE_URL;
const TAG = "qa-support-";
const clean = () => db.delete(supportMessages).where(like(supportMessages.email, `${TAG}%`));
const read = async (id: string) => {
  const [row] = await db.select().from(supportMessages).where(eq(supportMessages.id, id));
  return { delivery: row.delivery, deliveryError: row.deliveryError, delivered: row.deliveredAt !== null };
};

before(async () => {
  if (!url) return;
  await runMigrations(url);
  await clean();
});
after(async () => {
  if (url) await clean();
  await db.$client.end();
});

test("a message is stored as pending before any delivery is attempted", { skip: !url && "needs DATABASE_URL" }, async () => {
  const row = await saveSupportMessage({ email: `${TAG}a@example.com`, message: "Zdjęcia nie pasują do opisu.", listing: "sub:Ab3_x-9Z" }, "pl");
  const [stored] = await db.select().from(supportMessages).where(eq(supportMessages.id, row.id));
  assert.deepEqual(
    { email: stored.email, message: stored.message, listingId: stored.listingId, lang: stored.lang, delivery: stored.delivery },
    { email: `${TAG}a@example.com`, message: "Zdjęcia nie pasują do opisu.", listingId: "sub:Ab3_x-9Z", lang: "pl", delivery: "pending" },
  );
});

test("a failed delivery keeps the message with its error, a later success clears it", { skip: !url && "needs DATABASE_URL" }, async () => {
  const row = await saveSupportMessage({ email: `${TAG}b@example.com`, message: "The listing photos look stolen.", listing: null }, "en");
  await recordDelivery(row.id, { ok: false, error: "route1.mx.cloudflare.net: connection timeout" });
  assert.deepEqual(await read(row.id), { delivery: "failed", deliveryError: "route1.mx.cloudflare.net: connection timeout", delivered: false });
  await recordDelivery(row.id, { ok: true });
  assert.deepEqual(await read(row.id), { delivery: "sent", deliveryError: null, delivered: true });
});

test("a delivered message is purged 30 days after delivery and an undelivered one 90 days after it arrived", { skip: !url && "needs DATABASE_URL" }, async () => {
  const day = 86_400_000;
  const now = new Date("2026-12-31T12:00:00Z");
  const at = (days: number) => new Date(now.getTime() - days * day);
  const rows = await db
    .insert(supportMessages)
    .values([
      { email: `${TAG}sent-old@example.com`, message: "x".repeat(20), lang: "pl", delivery: "sent", createdAt: at(31), deliveredAt: at(31) },
      { email: `${TAG}sent-new@example.com`, message: "x".repeat(20), lang: "pl", delivery: "sent", createdAt: at(40), deliveredAt: at(29) },
      { email: `${TAG}failed-old@example.com`, message: "x".repeat(20), lang: "en", delivery: "failed", createdAt: at(91) },
      { email: `${TAG}failed-new@example.com`, message: "x".repeat(20), lang: "en", delivery: "failed", createdAt: at(60) },
    ])
    .returning({ id: supportMessages.id, email: supportMessages.email });
  await purgeSupportMessages(now);
  const left = await db.select({ email: supportMessages.email }).from(supportMessages).where(like(supportMessages.email, `${TAG}%-%@example.com`));
  assert.deepEqual(left.map((r) => r.email).sort(), [`${TAG}failed-new@example.com`, `${TAG}sent-new@example.com`]);
  assert.equal(rows.length, 4);
});
