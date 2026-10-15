import { applyIngest } from "@/db/ingest";
import { purgeSupportMessages } from "@/db/support";
import { bearerMatches } from "@/lib/bearer";
import { indexNowConfig } from "@/lib/env";
import { listingUrls, pingIndexNow } from "@/lib/indexnow";
import { parseIngest } from "@/lib/ingest-contract";

export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.INGEST_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const batch = parseIngest(await request.json().catch(() => undefined));
  if (!batch) return Response.json({ error: "body must be { activeSourceUrls?, listings: [] }" }, { status: 400 });
  const { upserted, removed, changes } = await applyIngest(batch);
  const purgedSupportMessages = await purgeSupportMessages();
  const config = indexNowConfig();
  const indexnow = config
    ? await pingIndexNow(config, listingUrls(config.site, [...changes.added, ...changes.changed, ...changes.removed])).catch(() => null)
    : null;
  console.log(
    `ingest received=${batch.received} upserted=${upserted} removed=${removed} rejected=${batch.rejected.length} indexnow_submitted=${indexnow?.submitted ?? 0} indexnow_failed=${indexnow?.failed ?? 0}`,
  );
  return Response.json({
    received: batch.received,
    upserted,
    removed,
    rejected: batch.rejected.length,
    rejections: batch.rejected.slice(0, 20),
    indexnow,
    purgedSupportMessages,
  });
}
