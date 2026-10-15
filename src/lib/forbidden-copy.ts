import { loadForbiddenConfig, type ForbiddenConfig } from "./forbidden-config";

export type ForbiddenKind = "source" | "owner" | "fee" | "payment" | "link-out" | "language-note" | "matchmaking";

type Term = { kind: ForbiddenKind; text: string; stem?: true; caseSensitive?: true };

const FIXED_TERMS: readonly Term[] = [
  { kind: "source", text: "other site", stem: true },
  { kind: "source", text: "public site", stem: true },
  { kind: "source", text: "innych serwis", stem: true },
  { kind: "source", text: "innego serwis", stem: true },
  { kind: "source", text: "publicznych serwis", stem: true },
  { kind: "fee", text: "prowizj", stem: true },
  { kind: "fee", text: "paywall", stem: true },
  { kind: "fee", text: "commission", stem: true },
  { kind: "fee", text: "no fee", stem: true },
  { kind: "fee", text: "no cut" },
  { kind: "fee", text: "bez opłat", stem: true },
  ...[
    "handles payment",
    "handle payment",
    "handling payment",
    "takes payment",
    "take payment",
    "accepts payment",
    "accept payment",
    "processes payment",
    "process payment",
    "payment system",
    "escrow",
    "obsługuje płatnoś",
    "obsługujemy płatnoś",
    "przyjmuje płatnoś",
    "przyjmujemy płatnoś",
    "pośredniczy w płatnoś",
    "pośredniczymy w płatnoś",
    "system płatnoś",
    "płać tylko przez",
  ].map((text): Term => ({ kind: "payment", text, stem: true })),
  ...[
    "original ad",
    "original listing",
    "source ad",
    "new tab",
    "oryginał",
    "oryginalne ogłoszeni",
    "oryginalnym ogłoszeni",
    "oryginalnego ogłoszeni",
    "nowej karcie",
    "nowej zakładce",
    "otwiera ogłoszeni",
    "otworzy ogłoszeni",
    "otworzysz ogłoszeni",
  ].map((text): Term => ({ kind: "link-out", text, stem: true })),
  { kind: "language-note", text: "original language", stem: true },
  { kind: "language-note", text: "oryginalnym język", stem: true },
  { kind: "matchmaking", text: "connect you directly", stem: true },
  { kind: "matchmaking", text: "łączymy cię bezpośrednio", stem: true },
];

const WORD = "[\\p{L}\\p{N}_]";
const char = (c: string, caseSensitive?: true) => {
  if (c === " ") return "\\s+";
  if (/[.*+?^${}()|[\]\\]/.test(c)) return `\\${c}`;
  const lower = c.toLowerCase();
  const upper = c.toUpperCase();
  return caseSensitive || lower === upper ? c : `[${lower}${upper}]`;
};

export const literal = (s: string, caseSensitive?: true) => [...s].map((c) => char(c, caseSensitive)).join("");

const termPattern = (t: Term) => `(?<!${WORD})${literal(t.text, t.caseSensitive)}${t.stem ? "" : `(?!${WORD})`}`;

export type ForbiddenHit = { kind: ForbiddenKind; term: string; excerpt: string };

export const forbiddenMatcher = (config: ForbiddenConfig) => {
  const terms: Term[] = [
    ...config.sources.map((s): Term => ({ kind: "source", text: s.name, caseSensitive: s.caseSensitive })),
    ...config.identity.map((text): Term => ({ kind: "owner", text })),
    ...FIXED_TERMS,
  ];
  const matchers = terms.map((t) => ({ ...t, re: new RegExp(termPattern(t), "gu") }));
  return {
    findForbidden: (text: string): ForbiddenHit[] =>
      matchers.flatMap(({ kind, text: term, re }) =>
        [...text.matchAll(re)].map((m) => ({
          kind,
          term,
          excerpt: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ").trim(),
        })),
      ),
    sourceNamePattern: `(?<!${WORD})(?:${config.sources.map((s) => literal(s.name, s.caseSensitive)).join("|")})(?:\\.[a-zA-Z]{2,3})*(?!${WORD})`,
    isSourceHost: (host: string) => config.hosts.some((h) => host.toLowerCase().includes(h)),
  };
};

const configured = forbiddenMatcher(loadForbiddenConfig());

export const findForbidden = configured.findForbidden;
export const isSourceHost = configured.isSourceHost;
