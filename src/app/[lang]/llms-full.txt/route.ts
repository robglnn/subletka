import { renderLlmsFullTxt } from "@/lib/agent-documents";
import { agentDocument, limited } from "@/lib/agent-http";
import { isLocale } from "@/lib/domain";
import { siteUrl } from "@/lib/env";

export const GET = limited("text", async (_request: Request, ctx: RouteContext<"/[lang]/llms-full.txt">) => {
  const { lang } = await ctx.params;
  if (!isLocale(lang)) return new Response("not found", { status: 404 });
  return agentDocument(await renderLlmsFullTxt(siteUrl(), lang), "text/markdown; charset=utf-8");
});
