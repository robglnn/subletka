import { LOCALES } from "@/lib/domain";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_BATCH = 10_000;
export const INDEXNOW_KEY = /^[0-9a-f]{32}$/;

export type IndexNowConfig = { site: string; key: string };
export type IndexNowResult = { submitted: number; failed: number };

export const listingUrls = (site: string, ids: string[]) =>
  [...new Set(ids)].flatMap((id) => LOCALES.map((lang) => `${site}/${lang}/l/${encodeURIComponent(id)}`));

export async function pingIndexNow(config: IndexNowConfig, urls: string[], send: typeof fetch = fetch): Promise<IndexNowResult> {
  const result: IndexNowResult = { submitted: 0, failed: 0 };
  const { host } = new URL(config.site);
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
    const urlList = urls.slice(i, i + INDEXNOW_BATCH);
    try {
      const res = await send(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: config.key, keyLocation: `${config.site}/${config.key}.txt`, urlList }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      console.log(`indexnow batch of ${urlList.length} accepted: status ${res.status}`);
      result.submitted += urlList.length;
    } catch (e) {
      console.error(`indexnow batch of ${urlList.length} failed: ${e instanceof Error ? e.message : String(e)}`);
      result.failed += urlList.length;
    }
  }
  return result;
}
