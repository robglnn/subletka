import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadForbiddenConfig, parseForbiddenConfig, PLACEHOLDER_CONFIG } from "./forbidden-config";
import { forbiddenMatcher } from "./forbidden-copy";

const { findForbidden, isSourceHost } = forbiddenMatcher(PLACEHOLDER_CONFIG);
const terms = (text: string) => findForbidden(text).map((h) => `${h.kind}:${h.term}`);

test("source credits are caught on word boundaries", () => {
  assert.deepEqual(terms("z Examplio"), ["source:Examplio"]);
  assert.deepEqual(terms("view on examplio.com ↗"), ["source:Examplio"]);
  assert.deepEqual(terms("/pl/l/examplio:126244"), ["source:Examplio"]);
  assert.deepEqual(terms("https://exampliocdn.example.net/a.jpg"), []);
  assert.deepEqual(terms("Some come from public sites."), ["source:public site"]);
  assert.deepEqual(terms("Oferta z innego serwisu otworzy oryginał."), ["source:innego serwis", "link-out:oryginał"]);
});

test("a case-sensitive brand is caught in its brand forms, the ordinary word is not", () => {
  assert.deepEqual(terms("DEMO Co-living offers Classic Studio"), ["source:DEMO", "source:Demo Co-living"]);
  assert.deepEqual(terms("Twin room, demo campus living"), ["source:Demo Campus"]);
  assert.deepEqual(terms("see democoliving.com"), ["source:democoliving"]);
  assert.deepEqual(terms("A quick demo. Demo the flat, demos, Demo day in Mokotów."), []);
});

test("multi-word brands are caught in every spelling", () => {
  assert.deepEqual(terms("Akademik Sample Depot Kraków"), ["source:Sample Depot"]);
  assert.deepEqual(terms("SampleDepot, sample-depot, sampledepot.pl"), ["source:Sample-Depot", "source:SampleDepot", "source:SampleDepot"]);
  assert.deepEqual(terms("EXQ.pl and exq"), ["source:EXQ", "source:EXQ"]);
});

test("owner identifiers are caught, unrelated words are not", () => {
  assert.deepEqual(terms("kontakt ownerhandle@example.com"), ["owner:ownerhandle"]);
  assert.deepEqual(terms("Ownerfirst Ownerlast"), ["owner:Ownerfirst", "owner:Ownerlast"]);
  assert.deepEqual(terms("Xan"), ["owner:Xan"]);
  assert.deepEqual(terms("xanthan, Xander, Roxan"), []);
});

test("the term lists come from env, then the private file, then placeholders", () => {
  assert.deepEqual(
    parseForbiddenConfig({ FORBIDDEN_SOURCES: " Alpha , =BETA,", FORBIDDEN_SOURCE_HOSTS: "Alpha.example", FORBIDDEN_IDENTITY: "Gamma" }),
    { sources: [{ name: "Alpha" }, { name: "BETA", caseSensitive: true }], hosts: ["alpha.example"], identity: ["Gamma"] },
  );
  assert.deepEqual(parseForbiddenConfig({ FORBIDDEN_SOURCES: " , " }), PLACEHOLDER_CONFIG);
  const file = join(mkdtempSync(join(tmpdir(), "forbidden-")), "terms");
  writeFileSync(file, "FORBIDDEN_SOURCES=FromFile\nFORBIDDEN_IDENTITY = Delta,Epsilon\n");
  assert.deepEqual(loadForbiddenConfig({ FORBIDDEN_TERMS_FILE: file, FORBIDDEN_SOURCES: "FromEnv" }), {
    sources: [{ name: "FromEnv" }],
    hosts: PLACEHOLDER_CONFIG.hosts,
    identity: ["Delta", "Epsilon"],
  });
  assert.deepEqual(loadForbiddenConfig({ FORBIDDEN_TERMS_FILE: join(file, "missing") }), PLACEHOLDER_CONFIG);
});

