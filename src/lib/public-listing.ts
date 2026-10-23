import { expandTypes, findDistrict, type Listing, type Locale, type PlaceFilter } from "@/lib/domain";
import { filterQuery } from "@/lib/filter-query";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listingTitle, priceView } from "@/lib/i18n/format";
import { depositAmount } from "@/lib/booking-terms";
import { displayMoney, monthlyAmount, toPln } from "@/lib/money";
import { photoSrc } from "@/lib/photo";
import { routes } from "@/lib/routes";
import { resolveDistrict, type SearchQuery } from "@/lib/agent-query";
import type { PublicListing } from "@/lib/agent-response";

const SEARCH_PHOTOS = 3;
const PHOTO_WIDTH = 960;

const placeFilter = (l: Listing): PlaceFilter => {
  if (l.placeType !== "whole_place") return "room";
  return l.rooms === 1 ? "studio" : "flat";
};

const depositMoney = (l: Listing, lang: Locale) => {
  const amount = depositAmount(l.deposit, monthlyAmount(l.price));
  return amount === null ? null : displayMoney({ amount, currency: l.price.currency }, lang);
};

export const listingUrl = (site: string, lang: Locale, id: string) => `${site}${routes.listing(lang, id)}`;

export const toPublicListing = (l: Listing, lang: Locale, site: string, detail = false): PublicListing => {
  const view = priceView(lang, l);
  const shown = displayMoney(l.price, lang);
  return {
    id: l.id,
    url: listingUrl(site, lang, l.id),
    title: listingTitle(lang, l),
    city: l.city,
    cityName: getDictionary(lang).cities[l.city],
    district: l.district,
    placeType: l.placeType,
    type: placeFilter(l),
    rooms: l.placeType === "whole_place" ? l.rooms : null,
    areaM2: l.areaM2 === null ? null : Math.round(l.areaM2),
    price: {
      ...shown,
      period: l.price.period,
      startingAt: l.price.startingAt,
      billsIncluded: l.price.billsIncluded,
      text: `${view.main}${view.unit}`,
    },
    monthlyRent: displayMoney({ amount: monthlyAmount(l.price), currency: l.price.currency }, lang),
    deposit: depositMoney(l, lang),
    availableFrom: l.availableFrom,
    availableTo: l.availableTo,
    minStayDays: l.minStayDays,
    furnished: l.furnished,
    petsAllowed: l.petsAllowed,
    roommates: l.placeType === "whole_place" ? null : l.roommates,
    photos: (detail ? l.photos : l.photos.slice(0, SEARCH_PHOTOS)).map((k) => `${site}${photoSrc(k, "full", PHOTO_WIDTH)}`),
    postedAt: l.postedAt ? l.postedAt.toISOString().slice(0, 10) : null,
    minutesToCentre: l.minutesToCentre,
    ...(detail ? { description: l.description ?? "", descriptionLang: l.textLang } : {}),
  };
};

export const searchPageUrl = (site: string, q: SearchQuery) => {
  const query = filterQuery({
    from: q.from,
    to: q.to,
    type: expandTypes(q.type ?? []),
    max: q.max ? toPln(q.max, q.lang) : undefined,
    furnished: q.furnished,
    pets: q.pets,
    sort: q.sort,
  }).toString();
  const district = q.district ? resolveDistrict(q.city, q.district) : null;
  const slug = district ? findDistrict(q.city, district)?.slug : undefined;
  return `${site}${slug ? routes.district(q.lang, q.city, slug) : routes.city(q.lang, q.city)}${query ? `?${query}` : ""}`;
};
