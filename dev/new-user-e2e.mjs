import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import forbiddenCopy from "../src/lib/forbidden-copy.ts";

const [base = "http://localhost:8090", lister, ...photos] = process.argv.slice(2);
if (!lister || !photos.length) {
  console.error("usage: node --import tsx dev/new-user-e2e.mjs <base> <lister email> <photo...>");
  process.exit(2);
}
const out = process.env.OUT ?? "/tmp/qa/e2e";
const db = process.env.DATABASE_URL;
const ipLimits = process.env.SKIP_IP_LIMITS !== "1";
const qaEmail = process.env.QA_EMAIL ?? "qa+subletka@example.com";
mkdirSync(`${out}/shots`, { recursive: true });

const results = [];
const state = {};
const save = () => writeFileSync(`${out}/state.json`, JSON.stringify({ ...state, A: { id: A.id, manage: A.manage }, B: { id: B.id, manage: B.manage } }, null, 2));
const check = (ok, label) => {
  results.push({ ok: Boolean(ok), label });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

const secret = process.env.AUTH_SECRET ?? readFileSync(`${process.env.HOME}/.subletka/auth-secret`, "utf8").trim();
const mint = (email) => {
  const data = Buffer.from(JSON.stringify({ email, exp: Date.now() + 2 * 3600_000 })).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
};

const sql = (q) => (db ? execFileSync("psql", [db, "-Atc", q], { encoding: "utf8" }).trim() : null);
const nativeCount = () => Number(sql("select count(*) from listings where origin='native'"));

const T = {
  pl: { next: "dalej", submit: "opublikuj", save: "zapisz zmiany", saved: "Zapisano.", takeDown: "zdejmij ogłoszenie", takenDown: "Ogłoszenie jest zdjęte", want: "chcę to", photosErr: "Zdjęcia: JPG, PNG lub WebP, maks. 8, każde do 2,5 MB.", rateErr: "Za dużo prób.", ready: "twoje miejsce jest gotowe", report: "zgłoś ogłoszenie", removed: "zdjęte" },
  en: { next: "next", submit: "post", save: "save changes", saved: "Saved.", takeDown: "take it down", takenDown: "This listing is down and hidden.", want: "i want it", photosErr: "Photos must be JPG, PNG or WebP, up to 8, each under 2.5 MB.", rateErr: "Too many tries.", ready: "your place is ready", report: "report this listing", notFound: "this link is not valid", removed: "down" },
};

const FEE = /prowizj|paywall|commission|no fee|no cut|bez opłat|(?<!\d[\s\u00a0\u202f]?)0\s?zł/i;
const namesSource = (text) => forbiddenCopy.findForbidden(text).some((h) => h.kind === "source");
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'");
const hasLink = (html, lang, id) => html.includes(`/${lang}/l/${encodeURIComponent(id)}"`) || html.includes(`/${lang}/l/${id}"`);
const amount = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, "$1[\\s\\u00a0\\u202f,]?"));

