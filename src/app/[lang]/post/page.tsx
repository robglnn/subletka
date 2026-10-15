import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostForm } from "@/components/post-form";
import { DISTRICT_NAMES, isLocale } from "@/lib/domain";
import { googleConfig } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/session";
import { createListing } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[lang]/post">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).meta;
  return pageMetadata(lang, "/post", t.postTitle, t.description);
}

export default async function PostPage({ params }: PageProps<"/[lang]/post">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const session = await getSession();
  const google = !session && googleConfig();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl sm:text-6xl">{t.post.title}</h1>
        {!session && <p className="text-lg">{t.post.lead}</p>}
        {session && <p className="text-sm text-muted-foreground">{fill(t.post.signedInAs, { email: session.email })}</p>}
        {google && (
          <div className="flex flex-col items-start gap-2 pt-2">
            <a
              href={routes.google(routes.post(lang))}
              className="inline-flex h-12 items-center gap-3 rounded-xl border border-foreground px-5 text-base font-semibold"
            >
              <span aria-hidden className="font-bold">G</span>
              {t.nav.google}
            </a>
            <p className="text-sm text-muted-foreground">{t.post.orGoogle}</p>
          </div>
        )}
      </header>
      <PostForm
        lang={lang}
        action={createListing.bind(null, lang)}
        t={t.post}
        cities={t.cities}
        placeTypes={t.listing.placeType}
        districts={DISTRICT_NAMES}
        initial={session ? { contactEmail: session.email } : {}}
        existingPhotos={[]}
        mode="create"
        savedLabel={t.manage.saved}
      />
    </div>
  );
}
