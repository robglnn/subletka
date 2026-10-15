import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD_SIZES, EmptyState, ListingCard } from "@/components/listing-card";
import { SearchForm } from "@/components/search-form";
import { SectionLabel } from "@/components/section-label";
import { latest } from "@/db/listings";
import { CITIES, isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { plural } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const sections = await Promise.all(CITIES.map(async (city) => ({ city, ...(await latest(city, 8)) })));
  const any = sections.some((s) => s.total > 0);
  return (
    <div>
      <section className="bg-secondary">
        <div className="mx-auto flex max-w-3xl flex-col gap-7 px-4 pt-12 pb-10 sm:px-6 sm:pt-20 sm:pb-14">
          <h1 className="text-center text-5xl sm:text-7xl">{t.home.heading}</h1>
          <SearchForm lang={lang} labels={{ ...t.search, close: t.nav.close }} cityNames={t.cities} />
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {any ? (
          sections
            .filter((s) => s.total > 0)
            .map((s, si) => (
              <section key={s.city} className="flex flex-col gap-5 pt-10">
                <div className="flex items-baseline justify-between gap-4">
                  <SectionLabel>{t.cities[s.city]}</SectionLabel>
                  <Link href={routes.city(lang, s.city)} className="inline-flex h-11 items-center text-sm font-semibold">
                    {t.home.seeAll} · {plural(lang, t.results.count, s.total)} →
                  </Link>
                </div>
                <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                  {s.listings.map((l, i) => (
                    <div key={l.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
                      <ListingCard listing={l} lang={lang} sizes={CARD_SIZES.row} priority={si === 0 && i === 0} />
                    </div>
                  ))}
                </div>
              </section>
            ))
        ) : (
          <EmptyState lang={lang} title={t.results.emptyTitle} />
        )}
        <p className="pt-12 text-base text-muted-foreground">{t.home.lead}</p>
      </div>
    </div>
  );
}
