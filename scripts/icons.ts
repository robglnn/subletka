import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { appIconSvg, markSvg, ogSvg } from "../src/lib/brand";

const png = (svg: string, width: number, height = width) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(width, height).png().toBuffer();

const ico = (images: { size: number; data: Buffer }[]) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
};

async function main() {
  writeFileSync("src/app/icon.svg", markSvg());
  writeFileSync("src/app/apple-icon.png", await png(appIconSvg(), 180));
  writeFileSync("public/icon-192.png", await png(appIconSvg(), 192));
  writeFileSync("public/icon-512.png", await png(appIconSvg(), 512));
  writeFileSync("public/og.png", await png(ogSvg(), 1200, 630));
  const sizes = [16, 32, 48];
  writeFileSync("src/app/favicon.ico", ico(await Promise.all(sizes.map(async (size) => ({ size, data: await png(markSvg(), size) })))));
  console.log("icons written");
}

main();
