import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageView } from "@/components/manage-view";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/me/[id]">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLocale(lang) ? getDictionary(lang).meta.manageTitle : undefined, robots: { index: false, follow: false } };
}

export default async function OwnedListingPage({ params }: PageProps<"/[lang]/me/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  return <ManageView lang={lang} auth={{ kind: "owner", id: decodeURIComponent(id) }} isNew={false} shareUrl={null} />;
}
