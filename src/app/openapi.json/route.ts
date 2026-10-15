import { agentDocument, limited } from "@/lib/agent-http";
import { siteUrl } from "@/lib/env";
import { openApiSpec } from "@/lib/openapi";

export const GET = limited("text", async () => agentDocument(JSON.stringify(openApiSpec(siteUrl()), null, 2), "application/json; charset=utf-8"));
