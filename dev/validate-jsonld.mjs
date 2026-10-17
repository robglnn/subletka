import { existsSync, readFileSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:4317").replace(/\/$/, "");
const VOCAB_URL = "https://schema.org/version/latest/schemaorg-current-https.jsonld";
const VOCAB_CACHE = "/tmp/schemaorg-current-https.jsonld";
const SAMPLE = Number(process.env.JSONLD_SAMPLE ?? 6);

const loadVocab = async () => {
  if (!existsSync(VOCAB_CACHE)) writeFileSync(VOCAB_CACHE, await (await fetch(VOCAB_URL)).text());
  const graph = JSON.parse(readFileSync(VOCAB_CACHE, "utf8"))["@graph"];
  const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? x : x["@id"]));
  const local = (id) => id.replace(/^schema:/, "");
  const classes = new Map();
  const properties = new Map();
  const members = new Map();
  for (const node of graph) {
    const types = list(node["@type"]);
    const id = local(node["@id"]);
    if (types.includes("rdfs:Class")) classes.set(id, list(node["rdfs:subClassOf"]).map(local));
    else if (types.includes("rdf:Property")) {
      properties.set(id, { domain: list(node["schema:domainIncludes"]).map(local), range: list(node["schema:rangeIncludes"]).map(local) });
    } else if (types.some((t) => t.startsWith("schema:"))) members.set(id, types.map(local));
  }
  const ancestors = (type, seen = new Set()) => {
    if (seen.has(type)) return seen;
    seen.add(type);
    for (const parent of classes.get(type) ?? []) ancestors(parent, seen);
    return seen;
  };
  return { classes, properties, members, ancestors };
};

const DATA = { string: ["Text", "URL", "Date", "DateTime", "Time"], number: ["Number", "Integer", "Float"], boolean: ["Boolean"] };

const validate = (vocab, graph, page) => {
  const errors = [];
  const ids = new Set();
  const refs = [];
  const walk = (node, path, range) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`, range));
    if (node === null || typeof node !== "object") {
      const kinds = DATA[typeof node] ?? [];
      const rangeTypes = range.flatMap((r) => [...vocab.ancestors(r)]);
      const enumeration = typeof node === "string" && node.startsWith("https://schema.org/") && vocab.members.has(node.slice(19));
      const reference = typeof node === "string" && /^https?:\/\//.test(node) && range.some((r) => vocab.ancestors(r).has("Thing"));
      const ok =
        enumeration || reference || rangeTypes.some((r) => kinds.includes(r)) || (typeof node === "string" && range.some((r) => vocab.ancestors(r).has("Enumeration")));
      if (!ok) errors.push(`${page} ${path}: ${typeof node} value ${JSON.stringify(node)} where range is ${range.join("|")}`);
      return;
    }
    const types = node["@type"] === undefined ? [] : [node["@type"]].flat();
    if (node["@id"] && types.length) ids.add(node["@id"]);
    if (node["@id"] && !types.length && Object.keys(node).length === 1) return refs.push([path, node["@id"]]);
    for (const t of types) if (!vocab.classes.has(t)) errors.push(`${page} ${path}: unknown type ${t}`);
    const lineage = new Set(types.flatMap((t) => [...vocab.ancestors(t)]));
    if (range.length && types.length && !types.some((t) => range.some((r) => vocab.ancestors(t).has(r)))) {
      errors.push(`${page} ${path}: ${types.join(",")} is not a ${range.join("|")}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@")) continue;
      const prop = vocab.properties.get(key);
      if (!prop) {
        errors.push(`${page} ${path}.${key}: unknown property`);
        continue;
      }
      if (!prop.domain.some((d) => lineage.has(d))) errors.push(`${page} ${path}.${key}: not a property of ${types.join(",")}`);
      walk(value, `${path}.${key}`, prop.range);
    }
  };
  if (graph["@context"] !== "https://schema.org") errors.push(`${page}: @context is ${graph["@context"]}`);
  walk(graph["@graph"], "@graph", []);
  for (const [path, id] of refs) if (!ids.has(id)) errors.push(`${page} ${path}: dangling reference ${id}`);
  for (const crumb of graph["@graph"].filter((n) => n["@type"] === "BreadcrumbList")) {
    crumb.itemListElement.forEach((item, i) => {
      if (item.position !== i + 1 || !item.name || (!item.item && i < crumb.itemListElement.length - 1)) {
        errors.push(`${page} BreadcrumbList item ${i + 1} is missing position, name or item`);
      }
    });
  }
  for (const set of graph["@graph"].filter((n) => n["@type"] === "Dataset")) {
    const length = set.description?.length ?? 0;
    if (!set.name || length < 50 || length > 5000) errors.push(`${page} Dataset needs a name and a 50 to 5000 character description`);
  }
  return errors;
};

const blocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const pages = async () => {
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const listings = [...sitemap.matchAll(/<loc>[^<]*?(\/[a-z]{2}\/l\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  const step = Math.max(1, Math.floor(listings.length / SAMPLE));
  const sample = listings.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  return ["pl", "en"].flatMap((lang) => [`/${lang}/warszawa`, `/${lang}/krakow`, `/${lang}/warszawa/mokotow`, `/${lang}/krakow/stare-miasto`, `/${lang}/krakow/swoszowice`, `/${lang}/warszawa/rent`, `/${lang}/krakow/rent`, ...sample.map((p) => p.replace(/^\/[a-z]{2}/, `/${lang}`))]);
};

const vocab = await loadVocab();
const broken = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Apartmentt", name: "x" },
    { "@type": "Offer", price: "cheap", numberOfRooms: 2, offers: { "@id": "#missing" }, priceSpecification: { "@type": "Person" } },
  ],
};
const caught = validate(vocab, broken, "self-check");
if (caught.length < 5) throw new Error(`validator missed planted errors: ${caught.join("; ")}`);
const targets = await pages();
const results = await Promise.all(
  targets.map(async (path) => {
    const found = blocks(await (await fetch(`${base}${path}`)).text());
    if (!found.length) return { path, types: [], errors: [`${path}: no JSON-LD`] };
    return { path, types: found.flatMap((g) => g["@graph"].map((n) => n["@type"])), errors: found.flatMap((g) => validate(vocab, g, path)) };
  }),
);
for (const r of results) console.log(`${r.errors.length ? "FAIL" : "ok  "} ${r.path} ${r.types.join(" ")}`);
const errors = results.flatMap((r) => r.errors);
console.log(errors.length ? `\n${errors.join("\n")}` : `\n${results.length} pages valid against schema.org ${VOCAB_URL}`);
process.exit(errors.length ? 1 : 0);
