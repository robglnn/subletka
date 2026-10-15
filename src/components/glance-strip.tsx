import Link from "next/link";
import { DISTRICTS, type City, type Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { formatMoney, formatNumber } from "@/lib/i18n/format";
import { displayMoney, roundMoney, type Money } from "@/lib/money";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type Glance = { total: number; lowest: Money | null; medianPln: number | null; minutes?: number | null };

export function GlanceStrip({ lang, glance }: { lang: Locale; glance: Glance }) {
  const t = getDictionary(lang);
  const cells: [string, string][] = [
    [t.glance.total, formatNumber(lang, glance.total)],
    [t.glance.lowest, glance.lowest ? formatMoney(lang, glance.lowest) : "—"],
    [t.glance.median, glance.medianPln === null ? "—" : formatMoney(lang, roundMoney(displayMoney({ amount: glance.medianPln, currency: "PLN" }, lang)))],
  ];
  if (glance.minutes !== undefined) cells.push([t.glance.minutes, glance.minutes === null ? "—" : fill(t.district.minutes, { n: glance.minutes })]);
  return (
    <section aria-label={t.glance.total} className="flex flex-col gap-2">
      <dl className={cn("grid gap-2", cells.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {cells.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-secondary px-3 py-3">
            <dt className="text-xs text-muted-foreground sm:text-sm">{k}</dt>
            <dd className="text-lg font-bold whitespace-nowrap sm:text-2xl">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DistrictLinks({ lang, city, current }: { lang: Locale; city: City; current?: string }) {
  const t = getDictionary(lang);
  return (
    <nav aria-label={t.district.districts} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{t.district.districts}</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-0">
        {DISTRICTS[city].map((d) => (
          <li key={d.slug}>
            <Link
              href={routes.district(lang, city, d.slug)}
              aria-current={d.slug === current ? "page" : undefined}
              className={cn("inline-flex h-11 items-center text-sm", d.slug === current ? "font-bold" : "underline-offset-4 hover:underline")}
            >
              {d.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
