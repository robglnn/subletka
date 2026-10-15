import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyRowId, publicListingId } from "./listing-id";

test("imported public ids are keyed hashes that carry nothing of the source key", () => {
  process.env.AUTH_SECRET = "secret-a";
  const id = publicListingId("examplio:126244", "imported");
  assert.match(id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(publicListingId("examplio:126244", "imported"), id);
  assert.doesNotMatch(Buffer.from(id, "base64url").toString("latin1"), /examplio|126244/);
  assert.notEqual(publicListingId("examplio:126245", "imported"), id);
  process.env.AUTH_SECRET = "secret-b";
  assert.notEqual(publicListingId("examplio:126244", "imported"), id);
});

test("native ids are their own public id", () => {
  assert.equal(publicListingId("sub:a1B2c3d4", "native"), "sub:a1B2c3d4");
});

test("legacy raw and base64 imported ids resolve to the row id", () => {
  assert.equal(legacyRowId("examplio:126244"), "examplio:126244");
  assert.equal(legacyRowId("ZXhhbXBsaW86MTI2MjQ0"), "examplio:126244");
  assert.equal(legacyRowId("sub:a1B2c3d4"), "sub:a1B2c3d4");
  assert.equal(legacyRowId("nothing-here"), null);
  assert.equal(legacyRowId(publicListingId("examplio:126244", "imported")), null);
});
