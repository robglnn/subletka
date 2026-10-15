import Link from "next/link";
import { AreaBadge } from "@/components/area-badge";
import { Mark } from "@/components/logo";
import { SaveButton } from "@/components/save-button";
import { sticker } from "@/components/sticker";
import type { Listing, Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { photoSrc, photoSrcSet, type PhotoKey } from "@/lib/photo";
import { listingTitle, priceView } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const CARD_SIZES = {
  row: "(min-width: 1024px) 265px, (min-width: 640px) 45vw, 72vw",
  results: "(min-width: 1024px) 300px, (min-width: 480px) 50vw, 100vw",
  saved: "(min-width: 1024px) 265px, (min-width: 480px) 50vw, 100vw",
};

export function ListingPhoto({
  src,
  alt,
  className,
  sizes,
  priority = false,
}: {
  src: PhotoKey | undefined;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <Mark className="size-10 opacity-25 grayscale" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoSrc(src, "card", 640)}
      srcSet={photoSrcSet(src, "card")}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? "sync" : "async"}
      className={cn("object-cover", className)}
    />
  );
}

export function ListingCard({ listing, lang, sizes, priority }: { listing: Listing; lang: Locale; sizes: string; priority?: boolean }) {
  const t = getDictionary(lang);
  const title = listingTitle(lang, listing);
  const price = priceView(lang, listing);
  return (
    <article className="relative">
      <Link
        href={routes.listing(lang, listing.id)}
        className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-muted outline-offset-2"
      >
        <ListingPhoto src={listing.photos[0]} alt="" sizes={sizes} priority={priority} className="absolute inset-0 size-full" />
        <span className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/20" />
        <span className="absolute inset-x-3 top-[52%] flex flex-col items-center gap-1 text-center">
          <span className="text-[1.05rem]">
            <span className={sticker}>{title}</span>
          </span>
          <span className={cn(sticker, "mt-1 text-sm whitespace-nowrap")}>
            {price.main}
            <span className="font-medium">{price.unit}</span>
          </span>
        </span>
      </Link>
      {listing.areaBadge && <AreaBadge label={t.area.badge} className="absolute top-1.5 left-1.5" />}
      <SaveButton id={listing.id} labels={{ save: t.listing.save, unsave: t.listing.unsave }} className="absolute top-1.5 right-1.5 bg-black/20" />
    </article>
  );
}

export function ListingGrid({ listings, lang, sizes, className }: { listings: Listing[]; lang: Locale; sizes: string; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3", className)}>
      {listings.map((l, i) => (
        <ListingCard key={l.id} listing={l} lang={lang} sizes={sizes} priority={i === 0} />
      ))}
    </div>
  );
}

export function EmptyState({ lang, title }: { lang: Locale; title: string }) {
  const t = getDictionary(lang);
  return (
    <div className="flex flex-col items-start gap-5 py-10">
      <p className="font-condensed text-3xl font-bold tracking-tight">{title}</p>
      <Link
        href={routes.post(lang)}
        className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground"
      >
        {t.results.emptyCta}
      </Link>
    </div>
  );
}
