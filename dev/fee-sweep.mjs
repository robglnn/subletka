import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "https://subletka.com";
const rounds = Number(process.argv[3] ?? 1);
const secret = process.env.AUTH_SECRET ?? readFileSync(`${process.env.HOME}/.subletka/auth-secret`, "utf8").trim();
const email = process.env.QA_EMAIL ?? "qa+subletka@example.com";

const FEE = /prowizj|paywall|commission|no fee|no cut|bez opłat|(?<!\d[\s\u00a0\u202f]?)0\s?zł/i;
const CURRENCY = { pl: { bad: /€|EUR\b/, good: /zł/ }, en: { bad: /\bzł\b|PLN/, good: /€/ } };

const mint = () => {
  const data = Buffer.from(JSON.stringify({ email, exp: Date.now() + 6 * 3600 * 1000 })).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
};

const html = await (await fetch(`${base}/en/warszawa`)).text();
const listing = decodeURIComponent(html.match(/href="\/en\/l\/([^"]+)"/)[1]);
const pages = ["", "/warszawa", "/krakow", `/l/${encodeURIComponent(listing)}`, "/post", "/me", "/saved", "/about", "/privacy"];

const variants = {
  html: {},
  rsc: { RSC: "1" },
  prefetch: { RSC: "1", "Next-Router-Prefetch": "1" },
};

const session = mint();
const builds = new Map();
const failures = [];
let fetched = 0;

for (let r = 0; r < rounds; r++) {
  for (const lang of ["pl", "en"]) {
    for (const path of pages) {
      for (const signedIn of [false, true]) {
        for (const [kind, extra] of Object.entries(variants)) {
          const url = `${base}/${lang}${path}`;
          const headers = { ...extra, ...(signedIn ? { Cookie: `subletka_session=${session}` } : {}) };
          let res = await fetch(url, { headers, redirect: "manual" });
          if (kind !== "html" && res.status === 307) res = await fetch(new URL(res.headers.get("location"), base), { headers, redirect: "manual" });
          const body = await res.text();
          fetched++;
          const build = body.match(/"b":"([^"]+)"/)?.[1] ?? body.match(/\\"b\\":\\"([^\\]+)/)?.[1] ?? "none";
          builds.set(build, (builds.get(build) ?? 0) + 1);
          const tag = `${kind} ${signedIn ? "in " : "out"} /${lang}${path}`;
          if (res.status !== 200) failures.push(`${tag} status ${res.status}`);
          const fee = body.match(FEE);
          if (fee) failures.push(`${tag} fee term "${fee[0]}"`);
          if (kind === "html") {
            const cc = res.headers.get("cache-control") ?? "";
            if (!/no-store/.test(cc)) failures.push(`${tag} cache-control "${cc}"`);
            const visible = body.replace(/<script[\s\S]*?<\/script>/g, "");
            const bad = visible.match(CURRENCY[lang].bad);
            if (bad) failures.push(`${tag} wrong currency "${bad[0]}"`);
          }
          if (signedIn && kind === "html" && path === "/post" && !body.includes(email)) failures.push(`${tag} session not honoured`);
        }
      }
    }
  }
}

console.log(`fetched ${fetched} responses, listing ${listing}`);
console.log("build ids:", Object.fromEntries(builds));
console.log(failures.length ? `FAIL ${failures.length}\n${failures.slice(0, 20).join("\n")}` : "PASS no fee terms, single currency, no-store html, one build id");
process.exit(failures.length || builds.size !== 1 ? 1 : 0);