test("fee and paywall copy is caught by stem", () => {
  assert.deepEqual(terms("0 zł prowizji"), ["fee:prowizj"]);
  assert.deepEqual(terms("bez paywalla"), ["fee:paywall"]);
  assert.deepEqual(terms("No fees, no cut."), ["fee:no fee", "fee:no cut"]);
  assert.deepEqual(terms("bez opłaty"), ["fee:bez opłat"]);
  assert.deepEqual(terms("no cutlery"), []);
});

test("payment-handling copy is caught by stem in both languages", () => {
  assert.deepEqual(terms("Subletka never handles payments."), ["payment:handles payment"]);
  assert.deepEqual(terms("We don't take payments or hold an escrow"), ["payment:take payment", "payment:escrow"]);
  assert.deepEqual(terms("If the ad has its own payment system, use it"), ["payment:payment system"]);
  assert.deepEqual(terms("Nie obsługujemy płatności."), ["payment:obsługujemy płatnoś"]);
  assert.deepEqual(terms("Nigdy nie przyjmujemy płatności"), ["payment:przyjmujemy płatnoś"]);
  assert.deepEqual(terms("Subletka nie pośredniczy w płatnościach."), ["payment:pośredniczy w płatnoś"]);
  assert.deepEqual(terms("Płać tylko przez system płatności serwisu"), ["payment:system płatnoś", "payment:płać tylko przez"]);
  assert.deepEqual(terms("Never pay before you've seen the place. Nie płać, zanim zobaczysz mieszkanie."), []);
});

test("link-out explanations are caught by stem in both languages", () => {
  assert.deepEqual(terms("Opens the original ad in a new tab."), ["link-out:original ad", "link-out:new tab"]);
  assert.deepEqual(terms("not stated in the original listing"), ["link-out:original listing"]);
  assert.deepEqual(terms("w oryginalnym ogłoszeniu"), ["link-out:oryginalnym ogłoszeni"]);
  assert.deepEqual(terms("Otworzy oryginalne ogłoszenie w nowej karcie."), ["link-out:oryginalne ogłoszeni", "link-out:nowej karcie"]);
  assert.deepEqual(terms("Przycisk otwiera ogłoszenie, zobacz oryginał"), ["link-out:oryginał", "link-out:otwiera ogłoszeni"]);
});

test("the original-language note is caught in both languages", () => {
  assert.deepEqual(terms("Description in its original language."), ["language-note:original language"]);
  assert.deepEqual(terms("Opis w oryginalnym języku."), ["language-note:oryginalnym język"]);
  assert.deepEqual(terms("Original Languages School, w oryginalnym językiem"), ["language-note:original language", "language-note:oryginalnym język"]);
  assert.deepEqual(terms("Description in Polish. Opis po angielsku."), []);
});

test("the connect-you-directly line is caught in both languages", () => {
  assert.deepEqual(terms("We connect you directly with the person subletting."), ["matchmaking:connect you directly"]);
  assert.deepEqual(terms("Łączymy Cię bezpośrednio z osobą, która podnajmuje."), ["matchmaking:łączymy cię bezpośrednio"]);
  assert.deepEqual(terms("ŁĄCZYMY CIĘ  BEZPOŚREDNIO"), ["matchmaking:łączymy cię bezpośrednio"]);
  assert.deepEqual(terms("You contact the person subletting directly. Kontakt bezpośrednio z osobą, która podnajmuje."), []);
});

test("source hosts are recognised for outbound refs", () => {
  assert.equal(isSourceHost("img.examplio.example.net"), true);
  assert.equal(isSourceHost("www.EXQ.pl"), true);
  assert.equal(isSourceHost("democoliving.com"), true);
  assert.equal(isSourceHost("sampledepot.pl"), true);
  assert.equal(isSourceHost("subletka.com"), false);
  assert.equal(isSourceHost("demo.pl"), false);
});
