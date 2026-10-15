import { z } from "zod";

export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 4000;
export const EMAIL_MAX = 254;

export const ListingRef = z
  .string()
  .regex(/^[A-Za-z0-9:_-]{1,40}$/)
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

const SupportForm = z.object({
  email: z.string().trim().max(EMAIL_MAX).pipe(z.email()),
  message: z.string().trim().min(MESSAGE_MIN).max(MESSAGE_MAX),
  listing: ListingRef,
});

export type SupportValues = z.infer<typeof SupportForm>;
export type SupportField = "email" | "message";

export type SupportParse =
  | { kind: "message"; values: SupportValues }
  | { kind: "bot" }
  | { kind: "invalid"; fields: SupportField[] };

export const parseSupport = (raw: Record<string, unknown>): SupportParse => {
  if (raw.website) return { kind: "bot" };
  const parsed = SupportForm.safeParse(raw);
  if (parsed.success) return { kind: "message", values: parsed.data };
  return { kind: "invalid", fields: [...new Set(parsed.error.issues.map((i) => i.path[0] as SupportField))] };
};

export type SupportState =
  | { kind: "idle" }
  | { kind: "sent" }
  | { kind: "error"; code: "invalid" | "rateLimited" | "generic"; fields: SupportField[] };
