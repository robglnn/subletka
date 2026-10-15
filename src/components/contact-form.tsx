"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { fieldClass, labelClass } from "@/components/field";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { EMAIL_MAX, MESSAGE_MAX, MESSAGE_MIN, type SupportField, type SupportState } from "@/lib/support-form";
import { cn } from "@/lib/utils";

type Action = (state: SupportState, fd: FormData) => Promise<SupportState>;
type ListingContext = { id: string; title: string; href: string };

export function ContactForm({
  action,
  t,
  listing,
  homeHref,
  email,
}: {
  action: Action;
  t: Dictionary["contact"];
  listing: ListingContext | null;
  homeHref: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(action, { kind: "idle" });

  if (state.kind === "sent") {
    return (
      <div role="status" className="flex flex-col items-start gap-6 border-t border-border pt-8">
        <p className="font-condensed text-3xl font-bold sm:text-4xl">{t.sent}</p>
        <Link href={homeHref} className="inline-flex h-11 items-center text-base font-semibold underline underline-offset-4">
          {t.back}
        </Link>
      </div>
    );
  }

  const bad = (f: SupportField) => state.kind === "error" && state.fields.includes(f);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div aria-live="polite">
        {state.kind === "error" && <p className="border-l-4 border-primary pl-3 text-base text-primary">{t.errors[state.code]}</p>}
      </div>

      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {listing && (
        <p className="text-base">
          <input type="hidden" name="listing" value={listing.id} />
          <span className="text-muted-foreground">{t.about}: </span>
          <Link href={listing.href} className="font-semibold underline underline-offset-4">
            {listing.title}
          </Link>
        </p>
      )}

      <label className={labelClass}>
        {t.email}
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={EMAIL_MAX}
          aria-invalid={bad("email") || undefined}
          className={fieldClass}
        />
        {bad("email") && <span className="font-normal text-primary">{t.errors.email}</span>}
      </label>

      <label className={labelClass}>
        {t.message}
        <textarea
          name="message"
          rows={8}
          required
          minLength={MESSAGE_MIN}
          maxLength={MESSAGE_MAX}
          placeholder={listing ? t.reportHint : undefined}
          aria-invalid={bad("message") || undefined}
          className={cn(fieldClass, "h-auto py-3 leading-relaxed")}
        />
        <span className={cn("font-normal", bad("message") ? "text-primary" : "text-muted-foreground")}>
          {bad("message") ? t.errors.message : t.messageHint}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-xl bg-primary px-10 text-lg font-semibold text-primary-foreground disabled:opacity-60 sm:w-fit"
      >
        {pending ? t.submitting : t.submit}
      </button>

      <p className="text-sm text-muted-foreground">
        {t.orEmail}{" "}
        <a href={`mailto:${email}`} className="font-semibold text-foreground underline underline-offset-4">
          {email}
        </a>
      </p>
    </form>
  );
}
