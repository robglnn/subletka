import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { cleanPhoto } from "./clean-photo";

test("an uploaded photo is re-encoded without its EXIF, so no camera location or owner name is stored", async () => {
  const withExif = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#d7263d" } })
    .jpeg()
    .withExif({ IFD0: { Artist: "Anna Kowalska", Copyright: "Anna Kowalska" } })
    .toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif);
  const cleaned = await cleanPhoto(withExif);
  const meta = await sharp(cleaned!.bytes).metadata();
  assert.deepEqual([cleaned!.mime, meta.format, meta.exif, meta.width, meta.height], ["image/webp", "webp", undefined, 1600, 800]);
});

test("a file that is not an image is rejected", async () => {
  assert.equal(await cleanPhoto(Buffer.from("not an image")), null);
});
