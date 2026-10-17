import { LOCALE_TAG, PLACE_FILTERS, type City, type District, type Listing, type Locale, type PlaceType, type PricePeriod } from "@/lib/domain";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fill } from "@/lib/i18n/fill";
import { availability, listingTitle, priceView } from "@/lib/i18n/format";
import { displayMoney, roundMoney } from "@/lib/money";
import { photoSrc } from "@/lib/photo";
import { listingUrl } from "@/lib/public-listing";
import type { CityRent, RentGroup } from "@/lib/rent-stats";
import { routes } from "@/lib/routes";
import { SUPPORT_EMAIL } from "@/lib/support";

type Node = { "@type": string | string[]; "@id"?: string; [key: string]: unknown };
export type JsonLdGraph = { "@context": "https://schema.org"; "@graph": Node[] };

const ACCOMMODATION: Record<PlaceType, string> = { whole_place: "Apartment", private_room: "Room", shared_room: "Room" };
const UNIT_CODE: Record<PricePeriod, string> = { month: "MON", week: "WEE", night: "DAY" };
const COUNTRY: Record<Locale, string> = { pl: "Polska", en: "Poland" };
const WIKIDATA: Record<City | "poland", string> = {
  warszawa: "https://www.wikidata.org/wiki/Q270",
  krakow: "https://www.wikidata.org/wiki/Q31487",
  poland: "https://www.wikidata.org/wiki/Q36",
};

const ids = (site: string) => ({ org: `${site}/#organization`, website: `${site}/#website` });

const publisher = (site: string): Node[] => [
  {
    "@type": "Organization",
    "@id": ids(site).org,
    name: "Subletka",
    url: site,
    logo: `${site}/icon-512.png`,
    email: SUPPORT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, availableLanguage: ["pl", "en"] },
    areaServed: [
      { "@type": "City", name: "Warszawa", sameAs: WIKIDATA.warszawa },
      { "@type": "City", name: "Kraków", sameAs: WIKIDATA.krakow },
    ],
  },
  {
    "@type": "WebSite",
    "@id": ids(site).website,
    name: "Subletka",
    url: site,
    inLanguage: [LOCALE_TAG.pl, LOCALE_TAG.en],
    publisher: { "@id": ids(site).org },
  },
];

const cityPlace = (city: City, lang: Locale): Node => ({
  "@type": "City",
  name: getDictionary(lang).cities[city],
  sameAs: WIKIDATA[city],
  containedInPlace: { "@type": "Country", name: COUNTRY[lang], sameAs: WIKIDATA.poland },
});

const breadcrumb = (id: string, items: [string, string][]): Node => ({
  "@type": "BreadcrumbList",
  "@id": id,
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

const yesNo = (name: string, value: boolean | null) =>
  value === null ? [] : [{ "@type": "LocationFeatureSpecification", name, value }];

export const listingJsonLd = (l: Listing, lang: Locale, site: string): JsonLdGraph => {
  const t = getDictionary(lang);
  const url = listingUrl(site, lang, l.id);
  const title = listingTitle(lang, l);
  const price = priceView(lang, l);
  const money = displayMoney(l.price, lang);
  const images = l.photos.map((k) => `${site}${photoSrc(k, "full", 1280)}`);
  const city = cityPlace(l.city, lang);
  const accommodation: Node = {
    "@type": ACCOMMODATION[l.placeType],
    "@id": `${url}#accommodation`,
    name: title,
    url,
    ...(images.length ? { image: images } : {}),
    ...(l.placeType === "whole_place" && l.rooms ? { numberOfRooms: l.rooms } : {}),
    ...(l.areaM2 ? { floorSize: { "@type": "QuantitativeValue", value: Math.round(l.areaM2), unitCode: "MTK" } } : {}),
    ...(l.petsAllowed === null ? {} : { petsAllowed: l.petsAllowed }),
    amenityFeature: [...yesNo("furnished", l.furnished), ...yesNo("bills included", l.price.billsIncluded)],
    containedInPlace: l.district ? { "@type": "Place", name: l.district, containedInPlace: city } : city,
  };
  const offer: Node = {
    "@type": "Offer",
    url,
    price: money.amount,
    priceCurrency: money.currency,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: money.amount,
      priceCurrency: money.currency,
      unitCode: UNIT_CODE[l.price.period],
      ...(l.price.startingAt ? { minPrice: money.amount } : {}),
    },
    availability: "https://schema.org/InStock",
    businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
    ...(l.availableFrom ? { availabilityStarts: l.availableFrom } : {}),
    ...(l.availableTo ? { availabilityEnds: l.availableTo } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateListing",
        "@id": url,
        url,
        name: `${title} · ${t.cities[l.city]}`,
        description: `${t.listing.available} ${availability(lang, l)} · ${price.main}${price.unit}`,
        inLanguage: LOCALE_TAG[lang],
        ...(l.postedAt ? { datePosted: l.postedAt.toISOString().slice(0, 10) } : {}),
        ...(images.length ? { image: images[0] } : {}),
        ...(l.minStayDays ? { leaseLength: { "@type": "QuantitativeValue", minValue: l.minStayDays, unitCode: "DAY" } } : {}),
        mainEntity: { "@id": accommodation["@id"] },
        offers: offer,
        breadcrumb: { "@id": `${url}#breadcrumb` },
        isPartOf: { "@id": ids(site).website },
        publisher: { "@id": ids(site).org },
      },
      accommodation,
      breadcrumb(`${url}#breadcrumb`, [
        ["Subletka", `${site}${routes.home(lang)}`],
        [t.cities[l.city], `${site}${routes.city(lang, l.city)}`],
        [title, url],
      ]),
      ...publisher(site),
    ],
  };
};

