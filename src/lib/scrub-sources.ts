import { loadForbiddenConfig, type ForbiddenConfig } from "./forbidden-config";
import { forbiddenMatcher, literal } from "./forbidden-copy";

export const sourceScrubber = (config: ForbiddenConfig) => {
  const names = forbiddenMatcher(config).sourceNamePattern;
  const sourceUrl = `[hH][tT][tT][pP][sS]?://\\S*?(${[...new Set(config.hosts.map((h) => literal(h)))].join("|")})\\S*?(?=[.,;:!?]*(?:\\s|$))`;
  const mentions = new RegExp(`${names}|${sourceUrl}`, "u");
  const urls = new RegExp(sourceUrl, "gu");
  const segments = new RegExp(`(?:[^.!?|\\s][^.!?|\\n]*)?${names}[^.!?|\\n]*[.!?|]*[ \\t]*`, "gu");
  return (text: string) =>
    mentions.test(text)
      ? text
          .replace(urls, " $1 ")
          .replace(segments, "")
          .replace(/[ \t]*\|?[ \t]*$/gm, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : text;
};

export const scrubSourceNames = sourceScrubber(loadForbiddenConfig());
