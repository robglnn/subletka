import { eq, inArray } from "drizzle-orm";
import districts from "../src/data/districts.json";
import { db } from "../src/db";
import { applyIngest } from "../src/db/ingest";
import { refreshMatching } from "../src/db/matching";
import { listings, photos } from "../src/db/schema";
import { refreshSignals } from "../src/db/signals";
import { runMigrations } from "../src/instrumentation-node";
import { parseIngest } from "../src/lib/ingest-contract";
import { routes } from "../src/lib/routes";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/subletka";
if (!["localhost", "127.0.0.1", "postgres", "db"].includes(new URL(url).hostname) && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error("refusing to seed a non-local database; set SEED_ALLOW_REMOTE=1 to override");
  process.exit(1);
}

const SOURCE = "fixture";
const PHOTOS_PER_LISTING = 5;

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PALETTES = [
  { wall: "#efe9e1", floor: "#b98b5e", accent: "#d7263d", fabric: "#3d5a80", wood: "#8c5a3c" },
  { wall: "#e6eef0", floor: "#a47551", accent: "#2a9d8f", fabric: "#e9c46a", wood: "#6b4f3a" },
  { wall: "#f4efe6", floor: "#c8a27a", accent: "#264653", fabric: "#9b2226", wood: "#7f5539" },
  { wall: "#ecebf3", floor: "#9c7a5b", accent: "#e76f51", fabric: "#4a4e69", wood: "#5e503f" },
  { wall: "#f1f3ec", floor: "#b08968", accent: "#588157", fabric: "#dda15e", wood: "#6f4518" },
];

type Palette = (typeof PALETTES)[number];

const W = 1200;
const H = 900;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
const win = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" fill="#fff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#bcd9ea"/><rect x="${x}" y="${y + h * 0.62}" width="${w}" height="${h * 0.38}" fill="#9cc3a3"/><rect x="${x + w / 2 - 6}" y="${y}" width="12" height="${h}" fill="#fff"/><rect x="${x}" y="${y + h / 2 - 6}" width="${w}" height="12" fill="#fff"/>`;
const plant = (x: number, y: number, p: Palette) =>
  `<circle cx="${x}" cy="${y - 90}" r="70" fill="#4f772d"/><circle cx="${x - 40}" cy="${y - 50}" r="45" fill="#6a994e"/><rect x="${x - 40}" y="${y - 40}" width="80" height="80" rx="8" fill="${p.wood}"/>`;

