import Link from "next/link";
import { Mark } from "@/components/logo";
import type { Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { routes } from "@/lib/routes";

export function SiteFooter({ lang }: { lang: Locale }) {
  const t = getDictionary(lang);
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Mark className="size-6" />
          <span>Subletka</span>
        </div>
        <nav className="flex flex-wrap gap-x-1">
          {[
            [t.nav.about, routes.about(lang)],
            [t.nav.post, routes.post(lang)],
            [t.nav.saved, routes.saved(lang)],
            [t.nav.privacy, routes.privacy(lang)],
            [t.nav.terms, routes.terms(lang)],
            [t.nav.contact, routes.contact(lang)],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="inline-flex h-11 items-center px-2 first:pl-0">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        <a href="https://www.openstreetmap.org/copyright" className="underline-offset-2 hover:underline">
          {t.nav.dataCredit}
        </a>
      </p>
    </footer>
  );
}
