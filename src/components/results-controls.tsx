"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, PawPrint, SlidersHorizontal, Sofa, XIcon } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { DateRangeDialog, formatRange, type DateRangeLabels } from "@/components/date-range";
import { DEFAULT_SORT, PLACE_FILTERS, SORTS, type City, type Locale } from "@/lib/domain";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { formatMoney, plural } from "@/lib/i18n/format";
import { fromPln, LOCALE_CURRENCY, toPln } from "@/lib/money";
import { activeFilterCount, filterQuery } from "@/lib/filter-query";
import type { Filters } from "@/lib/search-params";
import { cn } from "@/lib/utils";

type Labels = {
  filters: Dictionary["filters"];
  dates: DateRangeLabels & { addDates: string };
  back: string;
};

const BUDGET: Record<Locale, { min: number; max: number; step: number }> = {
  pl: { min: 500, max: 15_000, step: 250 },
  en: { min: 100, max: 3_500, step: 50 },
};

const chip = (on: boolean) =>
  cn(
    "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-base font-medium transition-colors",
    on ? "bg-foreground text-background" : "bg-secondary",
  );

function useLiveCount(city: City, f: Filters, enabled: boolean, initial: number) {
  const [count, setCount] = useState(initial);
  const query = filterQuery({ ...f, sort: DEFAULT_SORT, page: 1 }).toString();
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/count?city=${city}&${query}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { total: number } | null) => d && setCount(d.total))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [city, query, enabled]);
  return count;
}

function FilterSheet({
  lang,
  city,
  filters,
  total,
  labels,
  onApply,
}: {
  lang: Locale;
  city: City;
  filters: Filters;
  total: number;
  labels: Dictionary["filters"];
  onApply: (f: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const count = useLiveCount(city, draft, open, total);
  const active = activeFilterCount(filters);
  const scale = BUDGET[lang];
  const currency = LOCALE_CURRENCY[lang];
  const budget = draft.max ? Math.min(scale.max, Math.round(fromPln(draft.max, lang) / scale.step) * scale.step) : scale.max;
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const section = "flex flex-col gap-3 border-b border-border py-5";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(filters);
        setOpen(o);
      }}
    >
      <Dialog.Trigger
        aria-label={labels.open}
        className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
      >
        <SlidersHorizontal className="size-5" />
        {active > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {active}
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-background outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, type: [], max: undefined, furnished: false, pets: false, sort: DEFAULT_SORT })}
              className="inline-flex h-11 items-center px-1 text-sm font-semibold text-muted-foreground"
            >
              {labels.clearAll}
            </button>
            <Dialog.Title className="text-lg font-bold">{labels.title}</Dialog.Title>
            <Dialog.Close aria-label="×" className="inline-flex size-11 items-center justify-center rounded-xl bg-secondary">
              <XIcon className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5">
            <fieldset className={section}>
              <legend className="pb-3 text-base text-muted-foreground">{labels.type}</legend>
              <div className="flex flex-wrap gap-2">
                {PLACE_FILTERS.map((p) => {
                  const on = draft.type.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ type: on ? draft.type.filter((x) => x !== p) : [...draft.type, p] })}
                      className={chip(on)}
                    >
                      {labels.types[p]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className={section}>
              <label htmlFor="budget" className="text-base text-muted-foreground">
                {labels.budget}
              </label>
              <p className="text-2xl font-bold">
                {draft.max ? fill(labels.upTo, { n: formatMoney(lang, { amount: draft.max, currency: "PLN" }) }) : labels.anyBudget}
              </p>
              <input
                id="budget"
                type="range"
                min={scale.min}
                max={scale.max}
                step={scale.step}
                value={budget}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set({ max: v >= scale.max ? undefined : toPln(v, lang) });
                }}
                className="h-11 w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatMoney(lang, { amount: scale.min, currency })}</span>
                <span>{formatMoney(lang, { amount: scale.max, currency })}+</span>
              </div>
            </div>
            <fieldset className={section}>
              <legend className="pb-3 text-base text-muted-foreground">{labels.furnishing}</legend>
              <div>
                <button type="button" aria-pressed={draft.furnished} onClick={() => set({ furnished: !draft.furnished })} className={chip(draft.furnished)}>
                  <Sofa className="size-4" />
                  {labels.furnished}
                </button>
              </div>
            </fieldset>
            <fieldset className={section}>
              <legend className="pb-3 text-base text-muted-foreground">{labels.pets}</legend>
              <div>
                <button type="button" aria-pressed={draft.pets} onClick={() => set({ pets: !draft.pets })} className={chip(draft.pets)}>
                  <PawPrint className="size-4" />
                  {labels.petsOk}
                </button>
              </div>
            </fieldset>
            <fieldset className={cn(section, "border-b-0")}>
              <legend className="pb-3 text-base text-muted-foreground">{labels.sort}</legend>
              <div className="flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <button key={s} type="button" aria-pressed={draft.sort === s} onClick={() => set({ sort: s })} className={chip(draft.sort === s)}>
                    {labels.sorts[s]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                onApply({ ...draft, page: 1 });
                setOpen(false);
              }}
              className="h-14 w-full rounded-xl bg-foreground text-lg font-semibold text-background"
            >
              {plural(lang, labels.show, count)}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ResultsControls({
  lang,
  city,
  cityName,
  filters,
  total,
  labels,
}: {
  lang: Locale;
  city: City;
  cityName: string;
  filters: Filters;
  total: number;
  labels: Labels;
}) {
  const router = useRouter();
  const [datesOpen, setDatesOpen] = useState(false);
  const apply = (f: Filters) => {
    const q = filterQuery(f).toString();
    router.push(`/${lang}/${city}${q ? `?${q}` : ""}`, { scroll: false });
  };
  const range = formatRange(lang, filters);
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 min-w-0 flex-1 items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <Link href={`/${lang}`} aria-label={labels.back} className="inline-flex h-12 w-11 shrink-0 items-center justify-center">
          <ChevronLeft className="size-5" />
        </Link>
        <button type="button" onClick={() => setDatesOpen(true)} className="flex h-12 min-w-0 flex-1 items-center gap-2 pr-4 text-left">
          <span className="truncate text-base font-semibold">{cityName}</span>
          <span className="truncate text-sm text-muted-foreground">· {range ?? labels.dates.addDates}</span>
        </button>
      </div>
      <FilterSheet lang={lang} city={city} filters={filters} total={total} labels={labels.filters} onApply={apply} />
      <DateRangeDialog
        locale={lang}
        labels={labels.dates}
        open={datesOpen}
        onOpenChange={setDatesOpen}
        value={{ from: filters.from, to: filters.to }}
        onDone={(r) => apply({ ...filters, from: r.from, to: r.to, page: 1 })}
      />
    </div>
  );
}
