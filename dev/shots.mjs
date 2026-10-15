import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [base = "http://localhost:3000", out = "/tmp/shots", ...pages] = process.argv.slice(2);
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/local/bin/google-chrome" });
for (const spec of pages) {
  const parts = spec.split("=");
  const only = ["mobile", "desktop"].includes(parts.at(-1)) ? parts.pop() : undefined;
  const [name, ...rest] = parts;
  const path = rest.join("=");
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    if (only && only !== vp) continue;
    const locale = path.startsWith("/en") ? "en-GB" : "pl-PL";
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: vp === "mobile", hasTouch: vp === "mobile", locale });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const file = `${out}/${name}-${vp}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(res?.status(), file, page.url(), errors.length ? `errors: ${errors.join(" | ")}` : "");
    await context.close();
  }
}
await browser.close();
