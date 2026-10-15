import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ManageView } from "@/components/manage-view";
import { isLocale } from "@/lib/domain";
import { requestOrigin } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { routes } from "@/lib/routes";

export async function generateMetadata({ params }: PageProps<"/[lang]/manage/[token]">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLocale(lang) ? getDictionary(lang).meta.manageTitle : undefined, robots: { index: false, follow: false } };
}

export default async function ManagePage({ params, searchParams }: PageProps<"/[lang]/manage/[token]">) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const isNew = (await searchParams).new === "1";
  const shareUrl = `${requestOrigin(await headers())}${routes.manage(lang, token)}`;
  return <ManageView lang={lang} auth={{ kind: "token", token }} isNew={isNew} shareUrl={shareUrl} />;
}
