import { literal } from "@/lib/forbidden-copy";

const CUT = "\u0000";
const NAME = "\\p{Lu}\\p{Ll}+(?:[ -]\\p{Lu}\\p{Ll}+)?";
const anyCase = (words: string[]) => `(?<![\\p{L}\\p{N}])(?:${words.map((w) => literal(w)).join("|")})`;

const PHONE = /(?<![\p{L}\p{N}])(?:\+|00)?(?:\(\d{2,3}\)[ \t]?)?\d(?:[ \t-]?\d)+(?![\p{L}\p{N}])/gu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

const NAMES = new RegExp(
  [
    `${anyCase(["mam na imię", "mam na imie", "nazywam się", "nazywam sie", "my name is", "name's"])}\\s+${NAME}`,
    `${anyCase(["pytaj o", "pytać o", "zapytaj o", "ask for"])}\\s+(?:${anyCase(["pana", "panią", "pani", "mr", "ms", "mrs"])}\\.?\\s+)?${NAME}(?=[\\s,.;:!]|$)`,
    `${anyCase(["pozdrawiam", "pozdrowienia", "regards", "best", "cheers", "thanks", "dzięki", "dziękuję"])}[,!.]?\\s+${NAME}\\s*[.!]?\\s*$`,
  ].join("|"),
  "gmu",
);

const LEAD_IN = new RegExp(
  `${anyCase(["napisz na", "pisz na", "pisz", "write to", "email me at", "e-mail", "email", "mail", "dzwoń", "dzwon", "zadzwoń", "call", "text", "whatsapp", "telefon", "tel", "kom", "phone", "mobile", "kontakt", "contact"])}\\.?\\s*:?\\s*(?:${anyCase(["lub", "albo", "or"])}\\s*)?${CUT}`,
  "gu",
);

const digits = (s: string) => s.replace(/\D/g, "").length;

const tidy = (text: string) =>
  text
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]+([,.;:!?])/g, "$1")
        .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
        .replace(/[,;:]\s*([.!?])/g, "$1")
        .replace(/([.!?])[.,;:]+/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/^[\s,.;:–—-]+|[\s,;:–—-]+$/g, ""),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const scrubPersonal = (text: string | null): string | null => {
  if (!text) return text;
  let out = text
    .replace(EMAIL, CUT)
    .replace(PHONE, (m) => (digits(m) >= 9 ? CUT : m))
    .replace(NAMES, CUT);
  let prev;
  do {
    prev = out;
    out = out.replace(LEAD_IN, CUT).replace(new RegExp(`${CUT}[ \\t]*(?:${anyCase(["lub", "albo", "or", "i", "and"])}\\s*)?${CUT}`, "gu"), CUT);
  } while (out !== prev);
  if (!out.includes(CUT)) return text;
  return tidy(out.replaceAll(CUT, " ")) || null;
};
