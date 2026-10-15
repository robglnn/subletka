import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/lib/support";

const withEmail = (p: string) => fill(p, { email: SUPPORT_EMAIL });

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return pageMetadata(lang, "/privacy", t.meta.privacyTitle, withEmail(t.privacy.sections[0].p));
}

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang).privacy;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <SectionLabel as="h1" className="text-4xl sm:text-6xl">
        {t.title}
      </SectionLabel>
      <div className="flex flex-col gap-7">
        {t.sections.map((s) => (
          <section key={s.h} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{s.h}</h2>
            <p className="text-base leading-relaxed">{withEmail(s.p)}</p>
          </section>
        ))}
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">{t.contact}</h2>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex h-11 w-fit items-center text-base font-semibold underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          <Link href={routes.contact(lang)} className="inline-flex h-11 w-fit items-center text-base font-semibold underline underline-offset-4">
            {t.form}
          </Link>
        </section>
      </div>
    </div>
  );
}
