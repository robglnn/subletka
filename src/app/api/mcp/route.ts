import { OPERATION_HANDLERS } from "@/lib/agent-api";
import { CORS, limited } from "@/lib/agent-http";
import { jsonSchema, OPERATIONS, type OperationName } from "@/lib/agent-query";
import { siteUrl } from "@/lib/env";
import { handleMcp, type McpServer } from "@/lib/mcp";

const INSTRUCTIONS =
  "Subletka lists rooms and flats for long-term stays in Warsaw and Kraków. Read-only. Pass lang=pl for prices in zł or lang=en for prices in €, matching the currency of the user's budget; max is in that currency. Link the person to each result's url so they can contact the lister.";

const server = (site: string): McpServer => ({
  name: "subletka",
  title: "Subletka",
  version: "1.0.0",
  instructions: INSTRUCTIONS,
  tools: (Object.keys(OPERATIONS) as OperationName[]).map((name) => ({
    name,
    title: OPERATIONS[name].title,
    description: OPERATIONS[name].description,
    inputSchema: jsonSchema(OPERATIONS[name].schema),
    call: (args) => OPERATION_HANDLERS[name](args, site),
  })),
});

const isInitialize = (payload: unknown) =>
  typeof payload === "object" && payload !== null && "method" in payload && payload.method === "initialize";

const notAllowed = () => new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });

export const POST = limited("mcp", async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const response = await handleMcp(server(siteUrl()), payload);
  if (response === null) return new Response(null, { status: 202, headers: CORS });
  const session: Record<string, string> = isInitialize(payload) ? { "mcp-session-id": crypto.randomUUID() } : {};
  return Response.json(response, { headers: { ...CORS, "cache-control": "no-store", ...session } });
});

export const GET = async () => notAllowed();
export const DELETE = async () => notAllowed();
export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });
