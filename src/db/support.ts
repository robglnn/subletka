import "server-only";
import { and, eq, lt, ne, or } from "drizzle-orm";
import type { Locale } from "@/lib/domain";
import type { Delivery } from "@/lib/support-mail";
import type { SupportValues } from "@/lib/support-form";
import { db } from "./index";
import { supportMessages, type SupportMessage } from "./schema";

export const SENT_RETENTION_DAYS = 30;
export const UNSENT_RETENTION_DAYS = 90;

const daysAgo = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000);

export async function purgeSupportMessages(now = new Date()) {
  const purged = await db
    .delete(supportMessages)
    .where(
      or(
        and(eq(supportMessages.delivery, "sent"), lt(supportMessages.deliveredAt, daysAgo(SENT_RETENTION_DAYS, now))),
        and(ne(supportMessages.delivery, "sent"), lt(supportMessages.createdAt, daysAgo(UNSENT_RETENTION_DAYS, now))),
      ),
    )
    .returning({ id: supportMessages.id });
  return purged.length;
}

export async function saveSupportMessage(v: SupportValues, lang: Locale): Promise<SupportMessage> {
  await purgeSupportMessages();
  const [row] = await db.insert(supportMessages).values({ email: v.email, message: v.message, listingId: v.listing, lang }).returning();
  return row;
}

export async function recordDelivery(id: string, result: Delivery) {
  await db
    .update(supportMessages)
    .set(
      result.ok
        ? { delivery: "sent", deliveryError: null, deliveredAt: new Date() }
        : { delivery: "failed", deliveryError: result.error.slice(0, 1000) },
    )
    .where(eq(supportMessages.id, id));
}
