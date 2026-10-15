import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/env";

const AI_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "meta-externalagent",
  "meta-externalfetcher",
  "meta-webindexer",
  "facebookexternalhit",
  "FacebookBot",
  "GrokBot",
  "xAI-SearchBot",
  "Twitterbot",
  "rednote-websearch-bot",
  "Google-Extended",
  "Applebot-Extended",
  "DuckAssistBot",
  "MistralAI-User",
  "CCBot",
];

const SEARCH_ENGINES = ["Googlebot", "Bingbot", "Applebot", "DuckDuckBot"];

const access = {
  allow: ["/", "/api/v1/", "/api/mcp", "/llms.txt", "/llms-full.txt", "/openapi.json"],
  disallow: ["/api/", "/*/manage/", "/*/me"],
  other: { "Content-Signal": "search=yes, ai-input=yes, ai-train=yes" },
};

export const ROBOTS_RULES: MetadataRoute.Robots["rules"] = [
  { userAgent: "*", ...access },
  { userAgent: [...AI_AGENTS, ...SEARCH_ENGINES], ...access },
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return { rules: ROBOTS_RULES, sitemap: `${siteUrl()}/sitemap.xml` };
}
