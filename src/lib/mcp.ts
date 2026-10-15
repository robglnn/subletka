export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
};

export type McpServer = { name: string; title: string; version: string; instructions: string; tools: McpTool[] };

type Id = string | number | null;
type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const ERRORS = {
  parse: { code: -32700, message: "parse error" },
  invalidRequest: { code: -32600, message: "invalid request" },
  methodNotFound: { code: -32601, message: "method not found" },
  invalidParams: { code: -32602, message: "invalid params" },
} as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is Id => typeof v === "string" || typeof v === "number" || v === null;

const reply = (id: Id, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const fail = (id: Id, error: { code: number; message: string }, data?: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  error: data === undefined ? error : { ...error, data },
});

export type McpResponse = ReturnType<typeof reply> | ReturnType<typeof fail>;

const negotiate = (requested: unknown) =>
  MCP_PROTOCOL_VERSIONS.find((v) => v === requested) ?? MCP_PROTOCOL_VERSIONS[0];

async function callTool(server: McpServer, id: Id, params: Record<string, unknown>) {
  const tool = server.tools.find((t) => t.name === params.name);
  if (!tool) return fail(id, ERRORS.invalidParams, `unknown tool ${String(params.name)}`);
  const { status, body } = await tool.call(params.arguments ?? {});
  return reply(id, {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
    isError: status !== 200,
  });
}

async function dispatch(server: McpServer, message: Message): Promise<McpResponse | null> {
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return fail(isId(message.id) ? message.id : null, ERRORS.invalidRequest);
  }
  if (message.id === undefined) return null;
  if (!isId(message.id)) return fail(null, ERRORS.invalidRequest);
  const { id } = message;
  const params = isObject(message.params) ? message.params : {};
  switch (message.method) {
    case "initialize":
      return reply(id, {
        protocolVersion: negotiate(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: server.tools.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call":
      return callTool(server, id, params);
    default:
      return fail(id, ERRORS.methodNotFound, message.method);
  }
}

export async function handleMcp(server: McpServer, payload: unknown): Promise<McpResponse | McpResponse[] | null> {
  if (Array.isArray(payload)) {
    const replies = (await Promise.all(payload.map((m) => dispatch(server, isObject(m) ? m : {})))).filter((r) => r !== null);
    return replies.length ? replies : null;
  }
  if (!isObject(payload)) return fail(null, ERRORS.parse);
  return dispatch(server, payload);
}
