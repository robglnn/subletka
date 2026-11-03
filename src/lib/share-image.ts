import { createHash } from "node:crypto";
import type { Listing, Locale } from "@/lib/domain";
import { listingTitle, priceView } from "@/lib/i18n/format";

export const SHARE_SIZE = { width: 1200, height: 630 } as const;

export type ShareCard = { photo: Listing["photos"][number]; title: string; price: string; unit: string };

export const shareCard = (lang: Locale, listing: Listing): ShareCard | null => {
  const photo = listing.photos[0];
  if (!photo) return null;
  const { main, unit } = priceView(lang, listing);
  return { photo, title: listingTitle(lang, listing), price: main, unit };
};

export const shareVersion = (card: ShareCard) =>
  createHash("sha256").update(JSON.stringify([card.photo, card.title, card.price, card.unit])).digest("base64url").slice(0, 10);

export const shareImagePath = (lang: Locale, id: string, card: ShareCard) =>
  `/share/${lang}/${encodeURIComponent(id)}.jpg?v=${shareVersion(card)}`;
