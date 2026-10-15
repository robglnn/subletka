import Link from "next/link";
import { setListingStatus, updateListing } from "@/app/[lang]/post/actions";
import { CopyLink } from "@/components/copy-link";
import { PostForm } from "@/components/post-form";
import { findManaged, toFormValues, type ManageAuth } from "@/db/native";
import { DISTRICT_NAMES, isPastDates, warsawDay, type Locale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listingTitle } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";

export async function ManageView({ lang, auth, isNew, shareUrl }: { lang: Locale; auth: ManageAuth; isNew: boolean; shareUrl: string | null }) {
  const t = getDictionary(lang);
  const row = await findManaged(auth, (await getSession())?.email ?? null);
  if (!row) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h1 className="text-4xl">{t.manage.notFound}</h1>
      </div>
    );
  }
  const live = row.status === "active";
  const pastDates = isPastDates(row.availableTo, warsawDay(new Date()));
  const title = listingTitle(lang, { placeType: row.placeType, rooms: row.rooms, district: row.district, city: row.city });
  const next = live ? "removed" : "active";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      {isNew && (
        <section className="flex flex-col gap-3 border-l-4 border-primary pl-4">
          <h1 className="text-4xl">{t.manage.newTitle}</h1>
          <p className="text-base">{t.manage.saveLink}</p>
        </section>
      )}
      {shareUrl && <CopyLink url={shareUrl} labels={{ copy: t.manage.copy, copied: t.manage.copied }} />}
      <header className="flex flex-col gap-3 border-t border-foreground pt-6">
        <p className="text-sm font-semibold text-primary">{t.meta.manageTitle.toLowerCase()}</p>
        <h2 className="text-4xl">{title}</h2>
        {!live && <p className="text-base text-primary">{t.manage.takenDown}</p>}
        {live && pastDates && <p className="text-base text-primary">{t.manage.pastDates}</p>}
        <div className="flex flex-wrap gap-2">
          {live && !pastDates && (
            <Link href={routes.listing(lang, row.id)} className="inline-flex h-11 items-center rounded-sm border border-foreground px-4 font-semibold">
              {t.manage.view}
            </Link>
          )}
          <form action={setListingStatus.bind(null, lang, auth, next)}>
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-sm border border-input px-4 font-semibold"
            >
              {live ? t.manage.takeDown : t.manage.restore}
            </button>
          </form>
        </div>
      </header>
      <section className="flex flex-col gap-6">
        <h2 className="text-3xl">{t.manage.edit}</h2>
        <PostForm
          lang={lang}
          action={updateListing.bind(null, lang, auth)}
          t={t.post}
          cities={t.cities}
          placeTypes={t.listing.placeType}
          districts={DISTRICT_NAMES}
          initial={toFormValues(row, lang)}
          existingPhotos={row.photos}
          mode="edit"
          savedLabel={t.manage.saved}
        />
      </section>
    </div>
  );
}
