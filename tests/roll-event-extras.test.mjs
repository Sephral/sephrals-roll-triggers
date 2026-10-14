import assert from "node:assert/strict";
import test from "node:test";

import { GenericRollAdapter } from "../scripts/adapters/generic-adapter.js";
import { createRollEvent, getRollTargetUuids } from "../scripts/roll-event.js";

class DiceTerm {
  constructor(faces, values) {
    this.faces = faces;
    this.number = values.length;
    this.results = values.map((result) => ({ result, active: true }));
  }
}

const tokenTargets = new Set([
  { document: { uuid: "Scene.s1.Token.t1" } },
  { document: { uuid: "Scene.s1.Token.t2" } }
]);

globalThis.foundry = { dice: { terms: { DiceTerm } } };
globalThis.game = {
  system: { id: "generic", version: "1.0.0" },
  combat: { started: false },
  user: { id: "gm-1", isGM: true, name: "GM", targets: new Set() },
  users: {
    get(id) {
      return id === "player-1" ? { id, isGM: false, name: "Player", targets: tokenTargets } : null;
    }
  },
  settings: {
    get() {
      return "publicroll";
    }
  },
  scenes: null
};
globalThis.canvas = { scene: { id: "scene-viewed" } };

function createRoll() {
  return { formula: "2d6", total: 7, options: {}, terms: [new DiceTerm(6, [3, 4])] };
}

test("getRollTargetUuids prefers dnd5e and PF2e message targets over the roller's targets", () => {
  const user = { targets: tokenTargets };
  assert.deepEqual(getRollTargetUuids({ flags: { dnd5e: { targets: [{ uuid: "Actor.a" }, { uuid: "Actor.a" }, { uuid: "" }, {}] } } }, user), ["Actor.a"]);
  assert.deepEqual(getRollTargetUuids({ flags: { pf2e: { context: { target: { actor: "Actor.b", token: "Scene.s.Token.b" } } } } }, user), ["Scene.s.Token.b"]);
  assert.deepEqual(getRollTargetUuids({ flags: { pf2e: { context: { target: { actor: "Actor.b" } } } } }, user), ["Actor.b"]);
  assert.deepEqual(getRollTargetUuids({ flags: {} }, user), ["Scene.s1.Token.t1", "Scene.s1.Token.t2"]);
  assert.deepEqual(getRollTargetUuids({}, null), []);
});

test("createRollEvent stores the roller's targets and falls back to the core speaker actor", () => {
  const actor = { id: "actor-1", name: "Hero", type: "character" };
  const message = {
    id: "m1",
    rolls: [createRoll()],
    speaker: {},
    flags: {},
    whisper: [],
    _source: { author: "player-1" },
    speakerActor: actor
  };

  const event = createRollEvent(message, message.rolls[0], 0, "generic");
  assert.equal(event.actorId, "actor-1");
  assert.equal(event.actorType, "pc");
  assert.deepEqual(event.targetUuids, ["Scene.s1.Token.t1", "Scene.s1.Token.t2"]);
  assert.equal(event.visibility, "public");
  assert.equal(event.isCombat, false);

  // dnd5e's getAssociatedActor still wins when the system provides it.
  const associated = { id: "actor-2", name: "Token Hero", type: "npc" };
  const dnd5eEvent = createRollEvent({ ...message, getAssociatedActor: () => associated }, message.rolls[0], 0, "generic");
  assert.equal(dnd5eEvent.actorId, "actor-2");
});

test("extra overrides describe a test bench roll through the same event builder", () => {
  const message = { id: null, rolls: [createRoll()], speaker: {}, flags: {}, whisper: [], blind: false, _source: { author: "gm-1" }, speakerActor: null };
  const [event] = new GenericRollAdapter().extractRollEvents(message, {
    rollType: "damage",
    successDegree: "criticalSuccess",
    visibility: "self",
    isCombat: true,
    targetUuids: ["Actor.x"]
  });

  assert.equal(event.rollType, "damage");
  assert.equal(event.successDegree, "critical-success");
  assert.equal(event.visibility, "self");
  assert.equal(event.isCombat, true);
  assert.deepEqual(event.targetUuids, ["Actor.x"]);
  assert.deepEqual(event.diceResults, [{ faces: 6, value: 3 }, { faces: 6, value: 4 }]);
  assert.equal(event.total, 7);
  assert.equal(event.sceneId, "scene-viewed");

  // Without overrides the adapter behaves as before.
  const [plain] = new GenericRollAdapter().extractRollEvents(message);
  assert.equal(plain.rollType, "any");
  assert.equal(plain.isCombat, false);
});
