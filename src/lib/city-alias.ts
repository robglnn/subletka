import { isCity, type City } from "@/lib/domain";

const ALIASES: Record<string, City> = {
  warsaw: "warszawa",
  warszawie: "warszawa",
  warschau: "warszawa",
  varsovie: "warszawa",
  varsovia: "warszawa",
  varsavia: "warszawa",
  warsawa: "warszawa",
  warszwa: "warszawa",
  cracow: "krakow",
  krakowie: "krakow",
  krakau: "krakow",
  cracovie: "krakow",
  cracovia: "krakow",
  krakov: "krakow",
  krakuv: "krakow",
};

const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const fold = (segment: string) => decode(segment).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ł/g, "l");

export function canonicalCityPath(pathname: string): string | null {
  const [, lang, segment, ...rest] = pathname.split("/");
  if (!segment) return null;
  const folded = fold(segment);
  const city = isCity(folded) ? folded : ALIASES[folded];
  if (!city || city === segment) return null;
  return ["", lang, city, ...rest].join("/");
}
