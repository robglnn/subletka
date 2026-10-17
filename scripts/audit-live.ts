import { copyProblems } from "../src/lib/copy-rules";
import { findForbidden, isSourceHost, type ForbiddenHit } from "../src/lib/forbidden-copy";
import { publicListingId } from "../src/lib/listing-id";

type Auth = "signed-out" | "signed-in";
type Surface = "text" | "head" | "html" | "rsc" | "internal-url" | "body";
type Lang = "pl" | "en";
type Target = {
  path: string;
  kind: "html" | "raw" | "json" | "binary" | "redirect";
  savedIds?: string[];
  expect?: number | number[];
  location?: RegExp;
  lang?: Lang;
  post?: unknown;
};
type Violation = ForbiddenHit & { page: string; auth: Auth; surface: Surface };

const base = (process.argv[2] ?? "https://subletka.com").replace(/\/$/, "");
const origin = new URL(base).origin;
const sessionCookie = process.env.AUDIT_SESSION_COOKIE?.trim();
const LANGS = ["pl", "en"] as const;
const SAMPLE = Number(process.env.AUDIT_SAMPLE ?? 20);
const LEGACY_IDS = (process.env.AUDIT_LEGACY_IDS ?? "").split(",").filter(Boolean);
const HIDDEN_IDS = (process.env.AUDIT_HIDDEN_IDS ?? "").split(",").filter(Boolean);
const WRONG_CURRENCY = { pl: /€|\bEUR\b/, en: /zł|\bPLN\b/ } as const;

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const attrValues = (html: string, names: string[]) =>
  [...html.matchAll(new RegExp(`\\s(${names.join("|")})="([^"]*)"`, "gi"))].map((m) => ({ attr: m[1].toLowerCase(), value: decodeEntities(m[2]) }));

const visibleText = (html: string) => {
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "").replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, " ");
  const labels = attrValues(body, ["alt", "aria-label", "title", "placeholder"]).map((a) => a.value);
  return [decodeEntities(body.replace(/<[^>]+>/g, " ")), ...labels].join("\n");
};

const withoutHostText = (html: string) => html.replace(/<(p|span)\b[^>]*\sdata-host-text[^>]*>[\s\S]*?<\/\1>/gi, " ");

const headText = (html: string) => {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? "";
  const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const metas = [...head.matchAll(/<meta\s[^>]*content="([^"]*)"[^>]*>/gi)].map((m) => m[1]);
  const jsonLd = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return decodeEntities([title, ...metas, ...jsonLd].join("\n"));
};

const internalUrls = (html: string) =>
  attrValues(html, ["href", "src", "action"])
    .map((a) => a.value)
    .filter((v) => v.startsWith("/") || v.startsWith(origin))
    .map((v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    })
    .join("\n");

const externalRefs = (html: string) =>
  attrValues(html, ["href", "src", "srcset"]).flatMap(({ attr, value }) =>
    value.split(/,\s*/).flatMap((part) => {
      const url = part.trim().split(/\s+/)[0];
      try {
        const host = new URL(url, origin).host;
        return isSourceHost(host) ? [{ attr, host }] : [];
      } catch {
        return [];
      }
    }),
  );

const cookieHeader = (auth: Auth, savedIds?: string[]) => {
  const parts: string[] = [];
  if (auth === "signed-in" && sessionCookie) parts.push(sessionCookie.includes("=") ? sessionCookie : `subletka_session=${sessionCookie}`);
  if (savedIds?.length) parts.push(`saved=${encodeURIComponent(savedIds.join(","))}`);
  return parts.join("; ");
};

const LEAKY_KEYS = /"(source|sourceId|sourceUrl|sourceName|contact\w*|ownerEmail|manageToken\w*|lat|lng)"\s*:/g;

const withoutDescriptions = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json), (k, v) => (k === "description" ? undefined : v));
  } catch {
    return json;
  }
};

const agentProblems = (body: string, kind: Target["kind"], lang?: Lang) => {
  const leaks = kind === "json" ? [...body.matchAll(LEAKY_KEYS)].map((m) => `exposes the ${m[1]} field`) : [];
  const problems = [...new Set(leaks)];
  const hosts = (body.match(/https?:\/\/[^/"\s)\\]+/g) ?? []).map((u) => u.replace(/^https?:\/\//, ""));
  for (const host of new Set(hosts)) if (isSourceHost(host)) problems.push(`links to source host ${host}`);
  const wrong = lang ? withoutDescriptions(body).match(WRONG_CURRENCY[lang]) : null;
  if (wrong) problems.push(`shows ${wrong[0]} with lang=${lang}`);
  return problems;
};

const send = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "subletka-audit" },
    body: JSON.stringify(body),
  });

