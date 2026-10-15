import type { City, ListingOrigin, PlaceType } from "@/lib/domain";

export const FIT_WEIGHTS = { value: 30, area: 25, commute: 20, quality: 15, freshness: 10 } as const;

export type FitInput = {
  id: string;
  origin: ListingOrigin;
  city: City;
  placeType: PlaceType;
  rooms: number | null;
  areaM2: number | null;
  priceMonthly: number;
  priceOutlier: boolean;
  areaScore: number | null;
  minutes: number | null;
  photos: number;
  description: number;
  hasDeposit: boolean;
  hasRoommates: boolean;
  availableFrom: string | null;
  sourceUpdatedAt: Date | null;
};

type Kind = "room" | "studio" | "flat";
const kindOf = (l: Pick<FitInput, "placeType" | "rooms">): Kind => (l.placeType !== "whole_place" ? "room" : l.rooms === 1 ? "studio" : "flat");

const clamp = (v: number) => Math.max(0, Math.min(100, v));

const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const UNKNOWN_AREA = 40;
const UNKNOWN_COMMUTE = 40;
const DAY = 86_400_000;

export type Pool = (l: FitInput) => number | null;

export function pricePool(all: FitInput[]): Pool {
  const typical = all.filter((l) => !l.priceOutlier);
  const groups = new Map<string, FitInput[]>();
  for (const l of typical) {
    const key = `${l.city}:${kindOf(l)}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const perM2 = new Map<string, number | null>();
  const flat = new Map<string, number | null>();
  for (const [key, ls] of groups) {
    perM2.set(key, median(ls.filter((l) => l.areaM2 && l.areaM2 > 0).map((l) => l.priceMonthly / l.areaM2!)));
    flat.set(key, median(ls.map((l) => l.priceMonthly)));
  }
  return (l) => {
    const key = `${l.city}:${kindOf(l)}`;
    const m2 = perM2.get(key);
    const base = l.areaM2 && l.areaM2 > 0 && m2 ? m2 * l.areaM2 : (flat.get(key) ?? null);
    return base === null ? null : base * (1 + 0.004 * ((l.areaScore ?? 50) - 50));
  };
}

export function fitParts(l: FitInput, predicted: number | null, today: string) {
  const value = predicted === null ? 50 : clamp(50 + 100 * (predicted / l.priceMonthly - 1));
  const area = l.areaScore ?? UNKNOWN_AREA;
  const commute = l.minutes === null ? UNKNOWN_COMMUTE : clamp(100 - (l.minutes - 10) * 2.5);
  const fields = [l.areaM2 !== null, l.hasDeposit, kindOf(l) !== "room" || l.hasRoommates].filter(Boolean).length;
  const quality = (Math.min(l.photos, 8) / 8) * 40 + (fields / 3) * 30 + (l.description >= 200 ? 30 : (l.description / 200) * 30);
  const waitDays = l.availableFrom && l.availableFrom > today ? (Date.parse(l.availableFrom) - Date.parse(today)) / DAY : 0;
  const synced = l.sourceUpdatedAt !== null && Date.parse(today) - l.sourceUpdatedAt.getTime() <= 7 * DAY;
  const freshness = l.origin === "native" ? 100 : 60 * Math.max(0, 1 - waitDays / 182) + (synced ? 40 : 0);
  return { value, area, commute, quality, freshness };
}

export function fitScore(l: FitInput, predicted: number | null, today: string) {
  const parts = fitParts(l, predicted, today);
  const total = (Object.keys(FIT_WEIGHTS) as (keyof typeof FIT_WEIGHTS)[]).reduce((sum, k) => sum + FIT_WEIGHTS[k] * parts[k], 0);
  return Math.round(total / 100);
}

export const SAME_BUILDING_M = 80;

type Placed = { id: string; origin: ListingOrigin; city: City; source: string | null; district: string | null; lat: number | null; lng: number | null };

const metres = (a: Placed, b: Placed) => {
  const dy = (a.lat! - b.lat!) * 110_574;
  const dx = (a.lng! - b.lng!) * 111_320 * Math.cos((a.lat! * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

export function buildingKeys(all: Placed[]): Map<string, string> {
  const keys = new Map<string, string>();
  const seeds: Placed[] = [];
  const placed = all.filter((l) => l.lat !== null && l.lng !== null).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const l of placed) {
    const seed = seeds.find((s) => s.city === l.city && metres(s, l) <= SAME_BUILDING_M);
    if (!seed) seeds.push(l);
    const at = seed ?? l;
    keys.set(l.id, `${at.lat!.toFixed(4)},${at.lng!.toFixed(4)}`);
  }
  for (const l of all) if (!keys.has(l.id)) keys.set(l.id, l.origin === "imported" && l.district ? `${l.source}:${l.district}` : l.id);
  return keys;
}
