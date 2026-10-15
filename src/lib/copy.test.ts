import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import manifest from "@/app/manifest";
import { ogSvg } from "./brand";
import { findForbidden } from "./forbidden-copy";
import { getDictionary } from "./i18n/dictionaries";
import { SUPPORT_EMAIL } from "./support";

const strings = (value: unknown, path: string): [string, string][] => {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return strings(value({ placeType: "whole_place", rooms: 2, place: "Mokotów" }), `${path}()`);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
};

const violations = (entries: [string, string][]) =>
  entries.flatMap(([path, text]) => [
    ...findForbidden(text).map((h) => `${path}: ${h.term} in "${h.excerpt}"`),
    ...(text.includes("{source}") ? [`${path}: {source} placeholder`] : []),
  ]);

test("the scan reads every dictionary string", () => {
  const pl = strings(getDictionary("pl"), "pl");
  assert.deepEqual(pl.find(([p]) => p === "pl.listing.want"), ["pl.listing.want", "chcę to"]);
  assert.deepEqual(pl.find(([p]) => p === "pl.listing.title()"), ["pl.listing.title()", "mieszkanie 2-pokojowe, Mokotów"]);
});

test("dictionaries never name a source, the owner, or a fee", () => {
  assert.deepEqual(violations([...strings(getDictionary("pl"), "pl"), ...strings(getDictionary("en"), "en")]), []);
});

test("no source file hardcodes a source, the owner, or a fee", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx|css|json)$/.test(f) && !/(\.test\.ts|forbidden-(copy|config)\.ts)$/.test(f))
    .map((f) => join("src", f))
    .filter((f) => statSync(f).isFile());
  assert.ok(files.includes(join("src", "app", "[lang]", "privacy", "page.tsx")));
  assert.deepEqual(violations(files.map((f) => [f, readFileSync(f, "utf8")])), []);
});

test("static copy modules never name a source, the owner, or a fee", () => {
  assert.equal(SUPPORT_EMAIL, "support@subletka.com");
  assert.deepEqual(
    violations([
      ["support", SUPPORT_EMAIL],
      ...strings(manifest(), "manifest"),
      ["og", ogSvg()],
    ]),
    [],
  );
});
