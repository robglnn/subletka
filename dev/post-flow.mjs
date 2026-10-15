import { chromium } from "playwright-core";

const [base = "http://localhost:3000", photo = "/tmp/test-photo.jpg", out = "/tmp/shots"] = process.argv.slice(2);
const results = [];
const check = (ok, label) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/local/bin/google-chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pl-PL" });
const page = await context.newPage();

await page.goto(`${base}/pl/post`, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', photo);
await page.waitForSelector('img[src^="blob:"]');
check(true, "photo resized in browser");
await page.fill('input[name="district"]', "TEST");
await page.fill('input[name="roommatesCount"]', "2");
await page.selectOption('select[name="roommatesGender"]', "female");
await page.fill('input[name="availableFrom"]', "2026-11-01");
await page.fill('input[name="availableTo"]', "2027-01-31");
await page.fill('input[name="price"]', "2500");
await page.fill('textarea[name="description"]', "TEST LISTING. Automated launch check, not a real place. It is taken down right after the check.");
await page.fill('input[name="contactEmail"]', "test@example.com");
await page.click('button[type="submit"]');
await page.waitForURL(/\/manage\/.+\?new=1/, { timeout: 30000 });
const manageUrl = page.url().replace("?new=1", "");
check(true, `created, manage link ${manageUrl.replace(/manage\/.{6}.*/, "manage/…")}`);
await page.screenshot({ path: `${out}/manage-new-pl-mobile.png`, fullPage: true });

const listingHref = await page.getAttribute('a[href*="/l/"]', "href");
const id = decodeURIComponent(listingHref.split("/l/")[1]);
const html = await (await page.request.get(`${base}${listingHref}`)).text();
check(html.includes("Pokój, TEST"), "listing page renders rebuilt title");
check(html.includes("2 współlokatorki"), "roommates line with gender");
check(!html.includes("test@example.com"), "contact not in listing HTML");
const contact = await (await page.request.get(`${base}/api/contact/${encodeURIComponent(id)}?format=json`)).json();
check(contact.email === "test@example.com", "contact revealed via route");
const city = await (await page.request.get(`${base}/pl/warszawa`)).text();
check(city.includes("Pokój, TEST"), "listing appears in Warszawa results");
const photoSrc = html.match(/src="(\/p\/[^"]+)"/)?.[1];
const photoRes = photoSrc ? await page.request.get(`${base}${photoSrc}`) : null;
check(photoRes?.ok() && /image\/(webp|jpeg)/.test(photoRes.headers()["content-type"]) && photoRes.headers()["cache-control"].includes("immutable"), "photo served with long cache");

await page.fill('input[name="price"]', "2600");
await page.click('form:has(textarea) button[type="submit"]');
await page.waitForSelector("text=Zapisano.", { timeout: 20000 });
const edited = await (await page.request.get(`${base}${listingHref}`)).text();
check(edited.includes("2 600 zł") || edited.includes("2&nbsp;600 zł") || edited.includes("2\u00a0600"), "edit applied (2 600 zł)");

await page.goto(manageUrl, { waitUntil: "networkidle" });
await page.click("text=zdejmij ogłoszenie");
await page.waitForSelector("text=Ogłoszenie jest zdjęte", { timeout: 20000 });
const gone = await page.request.get(`${base}${listingHref}`);
check(gone.status() === 404, `taken down, listing returns ${gone.status()}`);
const cityAfter = await (await page.request.get(`${base}/pl/warszawa`)).text();
check(!cityAfter.includes("Pokój, TEST"), "gone from results");

await browser.close();
console.log(results.every(Boolean) ? "ALL PASS" : "SOME FAILED");
process.exit(results.every(Boolean) ? 0 : 1);