const SCENES: ((p: Palette, r: () => number) => string)[] = [
  (p, r) =>
    svg(
      `<rect width="${W}" height="${H}" fill="${p.wall}"/><rect y="640" width="${W}" height="260" fill="${p.floor}"/>${win(130 + r() * 80, 140, 300, 340)}` +
        `<rect x="560" y="470" width="520" height="190" rx="22" fill="${p.fabric}"/><rect x="560" y="400" width="520" height="110" rx="22" fill="#fff"/><rect x="590" y="420" width="150" height="70" rx="16" fill="${p.accent}"/>` +
        `<rect x="700" y="160" width="220" height="160" fill="${p.accent}" opacity=".85"/><rect x="720" y="180" width="180" height="120" fill="#fff" opacity=".35"/>${plant(1110, 660, p)}`,
    ),
  (p, r) =>
    svg(
      `<rect width="${W}" height="${H}" fill="${p.wall}"/><rect y="700" width="${W}" height="200" fill="${p.floor}"/>${win(380, 90 + r() * 40, 440, 480)}` +
        `<rect x="300" y="610" width="600" height="40" fill="${p.wood}"/><rect x="330" y="650" width="30" height="120" fill="${p.wood}"/><rect x="840" y="650" width="30" height="120" fill="${p.wood}"/>` +
        `<rect x="420" y="540" width="70" height="70" rx="10" fill="${p.accent}"/><rect x="560" y="560" width="160" height="50" fill="${p.fabric}"/>${plant(1060, 720, p)}`,
    ),
  (p) =>
    svg(
      `<rect width="${W}" height="${H}" fill="${p.wall}"/><rect y="760" width="${W}" height="140" fill="${p.floor}"/>` +
        `<rect x="80" y="120" width="1040" height="210" fill="#fff"/>${[0, 1, 2, 3].map((i) => `<rect x="${100 + i * 255}" y="140" width="235" height="170" fill="${p.wood}" opacity=".9"/>`).join("")}` +
        `<rect x="80" y="520" width="1040" height="40" fill="#e9e5df"/><rect x="80" y="560" width="1040" height="200" fill="${p.fabric}"/>${[0, 1, 2, 3].map((i) => `<rect x="${100 + i * 255}" y="580" width="235" height="160" fill="#fff" opacity=".18"/>`).join("")}` +
        `<rect x="300" y="420" width="200" height="100" fill="#cfd8dc"/><circle cx="820" cy="490" r="34" fill="${p.accent}"/><rect x="790" y="450" width="60" height="16" fill="${p.accent}"/>`,
    ),
  (p) =>
    svg(
      `<rect width="${W}" height="${H}" fill="#f7f7f5"/>${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${H}" stroke="#e1e4e6" stroke-width="4"/>`).join("")}` +
        `${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${W}" y2="${i * 100}" stroke="#e1e4e6" stroke-width="4"/>`).join("")}` +
        `<rect x="140" y="520" width="620" height="240" rx="60" fill="#fff" stroke="#cfd8dc" stroke-width="10"/><rect x="840" y="440" width="220" height="320" fill="${p.wood}"/>` +
        `<ellipse cx="950" cy="420" rx="120" ry="34" fill="#fff" stroke="#cfd8dc" stroke-width="8"/><rect x="860" y="160" width="180" height="220" rx="12" fill="#bcd9ea" stroke="#fff" stroke-width="14"/><rect x="200" y="300" width="80" height="140" fill="${p.accent}"/>`,
    ),
  (p, r) => {
    const floors = 4 + Math.floor(r() * 3);
    const rows = Array.from({ length: floors }, (_, f) =>
      [0, 1, 2, 3, 4].map((c) => `<rect x="${250 + c * 145}" y="${760 - (f + 1) * 120}" width="85" height="80" fill="#bcd9ea" stroke="#fff" stroke-width="6"/>`).join(""),
    ).join("");
    return svg(
      `<rect width="${W}" height="${H}" fill="#cfe3ee"/><rect x="210" y="${760 - floors * 120 - 40}" width="780" height="${floors * 120 + 40}" fill="${p.wall}" stroke="${p.wood}" stroke-width="6"/>${rows}` +
        `<rect y="760" width="${W}" height="140" fill="#8d99ae"/><rect x="560" y="680" width="80" height="80" fill="${p.accent}"/><circle cx="110" cy="640" r="90" fill="#6a994e"/><rect x="100" y="640" width="20" height="120" fill="${p.wood}"/>`,
    );
  },
];

const STREETS = {
  warszawa: ["Puławska", "Marszałkowska", "Grochowska", "Słowackiego", "Górczewska", "Grójecka", "Targowa", "Kondratowicza"],
  krakow: ["Karmelicka", "Dietla", "Grzegórzecka", "Wielicka", "Kalwaryjska", "Królewska", "Mogilska", "Zakopiańska"],
};

const COPY = {
  pl: {
    whole_place: (d: string, s: string) => [`Jasne mieszkanie, ${d}`, `Mieszkanie przy ul. ${s}, kilka minut od tramwaju. Umeblowane, z pralką i szybkim internetem. Idealne na kilka miesięcy pracy lub studiów.`],
    private_room: (d: string, s: string) => [`Pokój w mieszkaniu, ${d}`, `Przestronny pokój przy ul. ${s}. Wspólna kuchnia i łazienka, spokojni współlokatorzy, sklepy i przystanek za rogiem.`],
    shared_room: (d: string, s: string) => [`Miejsce w pokoju dwuosobowym, ${d}`, `Łóżko w pokoju dwuosobowym przy ul. ${s}. Rachunki w cenie, dobry dojazd na uczelnię.`],
  },
  en: {
    whole_place: (d: string, s: string) => [`Bright flat in ${d}`, `Flat on ${s} street, a short walk from the tram. Furnished, with a washing machine and fast wifi. Good for a few months of work or study.`],
    private_room: (d: string, s: string) => [`Room in a shared flat, ${d}`, `Spacious room on ${s} street. Shared kitchen and bathroom, quiet flatmates, shops and a stop around the corner.`],
    shared_room: (d: string, s: string) => [`Bed in a twin room, ${d}`, `Bed in a twin room on ${s} street. Bills included, easy commute to campus.`],
  },
};

