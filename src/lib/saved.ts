export const SAVED_COOKIE = "saved";
export const MAX_SAVED = 100;

export const parseSaved = (raw: string | undefined) =>
  raw
    ? decodeURIComponent(raw)
        .split(",")
        .filter(Boolean)
        .slice(0, MAX_SAVED)
    : [];

export const serializeSaved = (ids: string[]) => encodeURIComponent(ids.slice(0, MAX_SAVED).join(","));
