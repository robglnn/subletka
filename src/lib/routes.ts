import type { City, Locale } from "@/lib/domain";

export const routes = {
  home: (l: Locale) => `/${l}`,
  city: (l: Locale, c: City) => `/${l}/${c}`,
  district: (l: Locale, c: City, slug: string) => `/${l}/${c}/${slug}`,
  rent: (l: Locale, c: City) => `/${l}/${c}/rent`,
  listing: (l: Locale, id: string) => `/${l}/l/${encodeURIComponent(id)}`,
  post: (l: Locale) => `/${l}/post`,
  about: (l: Locale) => `/${l}/about`,
  saved: (l: Locale) => `/${l}/saved`,
  privacy: (l: Locale) => `/${l}/privacy`,
  terms: (l: Locale) => `/${l}/terms`,
  contact: (l: Locale, listing?: string) => `/${l}/contact${listing ? `?listing=${encodeURIComponent(listing)}` : ""}`,
  me: (l: Locale) => `/${l}/me`,
  meListing: (l: Locale, id: string) => `/${l}/me/${encodeURIComponent(id)}`,
  manage: (l: Locale, token: string) => `/${l}/manage/${token}`,
  photo: (id: string) => `/p/${id}`,
  original: (id: string) => `/api/go/${encodeURIComponent(id)}`,
  lister: (l: Locale, id: string, json = false) => `/api/contact/${encodeURIComponent(id)}?lang=${l}${json ? "&format=json" : ""}`,
  google: (next: string) => `/api/auth/google?next=${encodeURIComponent(next)}`,
  signOut: "/api/auth/signout",
};
