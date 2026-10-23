import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DistrictLinks, GlanceStrip } from "@/components/glance-strip";
import { JsonLd } from "@/components/json-ld";
import { CARD_SIZES, ListingGrid } from "@/components/listing-card";
import { PlaceKindLinks } from "@/components/place-kind";
import { ResultsLayout, type MapPoint } from "@/components/results-map";
import { SectionLabel } from "@/components/section-label";
import { browse, cityGlance } from "@/db/listings";
import { districtMinutes } from "@/lib/area";
import { approximateLocation, districtBySlug, isCity, isLocale, placeKind } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { filterQuery, isFiltered, kindHrefs } from "@/lib/filter-query";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { plural, priceView } from "@/lib/i18n/format";
import { districtJsonLd } from "@/lib/json-ld";
import { routes } from "@/lib/routes";
import { Filters } from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo";

const resolve = async (params: PageProps<"/[lang]/[city]/[district]">["params"]) => {
  const { lang, city, district: slug } = await params;
  if (!isLocale(lang) || !isCity(city)) return null;
  const district = districtBySlug(city, slug);
  return district ? { lang, city, district } : null;
};

export async function generateMetadata({ params }: PageProps<"/[lang]/[city]/[district]">): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return {};
  const { lang, city, district } = found;
  const t = getDictionary(lang);
  return pageMetadata(
    lang,
    `/${city}/${district.slug}`,
    fill(t.district.title, { district: district.name, city: t.cities[city] }),
    fill(t.district.intro, { district: district.name }),
  );
}

export default async function DistrictPage({ params, searchParams }: PageProps<"/[lang]/[city]/[district]">) {
  const found = await resolve(params);
  if (!found) notFound();
  const { lang, city, district } = found;
  const t = getDictionary(lang);
  const f = Filters.parse(await searchParams);
  const [{ listings, total }, glance] = await Promise.all([browse({ ...f, city, district: district.name }), cityGlance(city, district.name)]);
  const minutes = glance.minutes ?? districtMinutes(city, district.slug);
  const points: MapPoint[] = listings.flatMap((l) => {
    const at = approximateLocation(l)?.center;
    return at ? [{ id: l.id, lat: at[0], lng: at[1], label: priceView(lang, l).main, href: routes.listing(lang, l.id) }] : [];
  });
  const moreQuery = filterQuery({ ...f, page: f.page + 1 }).toString();
  const here = routes.district(lang, city, district.slug);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
      <JsonLd graph={districtJsonLd(city, district, lang, siteUrl(), listings.slice(0, 24), total)} />
      <div className="flex flex-col gap-2">
        <Link href={routes.city(lang, city)} className="inline-flex h-11 w-fit items-center text-sm font-semibold">
          ← {t.cities[city]}
        </Link>
        <SectionLabel as="h1" className="text-4xl sm:text-5xl">
          {district.name.toLowerCase()}
        </SectionLabel>
        <p className="max-w-prose text-base text-muted-foreground">{fill(t.district.intro, { district: district.name })}</p>
      </div>
      <GlanceStrip lang={lang} glance={{ total: glance.total, lowest: glance.lowest, medianPln: glance.medianPln, minutes: minutes === null ? null : Math.round(minutes) }} />
      <PlaceKindLinks
        value={placeKind(f.type)}
        hrefs={kindHrefs(here, f)}
        labels={{ label: t.filters.type, kinds: t.filters.kinds }}
        className="sm:w-fit sm:[&>*]:flex-none"
      />
      {total === 0 ? (
        <div className="flex flex-col items-start gap-5 py-10">
          <p className="font-condensed text-3xl font-bold tracking-tight">{isFiltered(f) ? t.results.emptyFiltered : t.district.empty}</p>
          <Link
            href={routes.city(lang, city)}
            className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground"
          >
            {t.district.emptyCta}
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold">{plural(lang, t.results.count, total)}</p>
          <ResultsLayout points={points} labels={t.results}>
            <ListingGrid listings={listings} lang={lang} sizes={CARD_SIZES.results} className="lg:grid-cols-2" />
            {listings.length < total && f.page < 50 && (
              <Link href={`${here}?${moreQuery}`} scroll={false} className="mt-8 flex h-12 items-center justify-center rounded-xl bg-secondary text-base font-semibold">
                {t.results.more}
              </Link>
            )}
          </ResultsLayout>
        </>
      )}
      <div className="border-t border-border pt-6">
        <DistrictLinks lang={lang} city={city} current={district.slug} />
      </div>
    </div>
  );
}
