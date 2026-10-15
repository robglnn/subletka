import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

type City = "warszawa" | "krakow";
type Pt = [number, number];
type Tags = Record<string, string | undefined>;
type Feature = { geometry: { type: string; coordinates: unknown }; properties: Tags & { "@type": string; "@id": number } };

const CACHE = process.argv[2] ?? "/tmp/area-cache";
const OUT = process.argv[3] ?? "src/data";
const CITIES: City[] = ["warszawa", "krakow"];
const CENTRE: Record<City, { lat: number; lng: number }> = {
  warszawa: { lat: 52.2306, lng: 21.0118 },
  krakow: { lat: 50.0617, lng: 19.9373 },
};
const GTFS: Record<City, string[]> = { warszawa: ["gtfs-warszawa"], krakow: ["gtfs-krakow-t", "gtfs-krakow-a"] };
const SERVICE_DAY = "20261020";
const CELL_M = 200;
const RASTER_M = 20;
const WALK = 800;
const WIDE = 1200;
const CENTRE_STOPS_M = 700;
const ACCESS_M = 1200;
const TRANSFER_M = 300;
const TRANSFER_S = 60;
const WALK_S_PER_M = 1;
const DEADLINES = range(7.5 * 3600, 10.5 * 3600, 120);
const DEPARTURES = range(7.5 * 3600, 9 * 3600, 180);

const scores = JSON.parse(readFileSync(join(import.meta.dirname, "district-scores.json"), "utf8")) as {
  version: string;
  weights: Record<string, number>;
  badgeAt: number;
  pointBadgeAt: number;
  districts: { city: City; name: string; osm: number; score: number; inputs: Record<string, number> }[];
};
const PILLARS: Record<string, string[]> = {
  connected: ["transit", "central"],
  quiet: ["quiet"],
  green: ["green"],
  everyday: ["groceries", "food"],
  cafes_work: ["cafes", "work"],
  active: ["fitness", "bike"],
  culture: ["culture"],
  low_booze: ["low_booze"],
};
const INPUTS = Object.values(PILLARS).flat();
const pool = Object.fromEntries(INPUTS.map((k) => [k, scores.districts.map((d) => d.inputs[k])]));

