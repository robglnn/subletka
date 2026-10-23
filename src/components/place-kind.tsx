"use client";

import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toggleVariants } from "@/components/ui/toggle";
import { PLACE_KINDS, type PlaceKind } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type PlaceKindLabels = { label: string; kinds: Record<PlaceKind, string> };

const group = "flex h-12 w-full items-center gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-black/5";
const item = "h-10 flex-auto rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground";
const on = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground";
const pressed = "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

export function PlaceKindToggle({
  value,
  onChange,
  labels,
  className,
}: {
  value: PlaceKind;
  onChange: (k: PlaceKind) => void;
  labels: PlaceKindLabels;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={labels.label}
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as PlaceKind)}
      spacing={1}
      className={cn(group, className)}
    >
      {PLACE_KINDS.map((k) => (
        <ToggleGroupItem key={k} value={k} className={cn(item, pressed)}>
          {labels.kinds[k]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function PlaceKindLinks({
  value,
  hrefs,
  labels,
  className,
}: {
  value: PlaceKind | null;
  hrefs: Record<PlaceKind, string>;
  labels: PlaceKindLabels;
  className?: string;
}) {
  return (
    <nav aria-label={labels.label} className={cn(group, className)}>
      {PLACE_KINDS.map((k) => (
        <Link
          key={k}
          href={hrefs[k]}
          scroll={false}
          aria-current={k === value ? "page" : undefined}
          className={cn(toggleVariants(), item, k === value && on)}
        >
          {labels.kinds[k]}
        </Link>
      ))}
    </nav>
  );
}
