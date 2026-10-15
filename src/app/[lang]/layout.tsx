import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isLocale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/seo";
import "../globals.css";

const archivo = localFont({
  src: "../fonts/archivo-pl.woff2",
  weight: "400 700",
  variable: "--font-archivo",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "72% 100%" }],
});

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).meta;
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: "Subletka",
    ...pageMetadata(lang, "", t.title, t.description),
    title: { default: t.title, template: "%s · Subletka" },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={archivo.variable}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader lang={lang} />
        <main className="flex-1">{children}</main>
        <SiteFooter lang={lang} />
      </body>
    </html>
  );
}
