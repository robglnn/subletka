import { indexNowConfig } from "@/lib/env";

export async function GET(_: Request, ctx: RouteContext<"/api/indexnow-key/[key]">) {
  const { key } = await ctx.params;
  const config = indexNowConfig();
  if (!config || key !== config.key) return new Response("not found\n", { status: 404 });
  return new Response(config.key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
