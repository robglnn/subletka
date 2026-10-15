"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/domain";

export function LangSwitch({ to, label, code }: { to: Locale; label: string; code: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const rest = pathname.split("/").slice(2).join("/");
  const href = `/${to}${rest ? `/${rest}` : ""}${search ? `?${search}` : ""}`;
  return (
    <Link
      href={href}
      hrefLang={to}
      aria-label={label}
      className="inline-flex h-11 min-w-11 items-center justify-center px-2 text-sm font-semibold tracking-wide"
    >
      {code}
    </Link>
  );
}
