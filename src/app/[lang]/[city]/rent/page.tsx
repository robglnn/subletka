import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/section-label";
import { rentByCity } from "@/db/rent";
import { isCity, isLocale, PLACE_FILTERS, type Locale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { rentPath } from "@/lib/hubs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { formatDate, formatMedian, formatMoney, formatNumber, plural } from "@/lib/i18n/format";
import { rentJsonLd } from "@/lib/json-ld";
import type { RentGroup } from "@/lib/rent-stats";
import { routes } from "@/lib/routes";
import { pageMetadata, rentAsOf, rentDescription } from "@/lib/seo";

const resolve = async (params: PageProps<"/[lang]/[city]/rent">["params"]) => {
  const { lang, city } = await params;
  return isLocale(lang) && isCity(city) ? { lang, city } : null;
};

export async function generateMetadata({ params }: PageProps<"/[lang]/[city]/rent">): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return {};
  const { lang, city } = found;
  await connection();
  return pageMetadata(lang, rentPath(city), getDictionary(lang).rent.metaTitle[city], rentDescription(lang, await rentByCity(city), new Date()));
}

const cells = (lang: Locale, g: RentGroup) => ({
  listings: formatNumber(lang, g.listings),
  median: g.medianPln === null ? "—" : formatMedian(lang, g.medianPln),
  lowest: g.lowest ? formatMoney(lang, g.lowest) : "—",
});

const th = "py-2 pr-3 text-left text-xs font-semibold text-muted-foreground sm:text-sm";
const thNum = "py-2 pl-3 text-right text-xs font-semibold text-muted-foreground sm:text-sm";
const td = "py-3 pr-3 text-left";
const tdNum = "py-3 pl-3 text-right whitespace-nowrap tabular-nums";

export default async function RentPage({ params }: PageProps<"/[lang]/[city]/rent">) {
  const found = await resolve(params);
  if (!found) notFound();
  const { lang, city } = found;
  await connection();
  const t = getDictionary(lang);
  const today = new Date();
  const rent = await rentByCity(city);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
      <JsonLd graph={rentJsonLd(rent, lang, siteUrl(), today)} />
      <div className="flex flex-col gap-2">
        <Link href={routes.city(lang, city)} className="inline-flex h-11 w-fit items-center text-sm font-semibold">
          ← {t.cities[city]}
        </Link>
        <SectionLabel as="h1" className="text-4xl sm:text-5xl">
          {t.rent.title[city]}
        </SectionLabel>
        <p className="max-w-prose text-base text-muted-foreground">
          {plural(lang, t.rent.lead, rent.all.listings)} {fill(t.rent.asOf, { date: formatDate(lang, rentAsOf(rent, today)) })}
        </p>
      </div>
      <section className="flex flex-col gap-2">
        <SectionLabel>{t.rent.byKind}</SectionLabel>
        <table className="w-full border-collapse text-base">
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={th}>
                {t.rent.kind}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.listings}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.median}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.lowest}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PLACE_FILTERS.map((k) => {
              const c = cells(lang, rent.kinds[k]);
              return (
                <tr key={k}>
                  <th scope="row" className={`${td} font-semibold`}>
                    {t.filters.types[k]}
                  </th>
                  <td className={tdNum}>{c.listings}</td>
                  <td className={`${tdNum} font-bold`}>{c.median}</td>
                  <td className={tdNum}>{c.lowest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>{t.rent.districts}</SectionLabel>
        <table className="w-full border-collapse text-base">
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={th}>
                {t.rent.district}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.listings}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.median}
              </th>
              <th scope="col" className={thNum}>
                {t.rent.minutes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rent.districts.map((d) => {
              const c = cells(lang, d);
              return (
                <tr key={d.slug}>
                  <th scope="row" className={`${td} font-normal`}>
                    <Link href={routes.district(lang, city, d.slug)} className="underline-offset-4 hover:underline">
                      {d.name}
                    </Link>
                  </th>
                  <td className={tdNum}>{c.listings}</td>
                  <td className={`${tdNum} font-bold`}>{c.median}</td>
                  <td className={tdNum}>{d.minutes === null ? "—" : fill(t.district.minutes, { n: Math.round(d.minutes) })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-sm text-muted-foreground">{t.rent.few}</p>
      </section>
    </div>
  );
}
