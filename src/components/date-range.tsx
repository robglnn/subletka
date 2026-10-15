"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { LOCALE_TAG, type Locale } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type DateRange = { from?: string; to?: string };

export type DateRangeLabels = {
  moveIn: string;
  moveOut: string;
  done: string;
  clear: string;
  close: string;
  prevMonth: string;
  nextMonth: string;
};

const MOBILE_MONTHS = 12;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const todayIso = () => {
  const n = new Date();
  return iso(utcDay(n.getFullYear(), n.getMonth(), n.getDate()));
};

export const formatShort = (locale: Locale, day: string) =>
  new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export const formatRange = (locale: Locale, r: DateRange) =>
  r.from ? `${formatShort(locale, r.from)} – ${r.to ? formatShort(locale, r.to) : "…"}` : null;

function Month({
  locale,
  year,
  month,
  range,
  min,
  onPick,
}: {
  locale: Locale;
  year: number;
  month: number;
  range: DateRange;
  min: string;
  onPick: (day: string) => void;
}) {
  const first = utcDay(year, month, 1);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = utcDay(year, month + 1, 0).getUTCDate();
  const label = new Intl.DateTimeFormat(LOCALE_TAG[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "narrow", timeZone: "UTC" }).format(utcDay(2024, 0, 1 + i)),
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-base font-semibold">{label}</p>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = iso(utcDay(year, month, i + 1));
          const isEdge = day === range.from || day === range.to;
          const inside = range.from && range.to && day > range.from && day < range.to;
          return (
            <button
              key={day}
              type="button"
              disabled={day < min}
              onClick={() => onPick(day)}
              aria-pressed={isEdge}
              className={cn(
                "h-11 text-sm tabular-nums disabled:text-muted-foreground/40",
                inside && "bg-secondary",
                isEdge && "rounded-full bg-foreground font-semibold text-background",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangeDialog({
  locale,
  labels,
  open,
  onOpenChange,
  value,
  onDone,
}: {
  locale: Locale;
  labels: DateRangeLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DateRange;
  onDone: (range: DateRange) => void;
}) {
  const [draft, setDraft] = useState<DateRange>(value);
  const [phase, setPhase] = useState<"from" | "to">("from");
  const [offset, setOffset] = useState(0);
  const min = todayIso();
  const start = useMemo(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  }, []);
  const monthAt = (i: number) => {
    const d = utcDay(start.y, start.m + i, 1);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  };

  const pick = (day: string) => {
    if (phase === "from" || !draft.from || day < draft.from) {
      setDraft({ from: day, to: draft.to && draft.to > day ? draft.to : undefined });
      setPhase("to");
    } else {
      setDraft({ from: draft.from, to: day });
    }
  };

  const tab = (which: "from" | "to", label: string) => (
    <button
      type="button"
      onClick={() => setPhase(which)}
      aria-pressed={phase === which}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-start justify-center rounded-xl border px-4 text-left",
        phase === which ? "border-foreground" : "border-border",
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold">{draft[which] ? formatShort(locale, draft[which]) : "—"}</span>
    </button>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setDraft(value);
          setPhase(value.from ? "to" : "from");
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-background outline-none md:inset-auto md:top-1/2 md:left-1/2 md:w-[720px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-xl">
          <div className="flex items-center justify-between px-4 pt-3">
            <Dialog.Title className="text-lg font-bold">
              {labels.moveIn} · {labels.moveOut}
            </Dialog.Title>
            <Dialog.Close aria-label={labels.close} className="inline-flex size-11 items-center justify-center">
              <XIcon className="size-6" />
            </Dialog.Close>
          </div>
          <div className="flex gap-2 px-4 pt-2 pb-3">
            {tab("from", labels.moveIn)}
            {tab("to", labels.moveOut)}
          </div>
          <div className="flex-1 overflow-y-auto border-t border-border px-4 py-4 md:hidden">
            <div className="flex flex-col gap-8">
              {Array.from({ length: MOBILE_MONTHS }, (_, i) => {
                const { year, month } = monthAt(i);
                return <Month key={i} locale={locale} year={year} month={month} range={draft} min={min} onPick={pick} />;
              })}
            </div>
          </div>
          <div className="relative hidden border-t border-border px-6 py-5 md:block">
            <button
              type="button"
              aria-label={labels.prevMonth}
              disabled={offset === 0}
              onClick={() => setOffset(offset - 1)}
              className="absolute top-4 left-4 inline-flex size-11 items-center justify-center disabled:opacity-30"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label={labels.nextMonth}
              disabled={offset >= MOBILE_MONTHS - 2}
              onClick={() => setOffset(offset + 1)}
              className="absolute top-4 right-4 inline-flex size-11 items-center justify-center disabled:opacity-30"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="grid grid-cols-2 gap-8 px-8">
              {[offset, offset + 1].map((i) => {
                const { year, month } = monthAt(i);
                return <Month key={i} locale={locale} year={year} month={month} range={draft} min={min} onPick={pick} />;
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                setDraft({});
                setPhase("from");
              }}
              className="inline-flex h-12 items-center px-2 text-base font-semibold underline underline-offset-4"
            >
              {labels.clear}
            </button>
            <button
              type="button"
              onClick={() => {
                onDone(draft);
                onOpenChange(false);
              }}
              className="inline-flex h-12 min-w-36 items-center justify-center rounded-full bg-foreground px-6 text-base font-semibold text-background"
            >
              {labels.done}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
