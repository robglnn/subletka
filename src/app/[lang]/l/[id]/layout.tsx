import { JsonLd } from "@/components/json-ld";
import { getActiveListing } from "@/db/listings";
import { isLocale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { listingJsonLd } from "@/lib/json-ld";

export default async function ListingLayout({ children, params }: LayoutProps<"/[lang]/l/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) return children;
  const listing = await getActiveListing(decodeURIComponent(id));
  return (
    <>
      {listing && <JsonLd graph={listingJsonLd(listing, lang, siteUrl())} />}
      {children}
    </>
  );
}
