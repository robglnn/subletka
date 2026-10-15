"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { DateRangeDialog, formatRange, type DateRange, type DateRangeLabels } from "@/components/date-range";
import { CITIES, type City, type Locale } from "@/lib/domain";
import { filterQuery } from "@/lib/filter-query";

export type SearchLabels = DateRangeLabels & { where: string; when: string; addDates: string; submit: string };

const field = "flex min-h-14 w-full flex-col justify-center rounded-2xl bg-white px-4 text-left shadow-sm ring-1 ring-black/5";

export function SearchForm({ lang, labels, cityNames }: { lang: Locale; labels: SearchLabels; cityNames: Record<City, string> }) {
  const router = useRouter();
  const [city, setCity] = useState<City>("warszawa");
  const [range, setRange] = useState<DateRange>({});
  const [open, setOpen] = useState(false);
  const go = () => {
    const q = filterQuery(range).toString();
    router.push(`/${lang}/${city}${q ? `?${q}` : ""}`);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end md:gap-2 md:rounded-2xl md:bg-white md:p-2 md:shadow-sm md:ring-1 md:ring-black/5"
    >
      <label className="flex flex-col gap-1.5 text-base md:gap-0">
        <span className="md:sr-only">{labels.where}</span>
        <span className={`${field} md:shadow-none md:ring-0`}>
          <span className="hidden text-xs text-muted-foreground md:block">{labels.where}</span>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value as City)}
            className="-mx-1 h-8 w-full appearance-none bg-transparent px-1 text-base font-medium outline-none"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {cityNames[c]}
              </option>
            ))}
          </select>
        </span>
      </label>
      <div className="flex flex-col gap-1.5 text-base md:gap-0">
        <span className="md:sr-only" id="when-label">
          {labels.when}
        </span>
        <button
          type="button"
          aria-describedby="when-label"
          onClick={() => setOpen(true)}
          className={`${field} md:border-l md:border-border md:shadow-none md:ring-0`}
        >
          <span className="hidden text-xs text-muted-foreground md:block">{labels.when}</span>
          <span className={range.from ? "font-medium" : "text-muted-foreground"}>{formatRange(lang, range) ?? labels.addDates}</span>
        </button>
      </div>
      <button
        type="submit"
        className="mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground shadow-md md:mt-0 md:size-14 md:px-0"
      >
        <Search className="size-5" strokeWidth={2.5} />
        <span className="md:sr-only">{labels.submit}</span>
      </button>
      <DateRangeDialog locale={lang} labels={labels} open={open} onOpenChange={setOpen} value={range} onDone={setRange} />
    </form>
  );
}
