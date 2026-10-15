import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listingsByOwner } from "@/db/listings";
import { isLocale, isPastDates, warsawDay } from "@/lib/domain";
import { googleConfig } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { availability, listingTitle } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/[lang]/me">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLocale(lang) ? getDictionary(lang).meta.meTitle : undefined, robots: { index: false, follow: false } };
}

export default async function MePage({ params }: PageProps<"/[lang]/me">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const session = await getSession();
  const owned = session ? await listingsByOwner(session.email) : [];
  const today = warsawDay(new Date());
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <h1 className="text-5xl">{t.me.title}</h1>
      {!session ? (
        <div className="flex flex-col items-start gap-3">
          <p>{t.me.signIn}</p>
          {googleConfig() && (
            <a href={routes.google(routes.me(lang))} className="inline-flex h-12 items-center rounded-sm border border-foreground px-5 font-semibold">
              {t.nav.google}
            </a>
          )}
        </div>
      ) : owned.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p>{t.me.empty}</p>
          <Link href={routes.post(lang)} className="inline-flex h-12 items-center rounded-sm bg-primary px-6 font-semibold text-primary-foreground">
            {t.nav.post}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col border-t border-foreground">
          {owned.map(({ listing, status }) => (
            <li key={listing.id} className="border-b border-border">
              <Link href={routes.meListing(lang, listing.id)} className="flex min-h-16 flex-col justify-center gap-1 py-3">
                <span className="text-lg font-semibold">
                  {listingTitle(lang, listing)}
                  {status === "removed" ? (
                    <span className="ml-2 text-sm font-normal text-primary">{t.me.removed}</span>
                  ) : (
                    isPastDates(listing.availableTo, today) && <span className="ml-2 text-sm font-normal text-primary">{t.me.pastDates}</span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t.listing.available} {availability(lang, listing)} · {t.manage.edit} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
