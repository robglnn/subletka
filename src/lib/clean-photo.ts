import "server-only";
import sharp from "sharp";

const MAX_EDGE = 1600;

export const cleanPhoto = async (bytes: Buffer): Promise<{ mime: "image/webp"; bytes: Buffer } | null> => {
  try {
    const out = await sharp(bytes)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { mime: "image/webp", bytes: out };
  } catch {
    return null;
  }
};
