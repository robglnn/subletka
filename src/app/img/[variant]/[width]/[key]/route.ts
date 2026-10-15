import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { isActivePhoto, photoBytes } from "@/db/photo-source";
import { isPhotoKey, isPhotoVariant, isPhotoWidth, PHOTO_VARIANTS, type PhotoKey } from "@/lib/photo";

const CACHE_DIR = path.join(process.env.DATA_DIR ?? tmpdir(), "img-cache");
const inflight = new Map<string, Promise<Buffer | null>>();

async function render(file: string, key: PhotoKey, width: number, aspect: number | null) {
  const cached = await readFile(file).catch(() => null);
  if (cached) return cached;
  const input = await photoBytes(key);
  if (!input) return null;
  const out = await sharp(input)
    .rotate()
    .resize(aspect ? { width, height: Math.round(width / aspect), fit: "cover" } : { width, withoutEnlargement: true })
    .webp({ quality: 68 })
    .toBuffer();
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, out);
  await rename(tmp, file);
  return out;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/img/[variant]/[width]/[key]">) {
  const { variant, width: w, key } = await ctx.params;
  const width = Number(w);
  if (!isPhotoVariant(variant) || !isPhotoWidth(width) || !isPhotoKey(key) || !(await isActivePhoto(key))) {
    return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  const name = `${key}-${variant}-${width}.webp`;
  let job = inflight.get(name);
  if (!job) {
    job = render(path.join(CACHE_DIR, name), key, width, PHOTO_VARIANTS[variant].aspect).finally(() => inflight.delete(name));
    inflight.set(name, job);
  }
  const body = await job.catch(() => null);
  if (!body) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(body.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
