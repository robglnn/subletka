import "server-only";
import { after } from "next/server";
import { hubPathsFor } from "@/db/rent";
import { indexNowConfig } from "@/lib/env";
import { hubUrls } from "@/lib/hubs";
import { listingUrls, pingIndexNow } from "@/lib/indexnow";

export const changedUrls = async (site: string, publicIds: string[]) => [
  ...listingUrls(site, publicIds),
  ...hubUrls(site, await hubPathsFor(publicIds)),
];

export const notifyIndexNow = (publicIds: string[]) => {
  const config = indexNowConfig();
  if (!config || !publicIds.length) return;
  after(async () => {
    await pingIndexNow(config, await changedUrls(config.site, publicIds)).catch(() => null);
  });
};
