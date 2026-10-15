import { timingSafeEqual } from "node:crypto";

export const bearerMatches = (header: string | null, token: string | undefined) => {
  if (!token || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