const PLAN: { city: keyof typeof STREETS; districts: string[]; count: number }[] = [
  { city: "warszawa", districts: ["Śródmieście", "Mokotów", "Wola", "Żoliborz", "Praga-Południe", "Praga-Północ", "Ochota", "Bielany", "Ursynów"], count: 24 },
  { city: "krakow", districts: ["Stare Miasto", "Grzegórzki", "Krowodrza", "Podgórze", "Dębniki", "Zwierzyniec"], count: 12 },
];

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const fixtures = () => {
  const now = new Date().toISOString();
  return PLAN.flatMap(({ city, districts: names, count }) =>
    Array.from({ length: count }, (_, i) => {
      const r = rng(city.length * 1000 + i);
      const n = `${city}-${String(i + 1).padStart(2, "0")}`;
      const district = names[i % names.length];
      const center = districts[city].find((d) => d.name === district)!.center;
      const placeType = (["private_room", "whole_place", "private_room", "shared_room", "whole_place"] as const)[i % 5];
      const lang = i % 3 === 0 ? "en" : "pl";
      const street = STREETS[city][i % STREETS[city].length];
      const [title, description] = COPY[lang][placeType](district, street);
      const eur = i % 7 === 3;
      const base = { whole_place: 3600, private_room: 2100, shared_room: 1300 }[placeType] * (city === "krakow" ? 0.88 : 1);
      const pln = Math.round((base * (0.85 + r() * 0.5)) / 50) * 50;
      const starts = Math.floor(r() * 50) - 10;
      const shared = placeType !== "whole_place";
      const price = eur
        ? { amount: Math.round(pln / 4.3 / 10) * 10, currency: "EUR", period: "month" }
        : { amount: pln, currency: "PLN", period: "month", billsIncluded: placeType === "shared_room" };
      return {
        id: `${SOURCE}:${n}`,
        source: SOURCE,
        sourceId: n,
        sourceUrl: `https://listings.example.com/${n}`,
        sourceName: "Example",
        city,
        district,
        lat: Math.round((center[0] + (r() - 0.5) * 0.012) * 1e4) / 1e4,
        lng: Math.round((center[1] + (r() - 0.5) * 0.018) * 1e4) / 1e4,
        title,
        lang,
        description,
        price,
        deposit: placeType === "whole_place" ? price.amount : null,
        cancellationPolicy: (["flexible", "moderate", "strict", null] as const)[i % 4],
        availableFrom: day(starts),
        availableTo: i % 4 === 1 ? null : day(starts + 60 + Math.floor(r() * 180)),
        minStayDays: [30, 60, 90][i % 3],
        termKind: (["mid_term", "sublet", "flexible"] as const)[i % 3],
        placeType,
        rooms: placeType === "whole_place" ? 1 + (i % 3) : null,
        areaM2: placeType === "whole_place" ? 28 + Math.floor(r() * 40) : 10 + Math.floor(r() * 8),
        roommates: shared ? { count: 1 + (i % 3), genders: (["female", "male", "mixed"] as const)[i % 3] } : null,
        furnished: true,
        petsAllowed: i % 4 === 0,
        photos: Array.from({ length: PHOTOS_PER_LISTING }, (_, k) => `https://listings.example.com/${n}/${k}.svg`),
        fetchedAt: now,
      };
    }),
  );
};

const photoRows = (listingId: string, index: number) => {
  const palette = PALETTES[index % PALETTES.length];
  const r = rng(index + 7);
  return Array.from({ length: PHOTOS_PER_LISTING }, (_, position) => ({
    id: `${listingId.replace(/[^A-Za-z0-9]/g, "-")}-${position}`,
    listingId,
    position,
    mime: "image/svg+xml",
    bytes: Buffer.from(SCENES[(index % 2 ? [1, 0, 2, 4, 3] : [0, 1, 4, 3, 2])[position]](palette, r)),
  }));
};

const main = async () => {
  await runMigrations(url);
  const items = fixtures();
  const batch = parseIngest({ activeSourceUrls: { [SOURCE]: items.map((l) => l.sourceUrl) }, listings: items });
  if (!batch || batch.rejected.length) throw new Error(`fixture rejected: ${JSON.stringify(batch?.rejected)}`);
  await applyIngest(batch);
  await db.transaction(async (tx) => {
    const ids = items.map((l) => l.id);
    await tx.delete(photos).where(inArray(photos.listingId, ids));
    for (const [index, id] of ids.entries()) {
      const rows = photoRows(id, index);
      await tx.insert(photos).values(rows);
      await tx
        .update(listings)
        .set({ photos: rows.map((p) => routes.photo(p.id)) })
        .where(eq(listings.id, id));
    }
    await refreshSignals(tx);
    await refreshMatching(tx);
  });
  console.log(`seeded ${items.length} synthetic listings with ${items.length * PHOTOS_PER_LISTING} generated photos`);
};

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
