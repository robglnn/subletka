import type { Currency, Locale, Price } from "@/lib/domain";

export type Money = { amount: number; currency: Currency };

export const PLN_PER_EUR = 4.27;

export const LOCALE_CURRENCY: Record<Locale, Currency> = { pl: "PLN", en: "EUR" };

const PLN_PER: Record<Currency, number> = { PLN: 1, EUR: PLN_PER_EUR };
export const ROUND_TO: Record<Currency, number> = { PLN: 10, EUR: 5 };

export const roundMoney = ({ amount, currency }: Money): Money => ({
  amount: Math.round(amount / ROUND_TO[currency]) * ROUND_TO[currency],
  currency,
});

export const convert = (m: Money, to: Currency): Money =>
  m.currency === to ? m : roundMoney({ amount: (m.amount * PLN_PER[m.currency]) / PLN_PER[to], currency: to });

export const displayMoney = (m: Money, locale: Locale): Money => convert(m, LOCALE_CURRENCY[locale]);

const MONTHLY_FACTOR: Record<Price["period"], number> = { month: 1, week: 52 / 12, night: 30 };

type Amount = Pick<Price, "amount" | "currency" | "period">;

export const monthlyAmount = (p: Amount) => Math.round(p.amount * MONTHLY_FACTOR[p.period]);
export const monthlyPln = (p: Amount) => Math.round(monthlyAmount(p) * PLN_PER[p.currency]);

export const toPln = (amount: number, locale: Locale) => Math.round(amount * PLN_PER[LOCALE_CURRENCY[locale]]);
export const fromPln = (pln: number, locale: Locale) => pln / PLN_PER[LOCALE_CURRENCY[locale]];