const block = Math.floor(Math.random() * 256);
const ip = (n) => `198.18.${block}.${n}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/local/bin/google-chrome" });
const ctx = async ({ ip, lang, mobile = true, session = null }) => {
  const c = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    locale: lang === "pl" ? "pl-PL" : "en-GB",
    extraHTTPHeaders: { "x-real-ip": ip },
  });
  if (session) await c.addCookies([{ name: "subletka_session", value: session, url: base }]);
  return c;
};
const get = async (c, path) => {
  const res = await c.request.get(`${base}${path}`, { maxRedirects: 0 });
  return { status: res.status(), html: await res.text() };
};

const fillPost = async (page, lang, v) => {
  const t = T[lang];
  await page.goto(`${base}/${lang}/post`, { waitUntil: "networkidle" });
  if (v.photos?.length) {
    await page.setInputFiles('input[type="file"]', v.photos);
    await page.waitForFunction((n) => document.querySelectorAll('img[src^="blob:"]').length >= n, v.photos.length, { timeout: 20000 });
  }
  const next = page.getByRole("button", { name: t.next, exact: true });
  await next.click();
  await page.fill('input[name="price"]', String(v.price));
  await page.fill('input[name="availableFrom"]', v.from);
  await page.fill('input[name="availableTo"]', v.to);
  await next.click();
  await page.click(`label:has(input[name="city"][value="${v.city}"])`);
  await page.click(`label:has(input[name="placeType"][value="${v.placeType}"])`);
  await page.fill('input[name="district"]', v.district);
  if (v.placeType === "whole_place") await page.fill('input[name="rooms"]', String(v.rooms));
  else await page.fill('input[name="roommatesCount"]', String(v.roommates));
  await page.fill('textarea[name="description"]', v.description);
  await page.fill('input[name="contactEmail"]', v.contact);
  await next.click();
  await page.getByText(t.ready).waitFor({ timeout: 10000 });
};
const resubmit = async (page, lang) => {
  const next = page.getByRole("button", { name: T[lang].next, exact: true });
  for (let i = 0; i < 3; i++) await next.click();
  await page.getByRole("button", { name: T[lang].submit, exact: true }).click();
};
const submit = (page, lang) => page.getByRole("button", { name: T[lang].submit, exact: true }).click();
const created = async (page, name) => {
  try {
    await page.waitForURL(/\/manage\/[^/?]+\?new=1/, { timeout: 30000 });
  } catch (e) {
    await page.screenshot({ path: `${out}/shots/fail-${name}.png`, fullPage: true });
    console.error(`no manage redirect for ${name}; page says: ${(await page.locator('[aria-live="polite"]').innerText()).trim()}`);
    throw e;
  }
};
const idFrom = (href) => decodeURIComponent(href.split("/l/")[1].split(/[?#]/)[0]);

const description = "TEST LISTING. Automated new-user check, not a real place. It is deleted right after the check.";
const A = { lang: "pl", city: "warszawa", placeType: "private_room", district: "TEST Mokotów", price: 2500, from: "2026-11-01", to: "2027-01-31", roommates: 2, contact: lister, description, photos };
const B = { lang: "en", city: "krakow", placeType: "whole_place", district: "TEST Kazimierz", price: 700, from: "2026-11-15", to: "2027-02-28", rooms: 2, contact: lister, description, photos };
const session = mint(qaEmail);
const before = db ? nativeCount() : null;

const ca = await ctx({ ip: ip(10), lang: "pl" });
const pa = await ca.newPage();
await fillPost(pa, "pl", A);
await pa.screenshot({ path: `${out}/shots/post-ready-anon-pl-mobile.png`, fullPage: true });
await submit(pa, "pl");
await created(pa, "anon-pl");
A.manage = pa.url().replace("?new=1", "");
A.id = idFrom(await pa.getAttribute('a[href*="/l/"]', "href"));
save();
check(A.id.startsWith("sub:"), `anonymous post (pl, mobile) created ${A.id}, private manage link issued`);
await pa.screenshot({ path: `${out}/shots/manage-new-anon-pl-mobile.png`, fullPage: true });
if (db) check(sql(`select owner_email is null from listings where id='${A.id}'`) === "t", "anonymous listing has no owner");

const cb = await ctx({ ip: ip(11), lang: "en", mobile: false, session });
const pb = await cb.newPage();
await fillPost(pb, "en", B);
await pb.screenshot({ path: `${out}/shots/post-signed-in-en-desktop.png`, fullPage: true });
await submit(pb, "en");
await created(pb, "signed-in-en");
B.manage = pb.url().replace("?new=1", "");
B.id = idFrom(await pb.getAttribute('a[href*="/l/"]', "href"));
save();
check(B.id.startsWith("sub:"), `signed-in post (en, desktop) created ${B.id}`);
if (db) check(sql(`select owner_email from listings where id='${B.id}'`) === qaEmail, `signed-in listing owned by ${qaEmail}`);

const cv = await ctx({ ip: ip(12), lang: "en" });
for (const L of [A, B]) {
  for (const lang of ["pl", "en"]) {
    const page = await get(cv, `/${lang}/l/${encodeURIComponent(L.id)}`);
    const text = visible(page.html);
    check(page.status === 200 && text.includes(L.district), `${L.id} listing page ${lang} renders (${page.status})`);
    check(!page.html.includes(lister), `${L.id} ${lang}: lister email not in page HTML`);
    check(page.html.includes("mailto:support@subletka.com") && text.includes(T[lang].report), `${L.id} ${lang}: report link to support@subletka.com`);
    check(!FEE.test(text) && !namesSource(text), `${L.id} ${lang}: no fee or source copy`);
    check(lang === "pl" ? /zł/.test(text) && !/€|EUR\b/.test(text) : /€/.test(text) && !/\bzł\b|PLN/.test(text), `${L.id} ${lang}: ${lang === "pl" ? "zł only" : "€ only"}`);
    const img = page.html.match(/src="(\/img\/[^"]+)"/)?.[1];
    L.img ??= img;
    const res = img ? await cv.request.get(`${base}${img.replace(/&amp;/g, "&")}`) : null;
    check(res?.ok() && res.headers()["content-type"] === "image/webp", `${L.id} ${lang}: photo served as resized webp`);
    const city = await get(cv, `/${lang}/${L.city}`);
    check(hasLink(city.html, lang, L.id), `${L.id} on ${lang}/${L.city} city page`);
  }
}
const search = async (lang, city, q) => hasLink((await get(cv, `/${lang}/${city}?${q}`)).html, lang, (city === A.city ? A : B).id);
check(await search("pl", "warszawa", "type=room&max=3000&from=2026-11-01"), "A found by search pl (room, up to 3000 zł, from 1 Nov)");
check(await search("en", "warszawa", "type=room&max=3416&from=2026-11-01"), "A found by search en (room, up to €800, from 1 Nov)");
check(!(await search("pl", "warszawa", "type=room&max=2000")), "A filtered out by search pl up to 2000 zł");
check(!(await search("en", "warszawa", "type=flat")), "A filtered out by search en type flat");
check(await search("en", "krakow", "type=flat&max=3843&from=2026-11-15"), "B found by search en (flat, up to €900, from 15 Nov)");
check(await search("pl", "krakow", "type=flat&max=4000"), "B found by search pl (flat, up to 4000 zł)");
check(!(await search("en", "krakow", "type=room")), "B filtered out by search en type room");
check(!(await search("pl", "krakow", "type=flat&from=2027-03-15")), "B filtered out by search pl from 15 Mar 2027 (after it ends)");

const cc = await ctx({ ip: ip(20), lang: "en" });
const pc = await cc.newPage();
await pc.goto(`${base}/en/l/${encodeURIComponent(A.id)}`, { waitUntil: "networkidle" });
const cta = pc.getByRole("link", { name: T.en.want }).first();
const ctaHref = await cta.getAttribute("href");
check(ctaHref?.startsWith(`/api/contact/`) && !(await cta.getAttribute("target")), `call to action is a plain same-tab link to ${ctaHref}`);
const redirect = await cc.request.get(`${base}${ctaHref}`, { maxRedirects: 0 });
const mailto = redirect.headers()["location"] ?? "";
check(redirect.status() === 302 && redirect.headers()["referrer-policy"] === "no-referrer", `contact link answers ${redirect.status()} with no referrer`);
const mu = new URL(mailto);
state.mailto = { to: decodeURIComponent(mu.pathname), subject: mu.searchParams.get("subject"), body: mu.searchParams.get("body") };
check(state.mailto.to === lister, `second anonymous user reaches the lister: mailto to ${state.mailto.to}`);
check(state.mailto.subject?.startsWith("Subletka: ") && [A.id, encodeURIComponent(A.id)].some((id) => state.mailto.body?.includes(`/en/l/${id}`)), `mailto subject "${state.mailto.subject}" and body carries listing URL`);
await pc.route("**/api/contact/**", (r) => (r.request().url().includes("format=json") ? r.continue() : r.abort("aborted")));
await cta.click({ noWaitAfter: true });
await pc.getByText(lister).first().waitFor({ timeout: 10000 });
check(true, "tapping the link also shows the address on the page");
await pc.screenshot({ path: `${out}/shots/contact-revealed-en-mobile.png` });

if (ipLimits) {
  const cl = await ctx({ ip: ip(50), lang: "pl" });
  const codes = [];
  for (let i = 0; i < 41; i++) codes.push((await cl.request.get(`${base}/api/contact/${encodeURIComponent(B.id)}?lang=pl`, { maxRedirects: 0 })).status());
  check(codes.slice(0, 40).every((c) => c === 302) && codes[40] === 429, `contact limit: 40 x 302 then ${codes[40]}`);
  const pl = await cl.newPage();
  await pl.goto(`${base}/pl/l/${encodeURIComponent(B.id)}`, { waitUntil: "networkidle" });
  await pl.route("**/api/contact/**", (r) => (r.request().url().includes("format=json") ? r.continue() : r.abort("aborted")));
  await pl.getByRole("link", { name: T.pl.want }).first().click({ noWaitAfter: true });
  await pl.waitForTimeout(1500);
  check(!(await pl.getByText(lister).count()), "limited visitor does not get the contact");
}

const ch = await ctx({ ip: ip(30), lang: "pl" });
const ph = await ch.newPage();
const hpBefore = db ? nativeCount() : null;
await fillPost(ph, "pl", { ...A, district: "TEST honeypot" });
await ph.evaluate(() => {
  document.querySelector('input[name="website"]').value = "http://spam.example";
});
await submit(ph, "pl");
await ph.waitForURL((u) => new URL(u).pathname === "/pl", { timeout: 20000 });
check(true, "honeypot submission redirected home");
if (db) check(nativeCount() === hpBefore, "honeypot created no row");

const cs = await ctx({ ip: ip(40), lang: "en" });
await cs.addInitScript(() => {
  HTMLCanvasElement.prototype.toBlob = function (cb) {
    cb(new Blob([new Uint8Array(3_000_000)], { type: "image/webp" }));
  };
});
const ps = await cs.newPage();
const szBefore = db ? nativeCount() : null;
await fillPost(ps, "en", { ...B, district: "TEST oversize", photos: photos.slice(0, 1) });
await submit(ps, "en");
await ps.getByText(T.en.photosErr).waitFor({ timeout: 20000 });
check(true, `3 MB photo rejected server-side: "${T.en.photosErr}"`);
await ps.screenshot({ path: `${out}/shots/photo-too-big-en-mobile.png` });
if (ipLimits) {
  for (let i = 2; i <= 6; i++) {
    await resubmit(ps, "en");
    await ps.getByText(T.en.photosErr).waitFor({ timeout: 20000 });
  }
  await resubmit(ps, "en");
  await ps.getByText(T.en.rateErr).waitFor({ timeout: 20000 });
  check(true, `posting limit: attempt 7 within the hour shows "${T.en.rateErr}"`);
}
if (db) check(nativeCount() === szBefore, "rejected attempts created no rows");

const cn = await ctx({ ip: ip(41), lang: "pl" });
await cn.addInitScript(() => {
  const append = FormData.prototype.append;
  FormData.prototype.append = function (name, ...rest) {
    append.call(this, name, ...rest);
    if (name === "photo") {
      append.call(this, name, ...rest);
      append.call(this, name, ...rest);
    }
  };
});
const pn = await cn.newPage();
const ncBefore = db ? nativeCount() : null;
await fillPost(pn, "pl", { ...A, district: "TEST nine photos", photos: [photos[0], photos[1 % photos.length], photos[0]] });
await submit(pn, "pl");
await pn.getByText(T.pl.photosErr).waitFor({ timeout: 20000 });
check(true, `9 photos rejected server-side: "${T.pl.photosErr}"`);
if (db) check(nativeCount() === ncBefore, "nine-photo attempt created no row");

const imported = [...(await get(cv, "/pl/warszawa")).html.matchAll(/href="\/pl\/l\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1])).filter((id) => !id.startsWith("sub:"));
const sample = [...new Set(imported)].slice(0, 5);
let reportOk = 0;
for (const id of sample) {
  for (const lang of ["pl", "en"]) if ((await get(cv, `/${lang}/l/${encodeURIComponent(id)}`)).html.includes("mailto:support@subletka.com")) reportOk++;
}
check(sample.length === 5 && reportOk === 10, `report link on ${reportOk}/10 imported listing pages (5 listings x pl/en)`);

await pa.goto(A.manage, { waitUntil: "networkidle" });
await pa.fill('input[name="price"]', "2600");
await pa.getByRole("button", { name: T.pl.save, exact: true }).click();
await pa.getByText(T.pl.saved, { exact: true }).waitFor({ timeout: 20000 });
check(amount(2600).test(visible((await get(cv, `/pl/l/${encodeURIComponent(A.id)}`)).html)), "edit via manage link: price now 2 600 zł on listing page");
await pa.getByRole("button", { name: T.pl.takeDown }).click();
await pa.getByText(T.pl.takenDown).waitFor({ timeout: 20000 });
await pa.screenshot({ path: `${out}/shots/manage-taken-down-pl-mobile.png`, fullPage: true });
check((await get(cv, `/pl/l/${encodeURIComponent(A.id)}`)).status === 404, "take-down via manage link: listing 404");
check(!hasLink((await get(cv, "/pl/warszawa")).html, "pl", A.id), "taken-down A gone from city page");
check((await cv.request.get(`${base}/api/contact/${encodeURIComponent(A.id)}`)).status() === 404, "taken-down A contact no longer revealed");
const photoGone = async (src) => {
  const start = Date.now();
  while (Date.now() - start < 75_000) {
    if ((await cv.request.get(`${base}${src}`)).status() === 404) return Math.round((Date.now() - start) / 1000);
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
};
const goneAfter = await photoGone(A.img);
check(goneAfter !== null, `taken-down A photo stops being served (404 after ${goneAfter}s)`);

const pm = await cb.newPage();
await pm.goto(`${base}/en/me`, { waitUntil: "networkidle" });
await pm.screenshot({ path: `${out}/shots/me-signed-in-en-desktop.png`, fullPage: true });
await pm.click(`a[href="/en/me/${encodeURIComponent(B.id)}"], a[href="/en/me/${B.id}"]`);
await pm.waitForURL(/\/en\/me\/.+/);
await pm.fill('input[name="price"]', "750");
await pm.getByRole("button", { name: T.en.save, exact: true }).click();
await pm.getByText(T.en.saved, { exact: true }).waitFor({ timeout: 20000 });
check(/€\s?750|750\s?€/.test(visible((await get(cv, `/en/l/${encodeURIComponent(B.id)}`)).html)), "edit via /me: price now €750 on listing page");
const cx = await ctx({ ip: ip(60), lang: "en", session: mint("someone-else+subletka@example.com") });
const other = await get(cx, `/en/me/${encodeURIComponent(B.id)}`);
check(visible(other.html).includes(T.en.notFound) && !other.html.includes(lister), "another signed-in user cannot open B's /me page");
await pm.getByRole("button", { name: T.en.takeDown }).click();
await pm.getByText(T.en.takenDown).waitFor({ timeout: 20000 });
check((await get(cv, `/en/l/${encodeURIComponent(B.id)}`)).status === 404, "take-down via /me: listing 404");
check(!hasLink((await get(cv, "/en/krakow")).html, "en", B.id), "taken-down B gone from city page");
await pm.goto(`${base}/en/me`, { waitUntil: "networkidle" });
const meRow = visible(await pm.locator(`a[href*="/en/me/"]`).first().innerHTML());
check(meRow.includes(T.en.removed), `/me still lists B for its owner, marked "${T.en.removed}"`);

const cmp = await ctx({ ip: ip(61), lang: "pl", session });
const pmp = await cmp.newPage();
await pmp.goto(`${base}/pl/me`, { waitUntil: "networkidle" });
await pmp.screenshot({ path: `${out}/shots/me-signed-in-pl-mobile.png`, fullPage: true });

if (db) check(nativeCount() === before + 2, `exactly 2 test listings were created (native ${before} -> ${nativeCount()})`);
state.ids = [A.id, B.id];
state.results = results;
writeFileSync(`${out}/state.json`, JSON.stringify(state, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} FAILED` : `ALL ${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
