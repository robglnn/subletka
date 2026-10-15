import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaBadge } from "@/components/area-badge";
import { SectionLabel } from "@/components/section-label";
import { isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return pageMetadata(lang, "/about", t.meta.aboutTitle, t.about.lines[0]);
}

export default async function AboutPage({ params }: PageProps<"/[lang]/about">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <SectionLabel as="h1" className="text-4xl sm:text-6xl">
        {t.about.title}
      </SectionLabel>
      <div className="flex flex-col border-t border-foreground">
        {t.about.lines.map((line) => (
          <p key={line} className="border-b border-border py-6 text-2xl leading-snug sm:text-3xl">
            {line}
          </p>
        ))}
      </div>
      <dl className="flex items-center text-lg">
        <dt className="-ml-3">
          <AreaBadge label={t.area.badge} />
        </dt>
        <dd>{t.area.badge}</dd>
      </dl>
      <Link href={routes.post(lang)} className="inline-flex h-12 w-fit items-center rounded-sm bg-primary px-6 font-semibold text-primary-foreground">
        {t.nav.post}
      </Link>
    </div>
  );
}
