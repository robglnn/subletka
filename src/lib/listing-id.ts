import { createHmac } from "node:crypto";

const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required to derive public listing ids");
  return "subletka-dev-listing-ids";
};

export const publicListingId = (rowId: string, origin: "imported" | "native") =>
  origin === "native" ? rowId : createHmac("sha256", secret()).update(`listing:${rowId}`).digest("base64url").slice(0, 16);

const ROW_ID = /^[a-z][a-z0-9_-]*:[A-Za-z0-9_./-]+$/;

export const legacyRowId = (requested: string) => {
  if (ROW_ID.test(requested)) return requested;
  const decoded = Buffer.from(requested, "base64url").toString();
  return ROW_ID.test(decoded) ? decoded : null;
};
