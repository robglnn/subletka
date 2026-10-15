import "server-only";
import type { Metadata } from "next";
import { LOCALE_TAG, LOCALES, type City, type Locale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { formatMoney, plural } from "@/lib/i18n/format";
import { displayMoney, roundMoney } from "@/lib/money";

export const pageMetadata = (lang: Locale, path: string, title: string, description?: string): Metadata => {
  const site = siteUrl();
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${site}/${l}${path}`]));
  return {
    title,
    description,
    alternates: { canonical: `${site}/${lang}${path}`, languages: { ...languages, "x-default": `${site}/pl${path}` } },
    openGraph: {
      title,
      description,
      url: `${site}/${lang}${path}`,
      siteName: "Subletka",
      locale: LOCALE_TAG[lang].replace("-", "_"),
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Subletka" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
};

export type CityStats = { total: number; medianPln: number | null };

export const cityDescription = (lang: Locale, city: City, { total, medianPln }: CityStats) => {
  const t = getDictionary(lang).meta;
  const lead = `${total ? plural(lang, t.cityListings, total) : t.cityListingsNone} ${t.cityIn[city]}.`;
  if (medianPln === null) return lead;
  const median = roundMoney(displayMoney({ amount: medianPln, currency: "PLN" }, lang));
  return `${lead} ${fill(t.cityMedian, { amount: formatMoney(lang, median) })}`;
};
