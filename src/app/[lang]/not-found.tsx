import Link from "next/link";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { routes } from "@/lib/routes";

export default async function NotFound() {
  const saved = (await cookies()).get("lang")?.value ?? "";
  const lang = isLocale(saved) ? saved : DEFAULT_LOCALE;
  const t = getDictionary(lang).notFound;
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6">
      <h1 className="text-5xl">{t.title}</h1>
      <Link href={routes.home(lang)} className="inline-flex h-11 items-center font-semibold underline underline-offset-4">
        {t.back}
      </Link>
    </div>
  );
}
