import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CARD_SIZES, ListingGrid } from "@/components/listing-card";
import { SectionLabel } from "@/components/section-label";
import { listingsByIds } from "@/db/listings";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { parseSaved, SAVED_COOKIE } from "@/lib/saved";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/saved">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { ...pageMetadata(lang, "/saved", getDictionary(lang).meta.savedTitle), robots: { index: false } };
}

export default async function SavedPage({ params }: PageProps<"/[lang]/saved">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const ids = parseSaved((await cookies()).get(SAVED_COOKIE)?.value);
  const listings = await listingsByIds(ids);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <SectionLabel as="h1" className="text-4xl sm:text-5xl">
        {t.saved.title}
      </SectionLabel>
      {listings.length ? (
        <ListingGrid listings={listings} lang={lang} sizes={CARD_SIZES.saved} className="lg:grid-cols-4" />
      ) : (
        <p className="max-w-md text-lg text-muted-foreground">{t.saved.empty}</p>
      )}
    </div>
  );
}
