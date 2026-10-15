import { renderLlmsTxt } from "@/lib/agent-documents";
import { agentDocument, limited } from "@/lib/agent-http";
import { siteUrl } from "@/lib/env";

export const GET = limited("text", async () => agentDocument(await renderLlmsTxt(siteUrl()), "text/markdown; charset=utf-8"));
