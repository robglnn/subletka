export type CopyRule = "declined-brand" | "weeks";

export type CopyIssue = { rule: CopyRule; match: string; excerpt: string };

const EDGE_BEFORE = "(?<![\\p{L}\\p{N}_])";
const EDGE_AFTER = "(?![\\p{L}\\p{N}_])";
const UNQUOTED_BEFORE = '(?<!["`])';
const UNQUOTED_AFTER = '(?!["`])';

const RULES: { rule: CopyRule; re: RegExp }[] = [
  { rule: "declined-brand", re: new RegExp(`${EDGE_BEFORE}(?:subletk(?!a(?!\\p{L}))\\p{L}+|subletc\\p{L}*)`, "giu") },
  {
    rule: "weeks",
    re: new RegExp(
      `${EDGE_BEFORE}${UNQUOTED_BEFORE}(?:weeks?|weekly|fortnights?|fortnightly|tydzie[ńn]|tydz|tygodni\\p{L}*|tygodnie)${EDGE_AFTER}${UNQUOTED_AFTER}`,
      "giu",
    ),
  },
];

export const findCopyIssues = (text: string): CopyIssue[] =>
  RULES.flatMap(({ rule, re }) =>
    [...text.matchAll(re)].map((m) => ({
      rule,
      match: m[0],
      excerpt: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ").trim(),
    })),
  );

const COPY_PROBLEM: Record<CopyRule, string> = { "declined-brand": "declines the brand", weeks: "mentions weeks" };

export const copyProblems = (text: string) => [...new Set(findCopyIssues(text).map((i) => `${COPY_PROBLEM[i.rule]}: "${i.excerpt}"`))];
