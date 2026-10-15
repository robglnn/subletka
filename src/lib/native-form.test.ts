import assert from "node:assert/strict";
import { test } from "node:test";
import { NativeForm } from "./native-form";

const common = {
  website: "",
  availableFrom: "2026-11-15",
  availableTo: "2027-02-28",
  minStayMonths: "",
  price: "700",
  deposit: "",
  bills: "",
  additionalCosts: "",
  cancellationPolicy: "",
  city: "krakow",
  district: "Kazimierz",
  furnished: "",
  pets: "",
  description: "",
  contactEmail: "ola@example.com",
};

test("an entire place posts without the roommate fields the form does not render for it", () => {
  const parsed = NativeForm.safeParse({ ...common, placeType: "whole_place", rooms: "2" });
  assert.deepEqual(parsed.error?.issues.map((i) => i.path[0]), undefined);
  assert.equal(parsed.data?.roommatesGender, null);
  assert.equal(parsed.data?.roommatesCount, null);
});

test("a private room keeps its roommate details", () => {
  const parsed = NativeForm.safeParse({ ...common, placeType: "private_room", roommatesCount: "2", roommatesGender: "female" });
  assert.equal(parsed.data?.roommatesGender, "female");
  assert.equal(parsed.data?.roommatesCount, 2);
});

test("an end date that has already passed in Warsaw is rejected, so a new post is never hidden on arrival", () => {
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
  const parsed = NativeForm.safeParse({ ...common, availableFrom: "2020-01-01", availableTo: yesterday, placeType: "whole_place" });
  assert.deepEqual(parsed.error?.issues.map((i) => [i.path[0], i.message]), [["availableTo", "past"]]);
});
