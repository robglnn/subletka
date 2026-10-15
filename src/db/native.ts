import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { findDistrict, type Locale } from "@/lib/domain";
import { listingTitle } from "@/lib/i18n/format";
import { displayMoney, LOCALE_CURRENCY, monthlyPln } from "@/lib/money";
import { depositColumns, depositTermOf, type FormValues, type NativeValues } from "@/lib/native-form";
import { routes } from "@/lib/routes";
import { scrubPersonal } from "@/lib/scrub-personal";
import { db } from "./index";
import { refreshMatching } from "./matching";
import { listings, photos, type ListingInsert, type ListingRow } from "./schema";

export type Upload = { mime: string; bytes: Buffer };

export type ManageAuth = { kind: "token"; token: string } | { kind: "owner"; id: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomId = (bytes: number) => randomBytes(bytes).toString("base64url");

const columns = (v: NativeValues, lang: Locale) => {
  const shared = v.placeType !== "whole_place";
  const price = { amount: v.price, currency: LOCALE_CURRENCY[lang], period: "month" as const, billsIncluded: v.bills };
  const district = findDistrict(v.city, v.district)?.name ?? v.district;
  return {
    city: v.city,
    district,
    title: listingTitle("pl", { placeType: v.placeType, rooms: v.rooms, district, city: v.city }),
    description: scrubPersonal(v.description),
    priceAmount: price.amount,
    priceCurrency: price.currency,
    pricePeriod: price.period,
    priceMonthly: monthlyPln(price),
    billsIncluded: v.bills,
    ...depositColumns(v),
    additionalCosts: scrubPersonal(v.additionalCosts),
    cancellationPolicy: v.cancellationPolicy,
    availableFrom: v.availableFrom,
    availableTo: v.availableTo,
    minStayDays: v.minStayMonths ? v.minStayMonths * 30 : null,
    termKind: v.availableTo ? ("sublet" as const) : ("flexible" as const),
    placeType: v.placeType,
    rooms: v.placeType === "whole_place" ? v.rooms : null,
    roommatesCount: shared ? v.roommatesCount : null,
    roommatesGenders: shared ? v.roommatesGender : null,
    furnished: v.furnished,
    petsAllowed: v.pets,
    contactEmail: v.contactEmail,
  } satisfies Partial<ListingInsert>;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const storePhotos = async (tx: Tx, listingId: string, uploads: Upload[]) => {
  await tx.delete(photos).where(eq(photos.listingId, listingId));
  const rows = uploads.map((u, position) => ({ id: randomId(12), listingId, position, mime: u.mime, bytes: u.bytes }));
  if (rows.length) await tx.insert(photos).values(rows);
  return rows.map((r) => routes.photo(r.id));
};

export async function createNative(v: NativeValues, lang: Locale, uploads: Upload[], ownerEmail: string | null) {
  const id = `sub:${randomId(6)}`;
  const token = randomId(24);
  await db.transaction(async (tx) => {
    await tx.insert(listings).values({
      id,
      publicId: id,
      origin: "native",
      status: "active",
      ...columns(v, lang),
      ownerEmail,
      manageTokenHash: sha256(token),
      postedAt: new Date(),
    });
    const urls = await storePhotos(tx, id, uploads);
    if (urls.length) await tx.update(listings).set({ photos: urls }).where(eq(listings.id, id));
    await refreshMatching(tx, { only: id });
  });
  return { id, token };
}

export async function findManaged(auth: ManageAuth, sessionEmail: string | null): Promise<ListingRow | null> {
  const where =
    auth.kind === "token"
      ? eq(listings.manageTokenHash, sha256(auth.token))
      : sessionEmail
        ? and(eq(listings.id, auth.id), eq(listings.ownerEmail, sessionEmail))
        : null;
  if (!where) return null;
  const [row] = await db.select().from(listings).where(and(where, eq(listings.origin, "native")));
  return row ?? null;
}

export async function updateNative(id: string, v: NativeValues, lang: Locale, uploads: Upload[] | null) {
  await db.transaction(async (tx) => {
    const photoUrls = uploads ? await storePhotos(tx, id, uploads) : undefined;
    await tx
      .update(listings)
      .set({ ...columns(v, lang), ...(photoUrls ? { photos: photoUrls } : {}), updatedAt: new Date() })
      .where(eq(listings.id, id));
    await refreshMatching(tx, { only: id });
  });
}

export async function setStatus(id: string, status: "active" | "removed") {
  await db.update(listings).set({ status, updatedAt: new Date() }).where(eq(listings.id, id));
}

export async function claimByEmail(email: string) {
  await db
    .update(listings)
    .set({ ownerEmail: email })
    .where(
      and(
        eq(listings.origin, "native"),
        isNull(listings.ownerEmail),
        sql`lower(${listings.contactEmail}) = lower(${email})`,
      ),
    );
}

const tri = (b: boolean | null) => (b === null ? "" : b ? "yes" : "no");
const str = (n: number | null) => (n === null ? "" : String(n));

const inFormCurrency = (amount: number | null, r: ListingRow, lang: Locale) =>
  amount === null ? "" : String(displayMoney({ amount, currency: r.priceCurrency }, lang).amount);

export const toFormValues = (r: ListingRow, lang: Locale): FormValues => ({
  city: r.city,
  district: r.district ?? "",
  placeType: r.placeType,
  rooms: str(r.rooms),
  availableFrom: r.availableFrom ?? "",
  availableTo: r.availableTo ?? "",
  minStayMonths: r.minStayDays ? String(Math.round(r.minStayDays / 30)) : "",
  price: inFormCurrency(r.priceAmount, r, lang),
  depositTerm: depositTermOf(r.deposit, r.depositMonths),
  deposit: r.deposit ? inFormCurrency(r.deposit, r, lang) : "",
  bills: tri(r.billsIncluded),
  additionalCosts: r.additionalCosts ?? "",
  cancellationPolicy: r.cancellationPolicy ?? "",
  furnished: tri(r.furnished),
  pets: tri(r.petsAllowed),
  roommatesCount: str(r.roommatesCount),
  roommatesGender: r.roommatesGenders ?? "",
  description: r.description ?? "",
  contactEmail: r.contactEmail ?? "",
});
