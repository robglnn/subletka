import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionLabel } from "@/components/section-label";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/lib/support";

const withEmail = (p: string) => fill(p, { email: SUPPORT_EMAIL });

export async function generateMetadata({ params }: PageProps<"/[lang]/terms">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return pageMetadata(lang, "/terms", t.meta.termsTitle, withEmail(t.terms.sections[0].p));
}

export default async function TermsPage({ params }: PageProps<"/[lang]/terms">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang).terms;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <div className="flex flex-col gap-3">
        <SectionLabel as="h1" className="text-4xl sm:text-6xl">
          {t.title}
        </SectionLabel>
        <p className="text-sm text-muted-foreground">{t.updated}</p>
      </div>
      <div className="flex flex-col gap-7">
        {t.sections.map((s) => (
          <section key={s.h} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{s.h}</h2>
            <p className="text-base leading-relaxed">{withEmail(s.p)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
