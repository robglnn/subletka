import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { getActiveListing } from "@/db/listings";
import { photoBytes } from "@/db/photo-source";
import { isLocale } from "@/lib/domain";
import { SHARE_SIZE, shareCard, shareVersion, type ShareCard } from "@/lib/share-image";

const CACHE_DIR = path.join(process.env.DATA_DIR ?? tmpdir(), "share-cache");
const FILE = /^([A-Za-z0-9_-]+)\.jpg$/;
const inflight = new Map<string, Promise<Buffer | null>>();
let font: Promise<Buffer> | null = null;

const archivo = () => (font ??= readFile(path.join(process.cwd(), "src/app/fonts/archivo-pl-bold.ttf")));

const notFound = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });

const sticker = { backgroundColor: "#ffffff", color: "#141414", padding: "4px 18px", lineHeight: 1.3 } as const;

async function overlay(card: ShareCard) {
  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "0 80px",
          backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0) 50%, rgba(0,0,0,0.2))",
        }}
      >
        <div style={{ ...sticker, fontSize: 60, textAlign: "center", maxWidth: 1040 }}>{card.title}</div>
        <div style={{ ...sticker, fontSize: 44, display: "flex" }}>
          {card.price}
          {card.unit}
        </div>
      </div>
    ),
    { ...SHARE_SIZE, fonts: [{ name: "Archivo", data: await archivo(), weight: 700, style: "normal" }] },
  );
  return Buffer.from(await image.arrayBuffer());
}

async function render(file: string, card: ShareCard) {
  const cached = await readFile(file).catch(() => null);
  if (cached) return cached;
  const input = await photoBytes(card.photo);
  if (!input) return null;
  const out = await sharp(input)
    .rotate()
    .resize({ ...SHARE_SIZE, fit: "cover" })
    .composite([{ input: await overlay(card) }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, out);
  await rename(tmp, file);
  return out;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/share/[lang]/[file]">) {
  const { lang, file } = await ctx.params;
  const id = file.match(FILE)?.[1];
  if (!isLocale(lang) || !id) return notFound();
  const listing = await getActiveListing(id);
  const card = listing && listing.id === id ? shareCard(lang, listing) : null;
  if (!card) return notFound();
  const name = `${lang}-${id}-${shareVersion(card)}.jpg`;
  let job = inflight.get(name);
  if (!job) {
    job = render(path.join(CACHE_DIR, name), card).finally(() => inflight.delete(name));
    inflight.set(name, job);
  }
  const body = await job.catch(() => null);
  if (!body) return notFound();
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(body.length),
      "cache-control": "public, max-age=86400",
    },
  });
}
