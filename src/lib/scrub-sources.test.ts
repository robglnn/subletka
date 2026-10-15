import assert from "node:assert/strict";
import { test } from "node:test";
import { loadForbiddenConfig, PLACEHOLDER_CONFIG } from "./forbidden-config";
import { parseIngest } from "./ingest-contract";
import { sourceScrubber } from "./scrub-sources";

const scrub = sourceScrubber(PLACEHOLDER_CONFIG);

test("sentences that name a source are dropped, the rest stays intact", () => {
  assert.equal(
    scrub(
      "Dobra – na Examplio musisz iść bardziej w stronę: przejrzystość, konkret (platforma nie lubi wyciągania kontaktu poza system).\n\nZrobiłem wersję dopasowaną pod styl Examplio – spokojną, profesjonalną.\n\nRoom 4 with Balcony | Bielany | Close to Metro Młociny\n\nSingle room for rent.",
    ),
    "Room 4 with Balcony | Bielany | Close to Metro Młociny\n\nSingle room for rent.",
  );
  assert.equal(scrub("Bright flat. Book on Examplio today! Close to the metro."), "Bright flat. Close to the metro.");
  assert.equal(scrub("Ogłoszenie z EXQ. Pokój w centrum."), "Pokój w centrum.");
  assert.equal(scrub("Bright flat. Details at https://www.examplio.com/rent/126244 or call. Near metro."), "Bright flat. Near metro.");
});

test("brand sentences are dropped and the ordinary word survives", () => {
  assert.equal(scrub("DEMO Co-living offers Classic Studio for students. Book your Kraków adventure today!"), "Book your Kraków adventure today!");
  assert.equal(scrub("Photos: HTTPS://DEMOCOLIVING.COM/krakow/rooms. Quiet street."), "Quiet street.");
  assert.equal(scrub("Single · Warszawa | Demo Campus"), "Single · Warszawa");
  assert.equal(
    scrub("Pokój jednoosobowy. Sample Depot to akademik przy metrze. Zdjęcia na https://sampledepot.pl/pl/pokoj. Blisko kampusu."),
    "Pokój jednoosobowy. Blisko kampusu.",
  );
  const plain = "Room with a demo kitchen in the yard. Demo your worries.";
  assert.equal(scrub(plain), plain);
});

test("title segments that name a source are dropped", () => {
  assert.equal(scrub("Room in Mokotów | Examplio"), "Room in Mokotów");
  assert.equal(scrub("EXAMPLIO | Studio near Wawel"), "Studio near Wawel");
  assert.equal(scrub("Examplio apartment"), "");
});

test("text without a source name is returned unchanged", () => {
  const text = "  Flat near Rondo ONZ |\n\n\n\nexampliocdn photos, platform rules.  ";
  assert.equal(scrub(text), text);
});

test("the ingest contract scrubs imported titles and descriptions with the configured list", () => {
  const [{ name }] = loadForbiddenConfig().sources;
  const listing = {
    id: "example:1",
    source: "example",
    sourceId: "1",
    sourceUrl: "https://listings.example.com/rent/1",
    sourceName: "Example",
    city: "warszawa",
    title: `Room in Mokotów | ${name}`,
    description: `Sunny room. Book it on ${name}!`,
    price: { amount: 900, currency: "EUR", period: "month" },
    termKind: "mid_term",
    placeType: "private_room",
    photos: [],
    fetchedAt: "2026-10-14T03:00:00Z",
  };
  const batch = parseIngest({ listings: [listing] });
  assert.deepEqual(
    batch?.listings.map((l) => [l.title, l.description]),
    [["Room in Mokotów", "Sunny room."]],
  );
});
