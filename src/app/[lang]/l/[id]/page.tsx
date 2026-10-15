import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { DoorOpen, PawPrint, Receipt, Ruler, Sofa, type LucideIcon } from "lucide-react";
import { AreaBadge } from "@/components/area-badge";
import { ListingPhoto } from "@/components/listing-card";
import { ContactButton, type ContactTarget } from "@/components/listing/contact-button";
import { Description } from "@/components/listing/description";
import { Gallery } from "@/components/listing/gallery";
import { LocationMap } from "@/components/listing/location-map";
import { SaveButton } from "@/components/save-button";
import { betterNearby, getActiveListing } from "@/db/listings";
import { approximateLocation, findDistrict, isLocale, type Listing, type Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import {
  availability,
  formatDate,
  formatMoney,
  listingTitle,
  minStay,
  plural,
  priceView,
  roommatesLine,
} from "@/lib/i18n/format";
import { displayMoney, roundMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";

const load = async (params: PageProps<"/[lang]/l/[id]">["params"]) => {
  const { lang, id } = await params;
  if (!isLocale(lang)) return null;
  const requested = decodeURIComponent(id);
  const listing = await getActiveListing(requested);
  return listing ? { lang, listing, canonical: listing.id === requested } : null;
};

export async function generateMetadata({ params }: PageProps<"/[lang]/l/[id]">): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const { lang, listing } = found;
  const t = getDictionary(lang);
  const price = priceView(lang, listing);
  const description = `${t.listing.available} ${availability(lang, listing)} · ${price.main}${price.unit}`;
  return pageMetadata(lang, `/l/${encodeURIComponent(listing.id)}`, `${listingTitle(lang, listing)} · ${t.cities[listing.city]}`, description);
}

type Amenity = { icon: LucideIcon; label: string };

const amenities = (lang: Locale, l: Listing): Amenity[] => {
  const t = getDictionary(lang).listing;
  const yesNo = (v: boolean | null, labels: { yes: string; no: string }) => (v === null ? null : v ? labels.yes : labels.no);
  const rows: [LucideIcon, string | null][] = [
    [Sofa, yesNo(l.furnished, t.furnished)],
    [PawPrint, yesNo(l.petsAllowed, t.pets)],
    [Receipt, yesNo(l.price.billsIncluded, t.bills)],
    [Ruler, l.areaM2 ? fill(t.area, { n: Math.round(l.areaM2) }) : null],
    [DoorOpen, l.rooms && l.placeType === "whole_place" ? plural(lang, t.rooms, l.rooms) : null],
  ];
  return rows.flatMap(([icon, label]) => (label ? [{ icon, label }] : []));
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

const depositText = (lang: Locale, l: Listing) => {
  const t = getDictionary(lang).listing;
  if (!l.deposit) return null;
  if (l.deposit.kind === "none") return t.depositNone;
  if (l.deposit.kind === "months") return plural(lang, t.depositMonths, l.deposit.months);
  return formatMoney(lang, { amount: l.deposit.amount, currency: l.price.currency });
};

const hostText = (text: string | null) => (text ? <span data-host-text>{text}</span> : null);

export default async function ListingPage({ params }: PageProps<"/[lang]/l/[id]">) {
  const found = await load(params);
  if (!found) notFound();
  const { lang, listing } = found;
  if (!found.canonical) permanentRedirect(routes.listing(lang, listing.id));
  const t = getDictionary(lang);
  const title = listingTitle(lang, listing);
  const price = priceView(lang, listing);
  const stay = minStay(lang, listing.minStayDays);
  const roommates = roommatesLine(lang, listing);
  const prefers = listing.roommates?.preferredTenantGender;
  const place = listing.district ? `${listing.district}, ${t.cities[listing.city]}` : t.cities[listing.city];
  const imported = listing.origin === "imported";
  const target: ContactTarget = imported
    ? { kind: "imported", href: routes.original(listing.id) }
    : { kind: "native", href: routes.lister(lang, listing.id), reveal: routes.lister(lang, listing.id, true) };
  const facts = [t.listing.placeType[listing.placeType], stay].filter(Boolean).join(" · ");
  const known = amenities(lang, listing);
  const area = approximateLocation(listing);
  const official = listing.district ? findDistrict(listing.city, listing.district) : null;
  const alt = await betterNearby(listing.id);
  const nudge = alt && [
    `${fill(t.area.nudge, { amount: formatMoney(lang, roundMoney(displayMoney({ amount: alt.morePln, currency: "PLN" }, lang))) })}: ${listingTitle(lang, alt.listing)}`,
    alt.listing.areaBadge ? t.area.badge : null,
    alt.listing.minutesToCentre === null ? null : fill(t.area.minutes, { n: alt.listing.minutesToCentre }),
  ]
    .filter(Boolean)
    .join(", ");
  const bills = listing.price.billsIncluded === null ? null : listing.price.billsIncluded ? t.listing.bills.yes : t.listing.bills.no;
  const terms = (
    [
      [t.listing.cancellation, listing.cancellation ? t.listing.cancellationTerms[listing.cancellation] : null],
      [t.listing.additionalCosts, hostText(listing.additionalCosts) ?? bills],
      [t.listing.deposit, depositText(lang, listing)],
      [t.listing.posted, listing.postedAt ? formatDate(lang, listing.postedAt) : null],
    ] satisfies [string, React.ReactNode][]
  ).filter(([, v]) => v !== null);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-0 pb-32 sm:px-6 sm:pt-6 md:pb-0">
      <div className="relative">
        {listing.photos.length > 0 ? (
          <Gallery
            photos={listing.photos}
            alt={title}
            labels={{ allPhotos: t.listing.allPhotos, photoOf: t.listing.photoOf, close: t.nav.close }}
          />
        ) : (
          <ListingPhoto src={undefined} alt={title} sizes="100vw" className="-mx-4 aspect-[4/3] sm:mx-0 md:aspect-[3/1]" />
        )}
        <SaveButton id={listing.id} labels={{ save: t.listing.save, unsave: t.listing.unsave }} className="absolute top-2 -right-2 bg-black/25 sm:right-2" />
      </div>

      <div className="mt-6 grid gap-10 md:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-4xl sm:text-5xl">
              {title}
              {listing.areaBadge && <AreaBadge label={t.area.badge} tipAlign="end" className="-my-3 ml-0.5 align-middle" />}
            </h1>
            <p className="text-lg">
              {t.listing.available} <strong>{availability(lang, listing)}</strong>
            </p>
            {listing.minutesToCentre !== null && <p className="text-lg">{fill(t.area.minutes, { n: listing.minutesToCentre })}</p>}
            <p className="text-base md:hidden">
              <strong>
                {price.main}
                {price.unit}
              </strong>
            </p>
            <p className="text-base md:hidden">{facts}</p>
            {roommates && (
              <p className="text-base text-muted-foreground">
                {roommates}
                {prefers ? ` · ${t.listing.prefers[prefers]}` : ""}
              </p>
            )}
          </header>

          {listing.description && (
            <Section title={t.listing.about}>
              <Description
                text={listing.description}
                lang={listing.textLang ?? undefined}
                labels={{ more: t.listing.showMore, less: t.listing.showLess }}
              />
            </Section>
          )}

          {known.length > 0 && (
            <Section title={t.listing.amenities}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {known.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-3 text-base">
                    <Icon className="size-5 shrink-0" strokeWidth={1.6} />
                    {label}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={t.listing.location}>
            <p className="text-base font-semibold">
              {official ? (
                <>
                  <Link href={routes.district(lang, listing.city, official.slug)} className="underline underline-offset-4">
                    {official.name}
                  </Link>
                  , {t.cities[listing.city]}
                </>
              ) : (
                place
              )}
            </p>
            {area && <LocationMap center={area.center} radiusM={area.radiusM} label={place} />}
            <p className="text-sm text-muted-foreground">{t.listing.locationNote}</p>
            {alt && nudge && (
              <Link href={routes.listing(lang, alt.listing.id)} className="text-base underline-offset-4 hover:underline">
                {nudge} →
              </Link>
            )}
          </Section>

          <Section title={t.listing.terms}>
            {terms.length > 0 && (
              <dl className="flex flex-col text-base">
                {terms.map(([k, v]) => (
                  <div key={k} className="flex min-h-12 items-baseline justify-between gap-6 border-b border-border py-3 last:border-b-0">
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link href={routes.contact(lang, listing.id)} className="inline-flex h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4">
              {t.listing.report}
            </Link>
          </Section>
        </div>

        <aside className="hidden md:block">
          <div className="sticky top-20 flex flex-col gap-4 rounded-2xl border border-border p-6 shadow-sm">
            <p>
              <span className="font-condensed text-4xl font-bold">{price.main}</span>
              <span className="text-muted-foreground">{price.unit}</span>
            </p>
            <p className="text-sm">{facts}</p>
            <ContactButton target={target} label={t.listing.want} newTab />
            {!imported && <p className="text-xs text-muted-foreground">{t.listing.nativeNote}</p>}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="flex flex-col gap-2">
          <p className="whitespace-nowrap">
            <span className="text-lg font-bold">{price.main}</span>
            <span className="text-sm text-muted-foreground">{price.unit}</span>
          </p>
          <ContactButton target={target} label={t.listing.want} />
        </div>
      </div>
    </div>
  );
}
