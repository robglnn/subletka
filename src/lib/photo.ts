export const PHOTO_WIDTHS = [320, 480, 640, 960, 1280, 1920] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

export const PHOTO_VARIANTS = {
  card: { aspect: 3 / 4 },
  full: { aspect: null },
} as const;
export type PhotoVariant = keyof typeof PHOTO_VARIANTS;

export type PhotoKey = string & { readonly __photoKey: unique symbol };

export const photoSrc = (key: PhotoKey, variant: PhotoVariant, width: PhotoWidth) => `/img/${variant}/${width}/${key}`;

export const photoSrcSet = (key: PhotoKey, variant: PhotoVariant) =>
  PHOTO_WIDTHS.map((w) => `${photoSrc(key, variant, w)} ${w}w`).join(", ");

export const isPhotoVariant = (v: string): v is PhotoVariant => Object.hasOwn(PHOTO_VARIANTS, v);
export const isPhotoWidth = (w: number): w is PhotoWidth => (PHOTO_WIDTHS as readonly number[]).includes(w);
export const isPhotoKey = (k: string): k is PhotoKey => /^[A-Za-z0-9_-]{22}$/.test(k);
