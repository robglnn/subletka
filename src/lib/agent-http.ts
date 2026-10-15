import "server-only";
import { clientIp } from "@/lib/env";
import { limiter } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  api: { perClient: 120, perPlatformIp: 600, perIp: 1200 },
  mcp: { perClient: 120, perPlatformIp: 600, perIp: 1200 },
  text: { perClient: 30, perPlatformIp: 120, perIp: 300 },
} as const;

type Bucket = keyof typeof RATE_LIMITS;

export const RATE_LIMIT_NOTE = `At most ${RATE_LIMITS.api.perClient} requests a minute per client. Send an X-Client-Id header, one value per end user or conversation, to get a separate budget. MCP clients get one through Mcp-Session-Id. Over a limit the server answers 429 with Retry-After.`;

const PLATFORMS: [string, RegExp][] = [
  ["openai", /openai|chatgpt|gptbot/i],
  ["anthropic", /claude|anthropic/i],
  ["meta", /meta-external|facebook|muse/i],
  ["perplexity", /perplexity/i],
  ["xai", /grok|xai/i],
  ["smithery", /smithery/i],
  ["google", /google/i],
];

export const platformOf = (userAgent: string | null) => PLATFORMS.find(([, re]) => re.test(userAgent ?? ""))?.[0] ?? "other";

const CLIENT_HEADERS = ["mcp-session-id", "x-client-id"];

export const clientKey = (h: Headers) => {
  const platform = platformOf(h.get("user-agent"));
  const client = CLIENT_HEADERS.map((name) => h.get(name)?.trim().slice(0, 128)).find(Boolean);
  if (client) return { key: `${platform}:client:${client}`, shared: false };
  return { key: `${platform}:ip:${clientIp(h)}`, shared: platform !== "other" };
};

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, x-client-id",
  "access-control-expose-headers": "mcp-session-id, retry-after",
} as const;

const byIp = limiter(20_000);
const byClient = limiter(100_000);

const tooMany = (retryAfterMs: number) =>
  Response.json(
    { error: "rate_limited", message: "too many requests, retry after the number of seconds in Retry-After" },
    { status: 429, headers: { ...CORS, "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))), "cache-control": "no-store" } },
  );

export const limited =
  <R extends Request, A extends unknown[]>(bucket: Bucket, handler: (request: R, ...rest: A) => Promise<Response>) =>
  async (request: R, ...rest: A) => {
    const limits = RATE_LIMITS[bucket];
    const ipWait = byIp(`${bucket}:${clientIp(request.headers)}`, limits.perIp, WINDOW_MS);
    if (ipWait) return tooMany(ipWait);
    const { key, shared } = clientKey(request.headers);
    const clientWait = byClient(`${bucket}:${key}`, shared ? limits.perPlatformIp : limits.perClient, WINDOW_MS);
    return clientWait ? tooMany(clientWait) : handler(request, ...rest);
  };

export const apiJson = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      ...CORS,
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
      "x-robots-tag": "noindex",
    },
  });

export const agentDocument = (body: string, contentType: string) =>
  new Response(body, { headers: { ...CORS, "content-type": contentType, "cache-control": "public, max-age=900" } });
