import "server-only";
import AREA from "@/data/area.json";
import SHAPES from "@/data/district-shapes.json";
import { DISTRICTS, findDistrict, type City } from "@/lib/domain";

type Pt = [number, number];
type Grid = { latMin: number; lngMin: number; dLat: number; dLng: number; rows: number; cols: number; score: number[]; minutes: number[]; district: number[] };
type DistrictArea = { slug: string; score: number; badge: boolean; minutes: number | null };

const area = AREA as unknown as { pointBadgeAt: number; districts: Record<City, DistrictArea[]>; grid: Record<City, Grid> };
const shapes = SHAPES as unknown as Record<City, Record<string, Pt[][]>>;

const inside = (lng: number, lat: number, rings: Pt[][]) => {
  let hit = false;
  for (const ring of rings)
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      if (ay > lat !== by > lat && lng < ax + ((lat - ay) / (by - ay)) * (bx - ax)) hit = !hit;
    }
  return hit;
};

export const districtAt = (city: City, lat: number, lng: number) => {
  const slug = Object.entries(shapes[city]).find(([, rings]) => inside(lng, lat, rings))?.[0];
  return DISTRICTS[city].find((d) => d.slug === slug)?.name ?? null;
};

export type AreaFacts = { score: number | null; badge: boolean; minutes: number | null };

const cellAt = (city: City, lat: number, lng: number) => {
  const g = area.grid[city];
  const r = Math.round((lat - g.latMin) / g.dLat);
  const c = Math.round((lng - g.lngMin) / g.dLng);
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  const i = r * g.cols + c;
  return g.score[i] < 0 ? null : { score: g.score[i], minutes: g.minutes[i] > 0 ? g.minutes[i] : null };
};

export const areaFacts = (city: City, district: string | null, lat: number | null, lng: number | null): AreaFacts => {
  const cell = lat !== null && lng !== null ? cellAt(city, lat, lng) : null;
  if (cell) return { score: cell.score, badge: cell.score >= area.pointBadgeAt, minutes: cell.minutes };
  const slug = district ? findDistrict(city, district)?.slug : undefined;
  const d = area.districts[city].find((x) => x.slug === slug);
  return d ? { score: d.score, badge: d.badge, minutes: d.minutes === null ? null : Math.round(d.minutes) } : { score: null, badge: false, minutes: null };
};

export const districtMinutes = (city: City, slug: string) => area.districts[city].find((d) => d.slug === slug)?.minutes ?? null;
