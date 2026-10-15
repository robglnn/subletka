"use client";

import { useState } from "react";
import type { Contact } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type ContactTarget = { kind: "imported"; href: string } | { kind: "native"; href: string; reveal: string };

const buttonClass =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground";

export function ContactButton({ target, label, newTab, className }: { target: ContactTarget; label: string; newTab?: boolean; className?: string }) {
  const [email, setEmail] = useState<string | null>(null);

  if (target.kind === "imported") {
    return (
      <a
        href={target.href}
        {...(newTab ? { target: "_blank" } : {})}
        rel={newTab ? "noopener noreferrer nofollow" : "noreferrer nofollow"}
        className={cn(buttonClass, className)}
      >
        {label}
      </a>
    );
  }

  const reveal = () => {
    if (email) return;
    fetch(target.reveal, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Contact>) : null))
      .then((c) => c && setEmail(c.email))
      .catch(() => {});
  };

  return (
    <a href={target.href} rel="nofollow" onClick={reveal} className={cn(buttonClass, email && "flex-col gap-0 leading-tight", className)}>
      {email ? (
        <>
          <span className="text-sm font-normal">{label}</span>
          <span className="break-all">{email}</span>
        </>
      ) : (
        label
      )}
    </a>
  );
}
