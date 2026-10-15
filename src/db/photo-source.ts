import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PhotoKey } from "@/lib/photo";
import { db } from "./index";
import { listings, photos } from "./schema";
import { visible } from "./visibility";

const NATIVE = /^\/p\/([A-Za-z0-9_-]+)$/;
const REBUILD_ON_MISS_MS = 2000;
const MAX_AGE_MS = 60_000;

export const photoKey = (src: string) => createHash("sha256").update(src).digest("base64url").slice(0, 22) as PhotoKey;

let index = new Map<string, string>();
let builtAt = 0;
let building: Promise<void> | null = null;

const rebuild = async () => {
  const rows = await db.select({ photos: listings.photos }).from(listings).where(visible());
  index = new Map(rows.flatMap((r) => r.photos.map((src) => [photoKey(src), src] as const)));
  builtAt = Date.now();
};

const lookup = async (key: PhotoKey) => {
  const age = Date.now() - builtAt;
  if (age > MAX_AGE_MS || (!index.has(key) && age > REBUILD_ON_MISS_MS)) {
    building ??= rebuild().finally(() => (building = null));
    await building;
  }
  return index.get(key) ?? null;
};

export const isActivePhoto = async (key: PhotoKey) => (await lookup(key)) !== null;

export async function photoBytes(key: PhotoKey): Promise<Buffer | null> {
  const src = await lookup(key);
  if (!src) return null;
  const native = src.match(NATIVE);
  if (native) {
    const [row] = await db.select({ bytes: photos.bytes }).from(photos).where(eq(photos.id, native[1]));
    return row ? Buffer.from(row.bytes) : null;
  }
  const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
  return Buffer.from(await res.arrayBuffer());
}
