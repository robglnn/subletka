import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contact-form";
import { SectionLabel } from "@/components/section-label";
import { getActiveListing } from "@/db/listings";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listingTitle } from "@/lib/i18n/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/lib/support";
import { ListingRef } from "@/lib/support-form";
import { sendSupport } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return pageMetadata(lang, "/contact", t.meta.contactTitle, t.contact.lead);
}

export default async function ContactPage({ params, searchParams }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const ref = ListingRef.parse((await searchParams).listing);
  const listing = ref ? await getActiveListing(ref) : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <header className="flex flex-col gap-3">
        <SectionLabel as="h1" className="text-4xl sm:text-6xl">
          {t.contact.title}
        </SectionLabel>
        <p className="text-lg">{t.contact.lead}</p>
      </header>
      <ContactForm
        action={sendSupport.bind(null, lang)}
        t={t.contact}
        listing={listing && { id: listing.id, title: listingTitle(lang, listing), href: routes.listing(lang, listing.id) }}
        homeHref={routes.home(lang)}
        email={SUPPORT_EMAIL}
      />
    </div>
  );
}