export const cityJsonLd = (city: City, lang: Locale, site: string, listings: Listing[], total: number): JsonLdGraph => {
  const t = getDictionary(lang);
  const url = `${site}${routes.city(lang, city)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: t.meta.cityTitle[city],
        description: t.meta.description,
        inLanguage: LOCALE_TAG[lang],
        about: cityPlace(city, lang),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: total,
          itemListElement: listings.map((l, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: listingUrl(site, lang, l.id),
            name: listingTitle(lang, l),
          })),
        },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        isPartOf: { "@id": ids(site).website },
        publisher: { "@id": ids(site).org },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        isPartOf: { "@id": url },
        mainEntity: t.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
      breadcrumb(`${url}#breadcrumb`, [
        ["Subletka", `${site}${routes.home(lang)}`],
        [t.cities[city], url],
      ]),
      ...publisher(site),
    ],
  };
};

export const rentJsonLd = (rent: CityRent, lang: Locale, site: string, today: Date): JsonLdGraph => {
  const t = getDictionary(lang);
  const { city } = rent;
  const cityUrl = `${site}${routes.city(lang, city)}`;
  const url = `${site}${routes.rent(lang, city)}`;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const measured = (name: string, g: RentGroup) => {
    if (g.medianPln === null) return [];
    const m = roundMoney(displayMoney({ amount: g.medianPln, currency: "PLN" }, lang));
    return [{ "@type": "PropertyValue", name, value: m.amount, unitText: m.currency }];
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: t.rent.metaTitle[city],
        inLanguage: LOCALE_TAG[lang],
        about: cityPlace(city, lang),
        ...(rent.updatedAt ? { dateModified: rent.updatedAt.toISOString() } : {}),
        mainEntity: { "@id": `${url}#dataset` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        isPartOf: { "@id": ids(site).website },
        publisher: { "@id": ids(site).org },
      },
      {
        "@type": "Dataset",
        "@id": `${url}#dataset`,
        url,
        name: t.rent.datasetName[city],
        description: fill(t.rent.datasetDescription, { city: t.meta.cityIn[city] }),
        inLanguage: LOCALE_TAG[lang],
        isAccessibleForFree: true,
        creator: { "@id": ids(site).org },
        publisher: { "@id": ids(site).org },
        spatialCoverage: cityPlace(city, lang),
        temporalCoverage: day(today),
        ...(rent.updatedAt ? { dateModified: rent.updatedAt.toISOString() } : {}),
        measurementTechnique: t.rent.method,
        variableMeasured: [
          ...measured(fill(t.rent.variable, { kind: t.cities[city] }), rent.all),
          ...PLACE_FILTERS.flatMap((k) => measured(fill(t.rent.variable, { kind: t.filters.types[k] }), rent.kinds[k])),
          ...rent.districts.flatMap((d) => measured(fill(t.rent.variable, { kind: d.name }), d)),
        ],
      },
      breadcrumb(`${url}#breadcrumb`, [
        ["Subletka", `${site}${routes.home(lang)}`],
        [t.cities[city], cityUrl],
        [t.rent.link, url],
      ]),
      ...publisher(site),
    ],
  };
};

export const serializeJsonLd = (graph: JsonLdGraph) => JSON.stringify(graph).replace(/</g, "\\u003c");

export const districtJsonLd = (city: City, district: District, lang: Locale, site: string, listings: Listing[], total: number): JsonLdGraph => {
  const t = getDictionary(lang);
  const cityUrl = `${site}${routes.city(lang, city)}`;
  const url = `${site}${routes.district(lang, city, district.slug)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: fill(t.district.title, { district: district.name, city: t.cities[city] }),
        description: fill(t.district.intro, { district: district.name }),
        inLanguage: LOCALE_TAG[lang],
        about: {
          "@type": "Place",
          name: district.name,
          geo: { "@type": "GeoCoordinates", latitude: district.center[0], longitude: district.center[1] },
          containedInPlace: cityPlace(city, lang),
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: total,
          itemListElement: listings.map((l, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: listingUrl(site, lang, l.id),
            name: listingTitle(lang, l),
          })),
        },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        isPartOf: { "@id": ids(site).website },
        publisher: { "@id": ids(site).org },
      },
      breadcrumb(`${url}#breadcrumb`, [
        ["Subletka", `${site}${routes.home(lang)}`],
        [t.cities[city], cityUrl],
        [district.name, url],
      ]),
      ...publisher(site),
    ],
  };
};
