import { LOCALE_TAG, warsawDay, type Listing, type Locale, type ShownPeriod } from "@/lib/domain";
import { displayMoney, monthlyAmount, roundMoney, type Money } from "@/lib/money";
import { getDictionary, type Plural } from "./dictionaries";
import { fill } from "./fill";

export const plural = (locale: Locale, forms: Plural, n: number) => {
  const rule = new Intl.PluralRules(LOCALE_TAG[locale]).select(n);
  const form = rule === "one" || rule === "few" || rule === "many" ? (forms[rule] ?? forms.other) : forms.other;
  return fill(form, { n: formatNumber(locale, n) });
};

export const formatNumber = (locale: Locale, n: number) =>
  new Intl.NumberFormat(LOCALE_TAG[locale], { useGrouping: "always" }).format(n);

export const formatMoney = (locale: Locale, m: Money) => {
  const { amount, currency } = displayMoney(m, locale);
  return currency === "PLN"
    ? `${formatNumber(locale, amount)} zł`
    : new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency, maximumFractionDigits: 0, useGrouping: "always" }).format(amount);
};

const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const formatDay = (locale: Locale, iso: string, now = new Date()) => {
  const d = parseDay(iso);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(d);
};

export const formatDate = (locale: Locale, d: Date) =>
  new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" }).format(d);

export const listingTitle = (locale: Locale, l: Pick<Listing, "placeType" | "rooms" | "district" | "city">) => {
  const t = getDictionary(locale);
  return t.listing.title({ placeType: l.placeType, rooms: l.rooms, place: l.district ?? t.cities[l.city] });
};

export const availability = (locale: Locale, l: Pick<Listing, "availableFrom" | "availableTo">, now = new Date()) => {
  const t = getDictionary(locale).listing;
  const from = l.availableFrom && l.availableFrom > warsawDay(now) ? formatDay(locale, l.availableFrom, now) : null;
  if (l.availableTo) return `${from ?? t.now} – ${formatDay(locale, l.availableTo, now)}`;
  return from ? `${t.from} ${from}` : t.now;
};

export const minStay = (locale: Locale, days: number | null) => {
  if (!days) return null;
  const t = getDictionary(locale).listing.minStay;
  return plural(locale, t.months, Math.ceil(days / 31));
};

export const roommatesLine = (locale: Locale, l: Pick<Listing, "placeType" | "roommates">) => {
  if (l.placeType === "whole_place" || !l.roommates) return null;
  const t = getDictionary(locale).listing.roommates;
  const { count, genders } = l.roommates;
  if (count === 0) return t.none;
  const parts = [count === null ? null : formatNumber(locale, count), genders ? t.letters[genders] : null].filter(Boolean);
  return parts.length ? `${t.label}: ${parts.join(" · ")}` : null;
};

export const priceView = (locale: Locale, l: Pick<Listing, "price">) => {
  const t = getDictionary(locale).listing;
  const period: ShownPeriod = l.price.period === "week" ? "month" : l.price.period;
  const money = formatMoney(locale, period === l.price.period ? l.price : roundMoney({ amount: monthlyAmount(l.price), currency: l.price.currency }));
  return { main: l.price.startingAt ? `${t.from} ${money}` : money, unit: t.per[period] };
};
