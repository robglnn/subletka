import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEntities } from "./decode-entities";
import { loadForbiddenConfig } from "./forbidden-config";
import { parseIngest } from "./ingest-contract";

test("html entities left in imported text are decoded once, unknown ones stay as written", () => {
  assert.equal(
    decodeEntities("Studio dla dwojga z osobnymi ł&oacute;żkami, wsp&oacute;lną łazienką"),
    "Studio dla dwojga z osobnymi łóżkami, wspólną łazienką",
  );
  assert.equal(decodeEntities("27&nbsp;m&sup2; &#8211; &#x142;azienka"), "27 m² – łazienka");
  assert.equal(decodeEntities("Tom &amp;amp; Jerry &bogus; &#0;"), "Tom &amp; Jerry &bogus; &#0;");
  assert.equal(decodeEntities("Rent & bills"), "Rent & bills");
});

test("the ingest contract decodes entities before scrubbing, so an encoded brand name is still caught", () => {
  const brand = loadForbiddenConfig().sources.find((s) => s.name.includes(" "))?.name ?? "Sample Depot";
  const batch = parseIngest({
    listings: [
      {
        id: "example:1",
        source: "example",
        sourceId: "1",
        sourceUrl: "https://listings.example.com/pl/1",
        sourceName: "Example",
        city: "krakow",
        title: "Duo Vibes &ndash; Premium",
        description: `Pok&oacute;j dla dwojga. ${brand.replace(" ", "&nbsp;")} to akademik.`,
        price: { amount: 2000, currency: "PLN", period: "month" },
        termKind: "mid_term",
        placeType: "shared_room",
        photos: [],
        fetchedAt: "2026-10-15T03:00:00Z",
      },
    ],
  });
  assert.deepEqual(batch?.listings.map((l) => [l.title, l.description]), [["Duo Vibes – Premium", "Pokój dla dwojga."]]);
});
