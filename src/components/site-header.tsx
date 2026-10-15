import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { SiteMenu, type MenuProps } from "@/components/site-menu";
import type { Locale } from "@/lib/domain";
import { googleConfig } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";

export async function SiteHeader({ lang }: { lang: Locale }) {
  const t = getDictionary(lang).nav;
  const session = await getSession();
  const account: MenuProps["account"] = session
    ? { kind: "signedIn", email: session.email }
    : googleConfig()
      ? { kind: "google" }
      : { kind: "none" };
  const items = [
    { label: t.home, href: routes.home(lang) },
    { label: t.post, href: routes.post(lang) },
    { label: t.saved, href: routes.saved(lang) },
    ...(session ? [{ label: t.me, href: routes.me(lang) }] : []),
    { label: t.about, href: routes.about(lang) },
    { label: t.privacy, href: routes.privacy(lang) },
  ];
  const other: Locale = lang === "pl" ? "en" : "pl";
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href={routes.home(lang)} aria-label="Subletka" className="-ml-1 flex h-11 items-center px-1">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href={routes.post(lang)}
            className="hidden h-11 items-center px-3 text-sm font-semibold sm:inline-flex"
          >
            + {t.post}
          </Link>
          <Link href={routes.saved(lang)} aria-label={t.saved} className="inline-flex size-11 items-center justify-center">
            <Heart className="size-5" />
          </Link>
          <Suspense fallback={<span className="inline-flex h-11 min-w-11" />}>
            <LangSwitch to={other} code={t.switchTo} label={t.switchLabel} />
          </Suspense>
          <SiteMenu
            labels={{ menu: t.menu, google: t.google, signOut: t.signOut }}
            items={items}
            account={account}
            googleHref={routes.google("")}
            signOutHref={routes.signOut}
          />
        </div>
      </div>
    </header>
  );
}
