"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createNative, findManaged, setStatus, updateNative, type ManageAuth, type Upload } from "@/db/native";
import { isLocale, type Locale } from "@/lib/domain";
import { cleanPhoto } from "@/lib/clean-photo";
import { clientIp } from "@/lib/env";
import { MAX_PHOTO_BYTES, MAX_PHOTOS, NativeForm, PHOTO_TYPES, type FormField, type FormState } from "@/lib/native-form";
import { notifyIndexNow } from "@/lib/notify-index";
import { allow } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";

const Auth = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("token"), token: z.string().min(20).max(64) }),
  z.object({ kind: z.literal("owner"), id: z.string().min(3).max(200) }),
]);

const fail = (code: Extract<FormState, { kind: "error" }>["code"], fields: FormField[] = []): FormState => ({
  kind: "error",
  code,
  fields,
});

const readUploads = async (fd: FormData): Promise<Upload[] | "invalid"> => {
  const files = fd.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  const valid = files.every((f) => (PHOTO_TYPES as readonly string[]).includes(f.type) && f.size <= MAX_PHOTO_BYTES);
  if (!valid || files.length > MAX_PHOTOS) return "invalid";
  const cleaned = await Promise.all(files.map(async (f) => cleanPhoto(Buffer.from(await f.arrayBuffer()))));
  return cleaned.every((c) => c !== null) ? cleaned : "invalid";
};

const parseFields = (fd: FormData) => {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = NativeForm.safeParse(raw);
  if (parsed.success) return { ok: true as const, values: parsed.data };
  return { ok: false as const, fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0]) as FormField))] };
};

const manageHref = (lang: Locale, auth: ManageAuth) =>
  auth.kind === "token" ? routes.manage(lang, auth.token) : routes.meListing(lang, auth.id);

export async function createListing(lang: Locale, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isLocale(lang)) return fail("generic");
  if (fd.get("website")) redirect(routes.home(lang));
  if (!allow(`post:${clientIp(await headers())}`, 6, 60 * 60_000)) return fail("rateLimited");
  const uploads = await readUploads(fd);
  if (uploads === "invalid") return fail("photos");
  const parsed = parseFields(fd);
  if (!parsed.ok) return fail("invalid", parsed.fields);
  const session = await getSession();
  const { id, token } = await createNative(parsed.values, lang, uploads, session?.email ?? null);
  notifyIndexNow([id]);
  redirect(`${routes.manage(lang, token)}?new=1`);
}

export async function updateListing(lang: Locale, rawAuth: ManageAuth, _prev: FormState, fd: FormData): Promise<FormState> {
  const auth = Auth.safeParse(rawAuth);
  if (!isLocale(lang) || !auth.success) return fail("generic");
  if (!allow(`edit:${clientIp(await headers())}`, 30, 60 * 60_000)) return fail("rateLimited");
  const row = await findManaged(auth.data, (await getSession())?.email ?? null);
  if (!row) return fail("generic");
  const uploads = await readUploads(fd);
  if (uploads === "invalid") return fail("photos");
  const parsed = parseFields(fd);
  if (!parsed.ok) return fail("invalid", parsed.fields);
  await updateNative(row.id, parsed.values, lang, uploads.length ? uploads : null);
  notifyIndexNow([row.publicId ?? row.id]);
  return { kind: "saved" };
}

export async function setListingStatus(lang: Locale, rawAuth: ManageAuth, status: "active" | "removed") {
  const auth = Auth.safeParse(rawAuth);
  if (!isLocale(lang) || !auth.success || (status !== "active" && status !== "removed")) return;
  const row = await findManaged(auth.data, (await getSession())?.email ?? null);
  if (row) {
    await setStatus(row.id, status);
    notifyIndexNow([row.publicId ?? row.id]);
  }
  redirect(manageHref(lang, auth.data));
}