function range(from: number, to: number, step: number) {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

const percentile = (values: number[], v: number) => {
  const s = [...values].sort((a, b) => a - b);
  const lo = s.filter((a) => a < v).length;
  const hi = s.filter((a) => a <= v).length;
  const rank = hi > lo ? (lo + hi - 1) / 2 : lo === 0 ? 0 : lo === s.length ? s.length - 1 : lo - 1 + (v - s[lo - 1]) / (s[lo] - s[lo - 1]);
  return (rank / (s.length - 1)) * 100;
};

const areaScore = (inputs: Record<string, number>) =>
  Math.round(
    Object.entries(PILLARS).reduce((sum, [pillar, keys]) => {
      const value = keys.reduce((a, k) => a + percentile(pool[k], inputs[k]), 0) / keys.length;
      return sum + (scores.weights[pillar] * value) / 100;
    }, 0),
  );

const slugOf = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const projector = (city: City) => {
  const { lat: lat0, lng: lng0 } = CENTRE[city];
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const ky = 110_574;
  return {
    toXY: ([lng, lat]: Pt): Pt => [(lng - lng0) * kx, (lat - lat0) * ky],
    toLngLat: ([x, y]: Pt): Pt => [x / kx + lng0, y / ky + lat0],
  };
};

class PointIndex {
  private buckets = new Map<string, number[]>();
  constructor(private size = 400) {}
  add([x, y]: Pt, w: number) {
    const key = `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
    const b = this.buckets.get(key) ?? [];
    b.push(x, y, w);
    this.buckets.set(key, b);
  }
  sum([x, y]: Pt, r: number) {
    let total = 0;
    const r2 = r * r;
    for (let i = Math.floor((x - r) / this.size); i <= Math.floor((x + r) / this.size); i++)
      for (let j = Math.floor((y - r) / this.size); j <= Math.floor((y + r) / this.size); j++) {
        const b = this.buckets.get(`${i},${j}`);
        if (!b) continue;
        for (let k = 0; k < b.length; k += 3) if ((b[k] - x) ** 2 + (b[k + 1] - y) ** 2 <= r2) total += b[k + 2];
      }
    return total;
  }
}

class Raster {
  readonly data: Uint8Array;
  readonly cols: number;
  readonly rows: number;
  constructor(readonly x0: number, readonly y0: number, x1: number, y1: number) {
    this.cols = Math.ceil((x1 - x0) / RASTER_M);
    this.rows = Math.ceil((y1 - y0) / RASTER_M);
    this.data = new Uint8Array(this.cols * this.rows);
  }
  fillRings(rings: Pt[][]) {
    const ys = rings.flat().map((p) => p[1]);
    const r0 = Math.max(0, Math.floor((Math.min(...ys) - this.y0) / RASTER_M));
    const r1 = Math.min(this.rows - 1, Math.ceil((Math.max(...ys) - this.y0) / RASTER_M));
    for (let r = r0; r <= r1; r++) {
      const y = this.y0 + (r + 0.5) * RASTER_M;
      const xs: number[] = [];
      for (const ring of rings)
        for (let i = 0; i < ring.length - 1; i++) {
          const [ax, ay] = ring[i];
          const [bx, by] = ring[i + 1];
          if (ay > y !== by > y) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - this.x0) / RASTER_M - 0.5));
        const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - this.x0) / RASTER_M - 0.5));
        for (let c = c0; c <= c1; c++) this.data[r * this.cols + c] = 1;
      }
    }
  }
  markNear(a: Pt, b: Pt, d: number) {
    const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - d - this.x0) / RASTER_M));
    const c1 = Math.min(this.cols - 1, Math.ceil((Math.max(a[0], b[0]) + d - this.x0) / RASTER_M));
    const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - d - this.y0) / RASTER_M));
    const r1 = Math.min(this.rows - 1, Math.ceil((Math.max(a[1], b[1]) + d - this.y0) / RASTER_M));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const p: Pt = [this.x0 + (c + 0.5) * RASTER_M, this.y0 + (r + 0.5) * RASTER_M];
        if (segmentDistance(p, a, b) <= d) this.data[r * this.cols + c] = 1;
      }
  }
  share([x, y]: Pt, r: number) {
    let hit = 0;
    let all = 0;
    const cx = Math.floor((x - this.x0) / RASTER_M);
    const cy = Math.floor((y - this.y0) / RASTER_M);
    const n = Math.ceil(r / RASTER_M);
    for (let dy = -n; dy <= n; dy++)
      for (let dx = -n; dx <= n; dx++) {
        if ((dx * RASTER_M) ** 2 + (dy * RASTER_M) ** 2 > r * r) continue;
        const c = cx + dx;
        const rr = cy + dy;
        if (c < 0 || rr < 0 || c >= this.cols || rr >= this.rows) continue;
        all++;
        hit += this.data[rr * this.cols + c];
      }
    return all ? hit / all : 0;
  }
}

const segmentDistance = ([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const insideRings = ([x, y]: Pt, rings: Pt[][]) => {
  let inside = false;
  for (const ring of rings)
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
    }
  return inside;
};

const simplify = (pts: Pt[], tolerance: number): Pt[] => {
  if (pts.length < 3) return pts;
  let max = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segmentDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) [max, at] = [d, i];
  }
  if (max <= tolerance) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)];
};

const has = (v: string | undefined, ...words: string[]) => (v ?? "").split(";").some((s) => words.includes(s.trim()));
const unbranded = (t: Tags) => !t.brand && !t["brand:wikidata"];

const pointWeights = (t: Tags, kind: string): Record<string, number> => {
  const w: Record<string, number> = {};
  if (kind === "node") {
    if (t.railway === "tram_stop") w.transit = 1;
    else if (t.railway === "station" && (t.station === "subway" || t.subway === "yes")) w.transit = 3;
    else if (t.railway === "station" || t.railway === "halt") w.transit = 2;
    else if (t.highway === "bus_stop") w.transit = 0.3;
  }
  if (has(t.shop, "supermarket", "greengrocer", "bakery", "deli", "health_food") || t.amenity === "marketplace") w.groceries = 1;
  if (t.amenity === "restaurant" && unbranded(t)) w.food = has(t["diet:vegan"], "yes", "only") || t["diet:vegetarian"] === "only" ? 2 : 1;
  if (t.amenity === "cafe" && unbranded(t)) w.cafes = 1;
  if (t.amenity === "cafe" && has(t.internet_access, "wlan", "yes", "wifi")) w.work = 1;
  if (t.amenity === "coworking_space" || t.office === "coworking") w.work = 2;
  if (has(t.sport, "climbing")) w.fitness = 3;
  else if ((t.leisure === "sports_centre" && has(t.sport, "swimming")) || (t.leisure === "swimming_pool" && has(t.access, "yes", "public"))) w.fitness = 2;
  else if (t.leisure === "fitness_centre" || has(t.sport, "yoga")) w.fitness = 1;
  if (has(t.amenity, "theatre", "cinema", "arts_centre", "library") || has(t.tourism, "museum", "gallery") || t.shop === "books") w.culture = 1;
  if (has(t.shop, "alcohol", "wine")) w.liquor = 1;
  return w;
};

const isMajorRoad = (t: Tags) => has(t.highway, "motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link");
const isBikeWay = (t: Tags) =>
  t.highway === "cycleway" ||
  ["cycleway", "cycleway:left", "cycleway:right", "cycleway:both"].some((k) => has(t[k], "lane", "track", "opposite_lane", "opposite_track")) ||
  (has(t.highway, "path", "footway") && t.bicycle === "designated");
const isGreen = (t: Tags) =>
  has(t.leisure, "park", "garden", "nature_reserve") ||
  has(t.landuse, "forest", "meadow", "grass", "recreation_ground", "village_green") ||
  has(t.natural, "wood", "grassland", "scrub", "heath");

const polygonsOf = (g: Feature["geometry"]): Pt[][][] =>
  g.type === "Polygon" ? [g.coordinates as Pt[][]] : g.type === "MultiPolygon" ? (g.coordinates as Pt[][][]) : [];
const linesOf = (g: Feature["geometry"]): Pt[][] =>
  g.type === "LineString" ? [g.coordinates as Pt[]] : g.type === "MultiLineString" ? (g.coordinates as Pt[][]) : [];
const representative = (g: Feature["geometry"]): Pt | null => {
  if (g.type === "Point") return g.coordinates as Pt;
  const ring = polygonsOf(g)[0]?.[0] ?? linesOf(g)[0];
  if (!ring?.length) return null;
  return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
};

async function readOsm(city: City) {
  const proj = projector(city);
  const wanted = new Map(scores.districts.filter((d) => d.city === city).map((d) => [d.osm, d.name]));
  const districts = new Map<string, Pt[][]>();
  const indexes = Object.fromEntries(["transit", "groceries", "food", "cafes", "work", "fitness", "culture", "liquor", "bike"].map((k) => [k, new PointIndex()]));
  const majorRoads: Pt[][] = [];
  const green: Pt[][][] = [];
  const rl = createInterface({ input: createReadStream(join(CACHE, `${city}.geojsonseq`)) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = JSON.parse(line) as Feature;
    const t = f.properties;
    const kind = t["@type"];
    if (kind === "relation" && wanted.has(t["@id"]) && t.boundary === "administrative") {
      districts.set(wanted.get(t["@id"])!, polygonsOf(f.geometry).flat());
      continue;
    }
    const at = representative(f.geometry);
    if (at)
      for (const [k, w] of Object.entries(pointWeights(t, kind))) indexes[k].add(proj.toXY(at), w);
    if (isMajorRoad(t)) majorRoads.push(...linesOf(f.geometry).map((l) => l.map(proj.toXY)));
    if (isBikeWay(t))
      for (const l of linesOf(f.geometry)) {
        const pts = l.map(proj.toXY);
        for (let i = 0; i < pts.length - 1; i++) {
          const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          const steps = Math.max(1, Math.round(len / 25));
          for (let s = 0; s < steps; s++) {
            const k = (s + 0.5) / steps;
            indexes.bike.add([pts[i][0] + k * (pts[i + 1][0] - pts[i][0]), pts[i][1] + k * (pts[i + 1][1] - pts[i][1])], len / steps / 1000);
          }
        }
      }
    if (isGreen(t)) green.push(...polygonsOf(f.geometry).map((p) => p.map((ring) => ring.map(proj.toXY))));
  }
  const missing = [...wanted.values()].filter((n) => !districts.has(n));
  if (missing.length) throw new Error(`${city}: district boundaries missing for ${missing.join(", ")}`);
  return { districts, indexes, majorRoads, green };
}

const parseCsvLine = (line: string) => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  out.push(cur);
  return out;
};

async function eachRow(file: string, fn: (row: Record<string, string>) => void) {
  if (!existsSync(file)) return;
  let header: string[] | null = null;
  for await (const line of createInterface({ input: createReadStream(file) })) {
    if (!line) continue;
    const cells = parseCsvLine(line.replace(/^\uFEFF/, ""));
    if (!header) header = cells;
    else fn(Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  }
}

const seconds = (hms: string) => {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

type Connection = { from: number; to: number; dep: number; arr: number; trip: number };

async function readGtfs(city: City) {
  const proj = projector(city);
  const stopIndex = new Map<string, number>();
  const stops: Pt[] = [];
  const connections: Connection[] = [];
  let tripCount = 0;
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(`${SERVICE_DAY.slice(0, 4)}-${SERVICE_DAY.slice(4, 6)}-${SERVICE_DAY.slice(6)}T12:00:00Z`).getUTCDay()
  ];
  for (const feed of GTFS[city]) {
    const dir = join(CACHE, feed);
    const services = new Set<string>();
    await eachRow(join(dir, "calendar.txt"), (r) => {
      if (r[weekday] === "1" && r.start_date <= SERVICE_DAY && r.end_date >= SERVICE_DAY) services.add(r.service_id);
    });
    await eachRow(join(dir, "calendar_dates.txt"), (r) => {
      if (r.date !== SERVICE_DAY) return;
      if (r.exception_type === "1") services.add(r.service_id);
      else services.delete(r.service_id);
    });
    await eachRow(join(dir, "stops.txt"), (r) => {
      if (r.location_type && r.location_type !== "0") return;
      stopIndex.set(`${feed}:${r.stop_id}`, stops.length);
      stops.push(proj.toXY([Number(r.stop_lon), Number(r.stop_lat)]));
    });
    const trips = new Map<string, number>();
    await eachRow(join(dir, "trips.txt"), (r) => {
      if (services.has(r.service_id)) trips.set(r.trip_id, -1);
    });
    const frequencies = new Map<string, { start: number; end: number; headway: number }[]>();
    await eachRow(join(dir, "frequencies.txt"), (r) => {
      if (!trips.has(r.trip_id)) return;
      const list = frequencies.get(r.trip_id) ?? [];
      list.push({ start: seconds(r.start_time), end: seconds(r.end_time), headway: Number(r.headway_secs) });
      frequencies.set(r.trip_id, list);
    });
    const calls = new Map<string, { seq: number; stop: number; arr: number; dep: number }[]>();
    await eachRow(join(dir, "stop_times.txt"), (r) => {
      if (!trips.has(r.trip_id)) return;
      const stop = stopIndex.get(`${feed}:${r.stop_id}`);
      if (stop === undefined) return;
      const list = calls.get(r.trip_id) ?? [];
      list.push({ seq: Number(r.stop_sequence), stop, arr: seconds(r.arrival_time || r.departure_time), dep: seconds(r.departure_time || r.arrival_time) });
      calls.set(r.trip_id, list);
    });
    for (const [tripId, list] of calls) {
      list.sort((a, b) => a.seq - b.seq);
      const runs = frequencies.get(tripId);
      const offsets = runs
        ? runs.flatMap((f) => range(f.start, f.end - 1, f.headway)).map((start) => start - list[0].dep)
        : [0];
      for (const off of offsets) {
        if (list[0].dep + off > DEADLINES.at(-1)! || list.at(-1)!.arr + off < DEPARTURES[0] - 3600) continue;
        const trip = tripCount++;
        for (let i = 0; i < list.length - 1; i++)
          connections.push({ from: list[i].stop, to: list[i + 1].stop, dep: list[i].dep + off, arr: list[i + 1].arr + off, trip });
      }
    }
  }
  connections.sort((a, b) => b.dep - a.dep);
  return { stops, connections, tripCount };
}

function latestDepartures(city: City, net: Awaited<ReturnType<typeof readGtfs>>) {
  const centre = projector(city).toXY([CENTRE[city].lng, CENTRE[city].lat]);
  const near = (p: Pt, r: number) => {
    const out: { stop: number; walk: number }[] = [];
    net.stops.forEach((s, i) => {
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d <= r) out.push({ stop: i, walk: d * WALK_S_PER_M });
    });
    return out;
  };
  const buckets = new Map<string, number[]>();
  net.stops.forEach((s, i) => {
    const key = `${Math.floor(s[0] / TRANSFER_M)},${Math.floor(s[1] / TRANSFER_M)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), i]);
  });
  const footpaths = net.stops.map((s, i) => {
    const out: { stop: number; walk: number }[] = [];
    const bx = Math.floor(s[0] / TRANSFER_M);
    const by = Math.floor(s[1] / TRANSFER_M);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const d = Math.hypot(net.stops[j][0] - s[0], net.stops[j][1] - s[1]);
          if (j !== i && d <= TRANSFER_M) out.push({ stop: j, walk: d * WALK_S_PER_M });
        }
    return out;
  });
  const targets = near(centre, CENTRE_STOPS_M).map((t) => ({ stop: t.stop, walk: Math.hypot(net.stops[t.stop][0] - centre[0], net.stops[t.stop][1] - centre[1]) * WALK_S_PER_M }));
  const latest = DEADLINES.map((deadline) => {
    const L = new Float64Array(net.stops.length).fill(-Infinity);
    for (const t of targets) L[t.stop] = Math.max(L[t.stop], deadline - t.walk);
    const onTrip = new Uint8Array(net.tripCount);
    for (const c of net.connections) {
      if (c.arr > deadline) continue;
      if (!onTrip[c.trip] && L[c.to] < c.arr + TRANSFER_S) continue;
      onTrip[c.trip] = 1;
      if (c.dep <= L[c.from]) continue;
      L[c.from] = c.dep;
      for (const f of footpaths[c.from]) if (c.dep - f.walk > L[f.stop]) L[f.stop] = c.dep - f.walk;
    }
    return L;
  });
  return { centre, near, latest };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function buildCity(city: City) {
  const t0 = Date.now();
  const proj = projector(city);
  const osm = await readOsm(city);
  const net = await readGtfs(city);
  const transit = latestDepartures(city, net);
  console.log(`${city}: osm + gtfs read in ${Math.round((Date.now() - t0) / 1000)} s, ${net.stops.length} stops, ${net.connections.length} connections`);

  const names = [...osm.districts.keys()].sort((a, b) => a.localeCompare(b, "pl"));
  const xyRings = names.map((n) => osm.districts.get(n)!.map((ring) => ring.map(proj.toXY)));
  const allXY = xyRings.flat(2);
  const [minX, maxX] = [Math.min(...allXY.map((p) => p[0])), Math.max(...allXY.map((p) => p[0]))];
  const [minY, maxY] = [Math.min(...allXY.map((p) => p[1])), Math.max(...allXY.map((p) => p[1]))];
  const greenRaster = new Raster(minX - 600, minY - 600, maxX + 600, maxY + 600);
  for (const p of osm.green) greenRaster.fillRings(p);
  const roadRaster = new Raster(minX - 600, minY - 600, maxX + 600, maxY + 600);
  for (const line of osm.majorRoads) for (let i = 0; i < line.length - 1; i++) roadRaster.markNear(line[i], line[i + 1], 150);

  const inputsAt = (p: Pt) => {
    const sum = (k: string, r: number) => osm.indexes[k].sum(p, r);
    const cafes = sum("cafes", WALK);
    return {
      transit: sum("transit", WALK),
      central: -Math.hypot(p[0] - transit.centre[0], p[1] - transit.centre[1]) / 1000,
      quiet: -roadRaster.share(p, 180),
      green: greenRaster.share(p, 500),
      groceries: sum("groceries", WALK),
      food: sum("food", WALK),
      cafes,
      work: sum("work", WALK),
      fitness: sum("fitness", WIDE),
      bike: sum("bike", WALK),
      culture: sum("culture", WIDE),
      low_booze: -sum("liquor", WALK) / (sum("liquor", WALK) + cafes + 1),
    };
  };

  const minutesAt = (p: Pt) => {
    const access = transit.near(p, ACCESS_M);
    const direct = Math.hypot(p[0] - transit.centre[0], p[1] - transit.centre[1]) * WALK_S_PER_M;
    const best = DEADLINES.map((deadline, i) => access.reduce((m, a) => Math.max(m, transit.latest[i][a.stop] - a.walk), deadline - direct));
    const trips = DEPARTURES.flatMap((t) => {
      const i = best.findIndex((latest) => latest >= t);
      return i < 0 ? [] : [DEADLINES[i] - t];
    });
    const m = trips.length >= DEPARTURES.length / 2 ? median(trips) : null;
    return m === null ? -1 : Math.max(1, Math.round(m / 60));
  };

  for (const probe of (process.env.PROBE ?? "").split(";").filter(Boolean)) {
    const [pc, lat, lng] = probe.split(",");
    if (pc !== city) continue;
    const p = proj.toXY([Number(lng), Number(lat)]);
    console.log(`probe ${probe}: ${minutesAt(p)} min, score ${areaScore(inputsAt(p))}`, JSON.stringify(inputsAt(p)));
  }
  if (process.env.PROBE_ONLY) return null as never;
  const [lngMin, latMin] = proj.toLngLat([minX, minY]);
  const [lngMax, latMax] = proj.toLngLat([maxX, maxY]);
  const dLat = CELL_M / 110_574;
  const dLng = CELL_M / (Math.cos((CENTRE[city].lat * Math.PI) / 180) * 111_320);
  const rows = Math.ceil((latMax - latMin) / dLat) + 1;
  const cols = Math.ceil((lngMax - lngMin) / dLng) + 1;
  const score: number[] = [];
  const minutes: number[] = [];
  const district: number[] = [];
  const cellsByDistrict = names.map(() => [] as { p: Pt; score: number; minutes: number }[]);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = proj.toXY([lngMin + c * dLng, latMin + r * dLat]);
      const d = xyRings.findIndex((rings) => insideRings(p, rings));
      if (d < 0) {
        score.push(-1);
        minutes.push(-1);
        district.push(-1);
        continue;
      }
      const s = areaScore(inputsAt(p));
      const m = minutesAt(p);
      score.push(s);
      minutes.push(m);
      district.push(d);
      cellsByDistrict[d].push({ p, score: s, minutes: m });
    }
  console.log(`${city}: ${rows}x${cols} grid, ${cellsByDistrict.flat().length} cells inside, ${Math.round((Date.now() - t0) / 1000)} s`);

  const districts = names.map((name, i) => {
    const cells = cellsByDistrict[i];
    const mean: Pt = [cells.reduce((a, c) => a + c.p[0], 0) / cells.length, cells.reduce((a, c) => a + c.p[1], 0) / cells.length];
    const centre = cells.reduce((a, c) => (Math.hypot(c.p[0] - mean[0], c.p[1] - mean[1]) < Math.hypot(a.p[0] - mean[0], a.p[1] - mean[1]) ? c : a)).p;
    const [lng, lat] = proj.toLngLat(centre);
    const ref = scores.districts.find((d) => d.city === city && d.name === name)!;
    return {
      name,
      slug: slugOf(name),
      center: [Number(lat.toFixed(4)), Number(lng.toFixed(4))] as Pt,
      score: ref.score,
      badge: ref.score >= scores.badgeAt,
      minutes: median(cells.map((c) => c.minutes).filter((m) => m > 0)),
      shape: osm.districts.get(name)!.map((ring) => simplify(ring.map(proj.toXY), 8).map((p) => proj.toLngLat(p).map((v) => Number(v.toFixed(5))) as Pt)),
    };
  });
  return {
    districts,
    grid: { latMin: Number(latMin.toFixed(6)), lngMin: Number(lngMin.toFixed(6)), dLat, dLng, rows, cols, score, minutes, district },
  };
}

