import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD_SIZES, EmptyState, ListingGrid } from "@/components/listing-card";
import { ResultsControls } from "@/components/results-controls";
import { ResultsLayout, type MapPoint } from "@/components/results-map";
import { DistrictLinks, GlanceStrip } from "@/components/glance-strip";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/section-label";
import { browse, cityGlance, latest } from "@/db/listings";
import { approximateLocation, CITIES, isCity, isLocale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { cityJsonLd } from "@/lib/json-ld";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { plural, priceView } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";
import { filterQuery, isFiltered } from "@/lib/filter-query";
import { Filters } from "@/lib/search-params";
import { cityDescription, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/[city]">): Promise<Metadata> {
  const { lang, city } = await params;
  if (!isLocale(lang) || !isCity(city)) return {};
  const t = getDictionary(lang).meta;
  return pageMetadata(lang, `/${city}`, t.cityTitle[city], cityDescription(lang, city, await cityGlance(city)));
}

const JSON_LD_ITEMS = 24;

export default async function CityPage({ params, searchParams }: PageProps<"/[lang]/[city]">) {
  const { lang, city } = await params;
  if (!isLocale(lang) || !isCity(city)) notFound();
  const t = getDictionary(lang);
  const f = Filters.parse(await searchParams);
  const [{ listings, total }, glance, top] = await Promise.all([browse({ ...f, city }), cityGlance(city), latest(city, JSON_LD_ITEMS)]);
  const points: MapPoint[] = listings.flatMap((l) => {
    const at = approximateLocation(l)?.center;
    return at ? [{ id: l.id, lat: at[0], lng: at[1], label: priceView(lang, l).main, href: routes.listing(lang, l.id) }] : [];
  });
  const moreQuery = filterQuery({ ...f, page: f.page + 1 }).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
      <JsonLd graph={cityJsonLd(city, lang, siteUrl(), top.listings, top.total)} />
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
        <ResultsControls
          lang={lang}
          city={city}
          cityName={t.cities[city]}
          filters={f}
          total={total}
          labels={{
            filters: t.filters,
            dates: { ...t.search, close: t.nav.close },
            back: t.nav.back,
          }}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionLabel as="h1" className="text-4xl sm:text-5xl">
          {t.meta.cityTitle[city].toLowerCase()}
        </SectionLabel>
        <nav className="flex gap-1">
          {CITIES.filter((c) => c !== city).map((c) => (
            <Link key={c} href={routes.city(lang, c)} className="inline-flex h-11 items-center text-sm font-semibold">
              {t.cities[c]} →
            </Link>
          ))}
        </nav>
      </div>
      <GlanceStrip lang={lang} glance={{ total: glance.total, lowest: glance.lowest, medianPln: glance.medianPln }} />
      <p className="text-sm font-semibold">{plural(lang, t.results.count, total)}</p>
      {total === 0 ? (
        <EmptyState lang={lang} title={isFiltered(f) ? t.results.emptyFiltered : t.results.emptyTitle} />
      ) : (
        <ResultsLayout points={points} labels={t.results}>
          <ListingGrid listings={listings} lang={lang} sizes={CARD_SIZES.results} className="lg:grid-cols-2" />
          {listings.length < total && f.page < 50 && (
            <Link
              href={`${routes.city(lang, city)}?${moreQuery}`}
              scroll={false}
              className="mt-8 flex h-12 items-center justify-center rounded-xl bg-secondary text-base font-semibold"
            >
              {t.results.more}
            </Link>
          )}
        </ResultsLayout>
      )}
      <DistrictLinks lang={lang} city={city} />
      <section className="flex flex-col gap-2 border-t border-border pt-10 md:max-w-3xl">
        <SectionLabel>{t.faq.title}</SectionLabel>
        {t.faq.items.map((item) => (
          <details key={item.q} className="group border-b border-border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-2 text-base font-semibold">
              {item.q}
              <span aria-hidden className="text-xl transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-4 text-base text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
