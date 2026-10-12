import assert from "node:assert/strict";
import test from "node:test";

import { getInternalProfiles } from "../scripts/default-presets.js";

test("internal profiles expose the expected starter systems and metadata", () => {
  const profiles = getInternalProfiles();

  assert.equal(profiles.length, 17);
  assert.deepEqual(profiles.map((profile) => profile.id), [
    "dnd5e-core",
    "pf2e-core",
    "dsa5-core",
    "cyberpunk-red-core",
    "coc7-core",
    "generic-d100-doubles-core",
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
  const d100 = profiles.find((profile) => profile.id === "generic-d100-doubles-core");
  const gurps = profiles.find((profile) => profile.id === "gurps-core");

  assert.equal(dnd5e.triggers[0].source, "internal-preset");
  assert.deepEqual(dnd5e.triggers.map((trigger) => trigger.match.type), ["die-max", "die-min"]);
  assert.deepEqual(dsa5.triggers[0].filters.exactDiceCountByFaces, { 20: 3 });
  assert.equal(dsa5.triggers[1].match.value, 20);
  assert.equal(d100.triggers[0].match.type, "custom-js");
  assert.deepEqual(d100.triggers[0].filters.rollType, ["skill", "check"]);
  assert.deepEqual(d100.triggers[0].filters.exactDiceCountByFaces, { 100: 1 });
  assert.equal(d100.triggers[0].executionMode, "automatic");
  assert.equal(d100.triggers[0].actions[0].type, "chat-message");
  assert.deepEqual(gurps.triggers.map((trigger) => trigger.match.type), ["total-below", "total-above"]);
  assert.deepEqual(gurps.triggers[0].filters.exactDiceCountByFaces, { 6: 3 });
});

test("PF2e and D&D 5e starter triggers match their systems' real roll data", async () => {
  const { matchTrigger } = await import("../scripts/triggers.js");
  const { normalizeSuccessDegree } = await import("../scripts/roll-event.js");
  const profiles = getInternalProfiles();
  const [pf2eCrit, pf2eFumble] = profiles.find((profile) => profile.id === "pf2e-core").triggers;
  const [dndNat20, dndNat1] = profiles.find((profile) => profile.id === "dnd5e-core").triggers;
  const baseEvent = { diceResults: [{ faces: 20, value: 20 }], total: 25, visibility: "public", user: { isGM: false }, flags: {} };

  // PF2e: flags.pf2e.context.outcome "criticalSuccess" and roll.options.degreeOfSuccess 0 after normalization.
  assert.ok(matchTrigger(pf2eCrit, { ...baseEvent, successDegree: normalizeSuccessDegree("criticalSuccess") }));
  assert.ok(matchTrigger(pf2eFumble, { ...baseEvent, successDegree: normalizeSuccessDegree(0) }));
  assert.equal(matchTrigger(pf2eCrit, { ...baseEvent, successDegree: normalizeSuccessDegree("success") }), null);

  // dnd5e: flags.dnd5e.roll.type "attack".
  assert.ok(matchTrigger(dndNat20, { ...baseEvent, rollType: "attack" }));
  assert.ok(matchTrigger(dndNat1, { ...baseEvent, rollType: "attack", diceResults: [{ faces: 20, value: 1 }] }));
  assert.equal(matchTrigger(dndNat20, { ...baseEvent, rollType: "save" }), null);
});

test("the d100 doubles preset accepts dnd5e ability and tool checks through the check filter", async () => {
  const { createRollEvent } = await import("../scripts/roll-event.js");
  const { matchTrigger } = await import("../scripts/triggers.js");
  const [doubles] = getInternalProfiles().find((profile) => profile.id === "generic-d100-doubles-core").triggers;

  globalThis.game = {
    system: { id: "dnd5e", version: "5.3.3" },
    combat: { started: false },
    user: { id: "gm", isGM: true },
    users: { get: () => null },
    settings: { get: () => "publicroll" },
    scenes: { get: () => null }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm: class DiceTerm {} } } };

  const rollFor = (type) => {
    const roll = { formula: "1d100", total: 33, options: {}, terms: [{ constructor: { name: "Die" }, faces: 100, number: 1, results: [{ result: 33, active: true }] }] };
    const message = { id: `m-${type}`, speaker: {}, flags: { dnd5e: { roll: { type } } }, rolls: [roll], getAssociatedActor: () => null };
    return createRollEvent(message, roll, 0, "generic");
  };

  assert.ok(matchTrigger(doubles, rollFor("ability")));
  assert.ok(matchTrigger(doubles, rollFor("tool")));
  assert.ok(matchTrigger(doubles, rollFor("skill")));
  assert.equal(matchTrigger(doubles, rollFor("attack")), null);
});