const built = Object.fromEntries(await Promise.all(CITIES.map(async (c) => [c, await buildCity(c)] as const))) as Record<City, Awaited<ReturnType<typeof buildCity>>>;

writeFileSync(
  join(OUT, "districts.json"),
  JSON.stringify(Object.fromEntries(CITIES.map((c) => [c, built[c].districts.map(({ name, slug, center }) => ({ name, slug, center }))])), null, 1) + "\n",
);
writeFileSync(
  join(OUT, "area.json"),
  JSON.stringify({
    version: scores.version,
    serviceDay: SERVICE_DAY,
    pointBadgeAt: scores.pointBadgeAt,
    districts: Object.fromEntries(CITIES.map((c) => [c, built[c].districts.map(({ slug, score, badge, minutes }) => ({ slug, score, badge, minutes }))])),
    grid: Object.fromEntries(CITIES.map((c) => [c, built[c].grid])),
  }) + "\n",
);
writeFileSync(
  join(OUT, "district-shapes.json"),
  JSON.stringify(Object.fromEntries(CITIES.map((c) => [c, Object.fromEntries(built[c].districts.map((d) => [d.slug, d.shape]))]))) + "\n",
);
for (const c of CITIES) console.log(c, built[c].districts.map((d) => `${d.slug} ${d.score} ${d.minutes}m`).join(", "));