const get = (path: string, auth: Auth, savedIds?: string[], rsc = false, redirect: RequestRedirect = "follow") =>
  fetch(`${base}${path}${rsc ? `${path.includes("?") ? "&" : "?"}_rsc=audit` : ""}`, {
    redirect,
    headers: { cookie: cookieHeader(auth, savedIds), ...(rsc ? { RSC: "1" } : {}), "user-agent": "subletka-audit" },
  });

const tally = <T extends object>(items: T[], key: (t: T) => string) => {
  const out = new Map<string, T & { count: number }>();
  for (const item of items) {
    const k = key(item);
    const prev = out.get(k);
    if (prev) prev.count++;
    else out.set(k, { ...item, count: 1 });
  }
  return [...out.values()];
};

async function audit(target: Target, auth: Auth) {
  const violations: Violation[] = [];
  const hit = (surface: Surface, text: string) =>
    findForbidden(text).forEach((h) => violations.push({ ...h, page: target.path, auth, surface }));
  const res = target.post
    ? await send(target.path, target.post)
    : await get(target.path, auth, target.savedIds, false, target.kind === "redirect" ? "manual" : "follow");
  const status = res.status;
  const problems: string[] = [];
  const expected = [target.expect ?? 200].flat();
  if (!expected.includes(status)) problems.push(`status ${status}, expected ${expected.join(" or ")}`);
  if (target.kind === "redirect") {
    const location = res.headers.get("location") ?? "";
    if (!target.location?.test(location)) problems.push(`redirects to ${location || "nowhere"}`);
    hit("internal-url", decodeURIComponent(location));
  } else if (target.kind === "binary") {
    hit("body", Buffer.from(await res.arrayBuffer()).toString("latin1"));
  } else if (target.kind === "raw" || target.kind === "json") {
    const body = await res.text();
    hit("body", body);
    problems.push(...agentProblems(body, target.kind, target.lang));
    problems.push(...copyProblems(target.kind === "json" ? withoutDescriptions(body) : body));
  } else {
    const html = await res.text();
    const text = visibleText(html);
    const head = headText(html);
    hit("text", text);
    hit("head", head);
    hit("html", html);
    hit("internal-url", internalUrls(html));
    problems.push(...copyProblems(`${visibleText(withoutHostText(html))}\n${head}`));
    for (const ref of externalRefs(html)) problems.push(`${ref.attr} points at source host ${ref.host}`);
    const lang = target.path.split("/")[1];
    if (lang === "pl" || lang === "en") {
      const wrong = `${visibleText(withoutHostText(html))}\n${head}`.match(WRONG_CURRENCY[lang]);
      if (wrong) problems.push(`shows ${wrong[0]} on a ${lang} page`);
    }
    const rsc = await get(target.path, auth, target.savedIds, true);
    const payload = await rsc.text();
    if (!rsc.headers.get("content-type")?.includes("text/x-component")) problems.push(`rsc content-type ${rsc.headers.get("content-type")}`);
    hit("rsc", payload);
  }
  return { status, problems, violations };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pathOf = (loc: string) => new URL(loc).pathname;

async function targets(): Promise<Target[]> {
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => pathOf(decodeEntities(m[1])));
  const listingPaths = locs.filter((p) => /^\/[a-z]{2}\/l\//.test(p));
  const hiddenIds = new Set(HIDDEN_IDS.map((id) => publicListingId(id, "imported")));
  const listed = listingPaths.filter((p) => hiddenIds.has(decodeURIComponent(p.split("/l/")[1])));
  if (listed.length) throw new Error(`sitemap lists hidden listings: ${listed.join(", ")}`);
  const step = Math.max(1, Math.floor(listingPaths.length / SAMPLE));
  const sample = listingPaths.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const ids = sample.map((p) => decodeURIComponent(p.split("/l/")[1]));
  const pages = new Set<string>(locs.filter((p) => !/\/l\//.test(p)).map((p) => p.replace(/^\/[a-z]{2}/, "")));
  for (const p of ["", "/warszawa", "/krakow", "/post", "/me", "/saved", "/about", "/privacy", "/terms", "/contact"]) pages.add(p);
  const html: Target[] = LANGS.flatMap((lang) => [
    ...[...pages].map((p): Target => ({ path: `/${lang}${p}`, kind: "html", savedIds: p === "/saved" ? ids : undefined })),
    ...sample.map((p): Target => ({ path: `/${lang}${p.replace(/^\/[a-z]{2}/, "")}`, kind: "html" })),
    { path: `/${lang}/audit-no-such-page`, kind: "html", expect: 404 },
    ...HIDDEN_IDS.map((id): Target => ({
      path: `/${lang}/l/${publicListingId(id, "imported")}`,
      kind: "redirect",
      expect: [301, 302],
      location: new RegExp(`^/${lang}/(warszawa|krakow)$`),
    })),
    { path: `/${lang}/l/audit-no-such-listing`, kind: "redirect", expect: 301, location: new RegExp(`^/${lang}$`) },
    ...LEGACY_IDS.flatMap((id): Target[] =>
      [id, encodeURIComponent(id), Buffer.from(id).toString("base64url")].map((form) => ({
        path: `/${lang}/l/${form}`,
        kind: "redirect",
        expect: 301,
        location: new RegExp(`/${lang}/l/[A-Za-z0-9_-]{16}$`),
      })),
    ),
  ]);
  const mcp = (name: string, args: object) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const agent: Target[] = [
    { path: "/llms.txt", kind: "raw" },
    { path: "/llms-full.txt", kind: "raw", lang: "en" },
    { path: "/openapi.json", kind: "raw" },
    { path: "/api/mcp#tools", kind: "json", post: { jsonrpc: "2.0", id: 1, method: "tools/list" } },
    ...LANGS.flatMap((lang): Target[] => [
      { path: `/${lang}/llms-full.txt`, kind: "raw", lang },
      { path: `/api/v1/cities?lang=${lang}`, kind: "json", lang },
      ...["warszawa", "krakow"].map((city): Target => ({ path: `/api/v1/listings?city=${city}&lang=${lang}&limit=50`, kind: "json", lang })),
      ...ids.map((id): Target => ({ path: `/api/v1/listings/${encodeURIComponent(id)}?lang=${lang}`, kind: "json", lang })),
      ...HIDDEN_IDS.map((id): Target => ({ path: `/api/v1/listings/${publicListingId(id, "imported")}?lang=${lang}`, kind: "json", lang, expect: 404 })),
      { path: `/api/mcp#search-${lang}`, kind: "json", lang, post: mcp("search_listings", { city: "warszawa", lang, limit: 50 }) },
      { path: `/api/mcp#cities-${lang}`, kind: "json", lang, post: mcp("list_cities", { lang }) },
    ]),
  ];
  return [
    { path: "/", kind: "html" },
    ...html,
    ...agent,
    { path: "/robots.txt", kind: "raw" },
    { path: "/sitemap.xml", kind: "raw" },
    { path: "/manifest.webmanifest", kind: "raw" },
    { path: "/og.png", kind: "binary" },
  ];
}

async function main() {
  const list = await targets();
  const auths: Auth[] = sessionCookie ? ["signed-out", "signed-in"] : ["signed-out"];
  const jobs = auths.flatMap((auth) => list.map((t) => ({ t, auth })));
  const results = await pool(jobs, 6, ({ t, auth }) => audit(t, auth));
  const violations = tally(
    results.flatMap((r) => r.violations),
    (v) => `${v.page}|${v.auth}|${v.surface}|${v.term}`,
  );
  const problems = results.flatMap((r, i) => r.problems.map((p) => `${jobs[i].auth} ${jobs[i].t.path}: ${p}`));

  const lines: string[] = [];
  lines.push(`# copy audit: ${base}`, "");
  lines.push(`Run at ${new Date().toISOString()}. ${jobs.length} fetches over ${list.length} targets, ${auths.join(" and ")}.`);
  if (!sessionCookie) lines.push("Signed-in pass skipped because AUDIT_SESSION_COOKIE is not set.");
  lines.push("", `## violations: ${violations.reduce((n, v) => n + v.count, 0)} hits in ${violations.length} rows`, "");
  const byTerm = tally(violations.flatMap((v) => Array.from({ length: v.count }, () => v)), (v) => `${v.kind}|${v.term}`);
  const byPage = tally(violations.flatMap((v) => Array.from({ length: v.count }, () => v)), (v) => v.page);
  if (violations.length) {
    lines.push("| term | kind | hits |", "|---|---|---|", ...byTerm.map((t) => `| ${t.term} | ${t.kind} | ${t.count} |`), "");
    lines.push("| page | hits |", "|---|---|", ...byPage.map((p) => `| ${p.page} | ${p.count} |`), "");
    lines.push("| page | auth | surface | term | hits | excerpt |", "|---|---|---|---|---|---|");
    for (const v of violations) lines.push(`| ${v.page} | ${v.auth} | ${v.surface} | ${v.term} | ${v.count} | ${v.excerpt.replace(/\|/g, "\\|").slice(0, 120)} |`);
  } else lines.push("none");
  lines.push("", `## problems: ${problems.length}`, "", ...(problems.length ? problems.map((p) => `- ${p}`) : ["none"]));
  console.log(lines.join("\n"));
  process.exit(violations.length || problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
