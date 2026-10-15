import { renderLlmsFullTxt } from "@/lib/agent-documents";
import { agentDocument, limited } from "@/lib/agent-http";
import { siteUrl } from "@/lib/env";

export const GET = limited("text", async () => agentDocument(await renderLlmsFullTxt(siteUrl(), "en"), "text/markdown; charset=utf-8"));
