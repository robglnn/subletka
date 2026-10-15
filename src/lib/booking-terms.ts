import { CANCELLATIONS, type Cancellation, type Deposit } from "@/lib/domain";

const byFreeDays = (days: number): Cancellation => (days <= 7 ? "flexible" : days <= 14 ? "moderate" : "strict");

export const importedCancellation = (raw: string | null | undefined): Cancellation | null => {
  const text = raw?.trim().toLowerCase();
  if (!text) return null;
  const days = text.match(/\((\d{1,3})[\s-]*days?\)/)?.[1];
  if (days) return byFreeDays(Number(days));
  return CANCELLATIONS.find((c) => c === text) ?? null;
};

export const depositOf = (amount: number | null, months: number | null): Deposit | null => {
  if (months) return { kind: "months", months };
  if (amount === 0) return { kind: "none" };
  return amount ? { kind: "amount", amount } : null;
};

export const depositAmount = (d: Deposit | null, monthlyRent: number): number | null => {
  if (!d) return null;
  if (d.kind === "none") return 0;
  return d.kind === "months" ? d.months * monthlyRent : d.amount;
};
