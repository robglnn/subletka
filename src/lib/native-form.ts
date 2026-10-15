import { z } from "zod";
import { CANCELLATIONS, CITIES, GENDERS, isPastDates, PLACE_TYPES, warsawDay } from "@/lib/domain";

const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalInt = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional()).transform((v) => v ?? null);
const triBool = z.enum(["", "yes", "no"]).transform((v) => (v === "" ? null : v === "yes"));
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .transform((v) => v || null);
export const DEPOSIT_TERMS = ["none", "1", "2", "3", "amount"] as const;

export const NativeForm = z
  .object({
    city: z.enum(CITIES),
    district: z.string().trim().min(2).max(80),
    placeType: z.enum(PLACE_TYPES),
    rooms: optionalInt(1, 20),
    availableFrom: isoDay,
    availableTo: z.preprocess(blankToUndefined, isoDay.optional()).transform((v) => v ?? null),
    minStayMonths: optionalInt(1, 24),
    price: z.coerce.number().int().min(100).max(100_000),
    depositTerm: z.enum(["", ...DEPOSIT_TERMS]).default(""),
    deposit: optionalInt(1, 200_000),
    bills: triBool,
    furnished: triBool,
    pets: triBool,
    additionalCosts: optionalText(300),
    cancellationPolicy: z
      .enum(["", ...CANCELLATIONS])
      .default("")
      .transform((v) => (v === "" ? null : v)),
    roommatesCount: optionalInt(0, 20),
    roommatesGender: z
      .enum(["", ...GENDERS])
      .default("")
      .transform((v) => (v === "" ? null : v)),
    description: optionalText(2000),
    contactEmail: z.string().trim().max(120).pipe(z.email()),
  })
  .superRefine((v, ctx) => {
    if (v.depositTerm === "amount" && v.deposit === null) ctx.addIssue({ code: "custom", path: ["deposit"], message: "amount" });
    if (v.availableTo && v.availableTo < v.availableFrom) ctx.addIssue({ code: "custom", path: ["availableTo"], message: "order" });
    if (isPastDates(v.availableTo, warsawDay(new Date()))) ctx.addIssue({ code: "custom", path: ["availableTo"], message: "past" });
  });

export type NativeValues = z.infer<typeof NativeForm>;

export const depositColumns = (v: Pick<NativeValues, "depositTerm" | "deposit">) => {
  if (v.depositTerm === "none") return { deposit: 0, depositMonths: null };
  if (v.depositTerm === "amount") return { deposit: v.deposit, depositMonths: null };
  if (v.depositTerm === "") return { deposit: null, depositMonths: null };
  return { deposit: null, depositMonths: Number(v.depositTerm) };
};

export const depositTermOf = (deposit: number | null, months: number | null) => {
  if (months) return String(months);
  if (deposit === 0) return "none";
  return deposit ? "amount" : "";
};
export type FormField = keyof z.input<typeof NativeForm>;
export type FormValues = Partial<Record<FormField, string>>;

export type FormState =
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "error"; code: "invalid" | "photos" | "rateLimited" | "generic"; fields: FormField[] };

export const PHOTO_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 2_500_000;
