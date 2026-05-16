import assert from "node:assert/strict";
import test from "node:test";

import { getInternalProfiles } from "../scripts/default-presets.js";

test("internal profiles expose the expected starter systems and metadata", () => {
  const profiles = getInternalProfiles();

  assert.equal(profiles.length, 16);
  assert.deepEqual(profiles.map((profile) => profile.id), [
    "dnd5e-core",
    "pf2e-core",
    "dsa5-core",
    "cyberpunk-red-core",
    "coc7-core",
    "swade-core",
    "alienrpg-core",
    "wfrp4e-core",
    "fallout-core",
    "dcc-core",
    "bitd-core",
    "forbidden-lands-core",
    "gurps-core",
    "torgeternity-core",
    "cyphersystem-core",
    "daggerheart-core"
  ]);
  assert.ok(profiles.every((profile) => profile.source === "internal-preset"));
  assert.ok(profiles.every((profile) => profile.editable === false));
  assert.ok(profiles.every((profile) => Array.isArray(profile.triggers) && profile.triggers.length >= 2));
});

test("internal profile triggers use internal source and stable match shapes", () => {
  const profiles = getInternalProfiles();
  const dnd5e = profiles.find((profile) => profile.id === "dnd5e-core");
  const dsa5 = profiles.find((profile) => profile.id === "dsa5-core");
  const gurps = profiles.find((profile) => profile.id === "gurps-core");

  assert.equal(dnd5e.triggers[0].source, "internal-preset");
  assert.deepEqual(dnd5e.triggers.map((trigger) => trigger.match.type), ["die-max", "die-min"]);
  assert.deepEqual(dsa5.triggers[0].filters.exactDiceCountByFaces, { 20: 3 });
  assert.equal(dsa5.triggers[1].match.value, 20);
  assert.deepEqual(gurps.triggers.map((trigger) => trigger.match.type), ["total-below", "total-above"]);
  assert.deepEqual(gurps.triggers[0].filters.exactDiceCountByFaces, { 6: 3 });
});