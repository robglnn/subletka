import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { photos } from "@/db/schema";

export async function GET(_request: NextRequest, ctx: RouteContext<"/p/[photoId]">) {
  const { photoId } = await ctx.params;
  const [photo] = await db.select({ mime: photos.mime, bytes: photos.bytes }).from(photos).where(eq(photos.id, photoId));
  if (!photo) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.mime,
      "content-length": String(photo.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
