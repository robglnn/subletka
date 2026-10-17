import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { runMigrations } from "../instrumentation-node";
import { CITIES } from "../lib/domain";
import { db } from "./index";
import { cityGlance } from "./listings";
import { rentByCity } from "./rent";

const url = process.env.DATABASE_URL;

before(async () => {
  if (url) await runMigrations(url);
});

after(async () => {
  await db.$client.end();
});

test("the rent page counts the same listings and finds the same medians as the city and district pages", { skip: !url && "needs DATABASE_URL" }, async () => {
  for (const city of CITIES) {
    const rent = await rentByCity(city);
    const glance = await cityGlance(city);
    assert.equal(rent.all.listings, glance.total, city);
    if (rent.all.medianPln !== null) assert.equal(rent.all.medianPln, glance.medianPln, city);
    for (const d of rent.districts) {
      const here = await cityGlance(city, d.name);
      assert.equal(d.listings, here.total, d.name);
      if (d.medianPln !== null) assert.equal(d.medianPln, here.medianPln, d.name);
    }
  }
});
