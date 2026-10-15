import assert from "node:assert/strict";
import { test } from "node:test";
import { isPhotoKey, photoSrc, photoSrcSet, type PhotoKey } from "./photo";

const key = "AbCdEfGhIjKlMnOpQrStUv" as PhotoKey;

test("photo urls carry only the opaque key, variant and width", () => {
  assert.equal(photoSrc(key, "card", 640), "/img/card/640/AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(
    photoSrcSet(key, "full"),
    [320, 480, 640, 960, 1280, 1920].map((w) => `/img/full/${w}/AbCdEfGhIjKlMnOpQrStUv ${w}w`).join(", "),
  );
});

test("photo keys reject anything but 22 url-safe characters", () => {
  assert.equal(isPhotoKey("AbCdEfGhIjKlMnOpQrStUv"), true);
  assert.equal(isPhotoKey("aHR0cHM6Ly9mbGF0aW9jZG4udnNoY2RuLm5ldA"), false);
  assert.equal(isPhotoKey("../../etc/passwd______"), false);
});
