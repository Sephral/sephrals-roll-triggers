import assert from "node:assert/strict";
import test from "node:test";

import { createRollEvent, getVisibleDiceResults, normalizeSuccessDegree } from "../scripts/roll-event.js";

class DiceTerm {
  constructor(formula, total, faces, results) {
    this.formula = formula;
    this.total = total;
    this.faces = faces;
    this.number = results.length;
    this.results = results;
  }
}

test("getVisibleDiceResults filters inactive, discarded, and non-numeric results", () => {
  const visible = getVisibleDiceResults({
    results: [
      { result: 6, active: true, discarded: false },
      { result: 1, active: false, discarded: false },
      { result: 3, active: true, discarded: true },
      { result: "x", active: true, discarded: false }
    ]
  });

  assert.deepEqual(visible, [{
    result: 6,
    active: true,
    discarded: false,
    exploded: false,
    rerolled: false,
    success: null,
    failure: null
  }]);
});

test("createRollEvent normalizes nested dice terms, visibility, actor, token, and item context", () => {
  globalThis.game = {
    system: { id: "pf2e", version: "6.0.0" },
    combat: { started: true },
    user: { id: "fallback-user", isGM: false, name: "Fallback" },
    users: {
      get(id) {
        return id === "u1" ? { id: "u1", name: "Player", isGM: false } : null;
      }
    },
    settings: {
      get() {
        return "blindroll";
      }
    },
    scenes: {
      get(id) {
        return id === "scene-1"
          ? {
              tokens: {
                get(tokenId) {
                  return tokenId === "token-1" ? { id: "token-1", name: "Token Hero" } : null;
                }
              }
            }
          : null;
      }
    }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  // PF2e CheckRoll: degreeOfSuccess is a number (0 critical failure .. 3 critical success).
  const roll = {
    formula: "2d20kh + 7",
    total: 27,
    options: { degreeOfSuccess: 3, rollType: "check" },
    terms: [
      {
        terms: [new DiceTerm("1d20", 20, 20, [{ result: 20, active: true, discarded: false }])]
      },
      {
        rolls: [{ terms: [new DiceTerm("1d20", 7, 20, [{ result: 7, active: true, discarded: false }])] }]
      },
      {
        roll: {
          terms: [new DiceTerm("1d6", 4, 6, [{ result: 4, active: true, discarded: false }])]
        }
      }
    ]
  };

  const message = {
    id: "m1",
    uuid: "ChatMessage.m1",
    user: "u1",
    blind: true,
    whisper: ["gm-1"],
    speaker: { scene: "scene-1", token: "token-1", user: "u1" },
    flags: {
      pf2e: {
        context: { outcome: "criticalSuccess" },
        item: { id: "item-1", name: "Sword" }
      },
      core: {
        rollMode: "blindroll"
      }
    },
    rolls: [roll],
    getAssociatedActor() {
      return { id: "actor-1", name: "Hero", type: "character" };
    }
  };

  const event = createRollEvent(message, roll, 0, "generic", { rollType: "attack" });

  assert.equal(event.visibility, "blind");
  assert.equal(event.rollMode, "blindroll");
  assert.equal(event.actorType, "pc");
  assert.equal(event.tokenId, "token-1");
  assert.equal(event.itemId, "item-1");
  assert.equal(event.successDegree, "critical-success");
  assert.equal(event.userId, "u1");
  assert.equal(event.sceneId, "scene-1");
  assert.deepEqual(event.diceResults, [
    { faces: 20, value: 20 },
    { faces: 20, value: 7 },
    { faces: 6, value: 4 }
  ]);
});

test("createRollEvent infers self visibility and fallback actor type values", () => {
  globalThis.game = {
    system: { id: "swade", version: "1.0.0" },
    combat: { started: false },
    user: { id: "u2", isGM: true, name: "GM" },
    users: {
      get(id) {
        return { id, name: `User ${id}`, isGM: id === "u2" };
      }
    },
    settings: {
      get() {
        return "selfroll";
      }
    },
    scenes: { get() { return null; } }
  };
  globalThis.canvas = { scene: { id: "canvas-scene" } };
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const roll = {
    formula: "1d10",
    total: 10,
    options: { type: "damage" },
    terms: [new DiceTerm("1d10", 10, 10, [{ result: 10, active: true, discarded: false }])]
  };
  const message = {
    id: "m2",
    user: { id: "u2" },
    whisper: ["u2"],
    speaker: { user: "u2" },
    flags: { swade: { item: { _id: "item-2", name: "Revolver" } } },
    getAssociatedActor() {
      return { id: "actor-2", name: "Wagon", type: "vehicle" };
    },
    rolls: [roll]
  };

  const event = createRollEvent(message, roll, 1, "generic");

  assert.equal(event.visibility, "self");
  assert.equal(event.rollType, "damage");
  assert.equal(event.actorType, "vehicle");
  assert.equal(event.itemId, "item-2");
  assert.equal(event.sceneId, "canvas-scene");
});

test("createRollEvent prefers raw source user data before deprecated message.user", () => {
  globalThis.game = {
    system: { id: "dnd5e", version: "5.2.0" },
    combat: { started: false },
    user: { id: "fallback", isGM: false, name: "Fallback" },
    users: {
      get(id) {
        return id === "u3" ? { id: "u3", name: "Author User", isGM: false } : null;
      }
    },
    settings: {
      get() {
        return "publicroll";
      }
    },
    scenes: { get() { return null; } }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const roll = {
    formula: "1d20",
    total: 12,
    terms: [new DiceTerm("1d20", 12, 20, [{ result: 12, active: true, discarded: false }])]
  };
  const message = {
    id: "m3",
    author: { id: "u3", name: "Author User", isGM: false },
    _source: { user: "u3" },
    speaker: { user: "u3" },
    flags: {},
    get user() {
      throw new Error("deprecated message.user getter should not be touched");
    },
    getAssociatedActor() {
      return null;
    },
    rolls: [roll]
  };

  const event = createRollEvent(message, roll, 2, "generic");

  assert.equal(event.userId, "u3");
  assert.equal(event.user?.name, "Author User");
});

test("createRollEvent reads the author source field without touching the deprecated user field", () => {
  globalThis.game = {
    system: { id: "dnd5e", version: "5.3.3" },
    combat: { started: false },
    user: { id: "gm", isGM: true, name: "GM" },
    users: {
      get(id) {
        return id === "u5" ? { id: "u5", name: "Player Five", isGM: false } : null;
      }
    },
    settings: {
      get() {
        return "publicroll";
      }
    },
    scenes: { get() { return null; } }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const roll = {
    formula: "1d20",
    total: 4,
    terms: [new DiceTerm("1d20", 4, 20, [{ result: 4, active: true, discarded: false }])]
  };
  const message = {
    id: "m5",
    _source: {
      author: "u5",
      get user() {
        throw new Error("the deprecated source field should not be read");
      }
    },
    speaker: {},
    flags: {},
    getAssociatedActor() {
      return null;
    },
    rolls: [roll]
  };

  const event = createRollEvent(message, roll, 0, "generic");

  assert.equal(event.userId, "u5");
  assert.equal(event.user?.name, "Player Five");
});

test("createRollEvent falls back to current game user without touching deprecated accessors", () => {
  globalThis.game = {
    system: { id: "dnd5e", version: "5.2.0" },
    combat: { started: false },
    user: { id: "fallback", isGM: false, name: "Fallback" },
    users: {
      get(id) {
        return id === "fallback" ? { id: "fallback", name: "Fallback", isGM: false } : null;
      }
    },
    settings: {
      get() {
        return "publicroll";
      }
    },
    scenes: { get() { return null; } }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const roll = {
    formula: "1d20",
    total: 9,
    terms: [new DiceTerm("1d20", 9, 20, [{ result: 9, active: true, discarded: false }])]
  };
  const message = {
    id: "m4",
    speaker: {},
    flags: {},
    get user() {
      throw new Error("deprecated message.user getter should not be touched");
    },
    get author() {
      throw new Error("message.author getter should not be touched either");
    },
    getAssociatedActor() {
      return null;
    },
    rolls: [roll]
  };

  const event = createRollEvent(message, roll, 0, "generic");

  assert.equal(event.userId, "fallback");
  assert.equal(event.user?.name, "Fallback");
});

function setupGame(systemId) {
  globalThis.game = {
    system: { id: systemId, version: "1.0.0" },
    combat: { started: false },
    user: { id: "gm", isGM: true, name: "GM" },
    users: { get: () => null },
    settings: { get: () => "publicroll" },
    scenes: { get: () => null }
  };
  globalThis.canvas = null;
  globalThis.foundry = { dice: { terms: { DiceTerm } } };
}

function createMessage(flags, roll) {
  return {
    id: "m-test",
    speaker: {},
    flags,
    rolls: [roll],
    getAssociatedActor() {
      return null;
    }
  };
}

test("normalizeSuccessDegree maps PF2e outcomes and degree numbers to the internal kebab-case form", () => {
  assert.equal(normalizeSuccessDegree("criticalSuccess"), "critical-success");
  assert.equal(normalizeSuccessDegree("criticalFailure"), "critical-failure");
  assert.equal(normalizeSuccessDegree("success"), "success");
  assert.equal(normalizeSuccessDegree("critical-success"), "critical-success");
  assert.equal(normalizeSuccessDegree("Critical Success"), "critical-success");
  assert.equal(normalizeSuccessDegree(3), "critical-success");
  assert.equal(normalizeSuccessDegree(2), "success");
  assert.equal(normalizeSuccessDegree(1), "failure");
  assert.equal(normalizeSuccessDegree(0), "critical-failure");
  assert.equal(normalizeSuccessDegree("3"), "critical-success");
  assert.equal(normalizeSuccessDegree(7), "7");
  assert.equal(normalizeSuccessDegree(null), null);
  assert.equal(normalizeSuccessDegree(""), null);
});

test("createRollEvent reads the PF2e degree number when the message has no outcome flag", () => {
  setupGame("pf2e");
  const roll = {
    formula: "1d20 + 4",
    total: 5,
    options: { degreeOfSuccess: 0 },
    terms: [new DiceTerm("1d20", 1, 20, [{ result: 1, active: true, discarded: false }])]
  };

  const event = createRollEvent(createMessage({ pf2e: { context: { outcome: null } } }, roll), roll, 0, "generic");

  assert.equal(event.successDegree, "critical-failure");
});

test("createRollEvent reads the dnd5e roll type from the message flag", () => {
  setupGame("dnd5e");
  const attack = {
    formula: "1d20 + 5",
    total: 25,
    options: {},
    terms: [new DiceTerm("1d20", 20, 20, [{ result: 20, active: true, discarded: false }])]
  };
  // A dnd5e DamageRoll keeps the damage type in options.type. The message flag must win over it.
  const damage = {
    formula: "1d8 + 3",
    total: 9,
    options: { type: "fire" },
    terms: [new DiceTerm("1d8", 6, 8, [{ result: 6, active: true, discarded: false }])]
  };

  assert.equal(createRollEvent(createMessage({ dnd5e: { roll: { type: "attack" } } }, attack), attack, 0, "generic").rollType, "attack");
  assert.equal(createRollEvent(createMessage({ dnd5e: { roll: { type: "damage" } } }, damage), damage, 0, "generic").rollType, "damage");

  // roll.options.rollType (dnd5e copies the flag there) still comes first, other systems keep options.type.
  const copied = { ...attack, options: { rollType: "save" } };
  assert.equal(createRollEvent(createMessage({ dnd5e: { roll: { type: "attack" } } }, copied), copied, 0, "generic").rollType, "save");
  assert.equal(createRollEvent(createMessage({}, damage), damage, 0, "generic").rollType, "fire");
});

test("createRollEvent maps dnd5e roll types to the module's roll type filter values", () => {
  const roll = () => ({
    formula: "1d20",
    total: 12,
    options: {},
    terms: [new DiceTerm("1d20", 12, 20, [{ result: 12, active: true, discarded: false }])]
  });
  const rollTypeFor = (type, systemId = "dnd5e") => {
    setupGame(systemId);
    const current = roll();
    return createRollEvent(createMessage({ dnd5e: { roll: { type } } }, current), current, 0, "generic").rollType;
  };

  const expected = {
    ability: "check",
    tool: "check",
    skill: "skill",
    save: "save",
    death: "save",
    attack: "attack",
    damage: "damage",
    healing: "healing",
    hitDie: "healing",
    hitPoints: "utility",
    generic: "utility"
  };
  for (const [type, filterValue] of Object.entries(expected)) assert.equal(rollTypeFor(type), filterValue, type);

  // The copy in roll.options.rollType is mapped the same way.
  setupGame("dnd5e");
  const copied = { ...roll(), options: { rollType: "ability" } };
  assert.equal(createRollEvent(createMessage({}, copied), copied, 0, "generic").rollType, "check");

  // Other systems keep their own roll type values.
  assert.equal(rollTypeFor("ability", "pf2e"), "ability");
});

test("createRollEvent reads core initiative rolls as initiative", () => {
  setupGame("dnd5e");
  const roll = {
    formula: "1d20 + 2",
    total: 15,
    options: {},
    terms: [new DiceTerm("1d20", 13, 20, [{ result: 13, active: true, discarded: false }])]
  };

  assert.equal(createRollEvent(createMessage({ core: { initiativeRoll: true } }, roll), roll, 0, "generic").rollType, "initiative");
  assert.equal(createRollEvent(createMessage({ "core.initiativeRoll": true }, roll), roll, 0, "generic").rollType, "initiative");
  assert.equal(createRollEvent(createMessage({}, roll), roll, 0, "generic").rollType, "any");
});

test("createRollEvent prefers the speaker scene over the scene the GM is viewing", () => {
  setupGame("dnd5e");
  globalThis.canvas = { scene: { id: "viewed-scene" } };
  const roll = {
    formula: "1d20",
    total: 11,
    terms: [new DiceTerm("1d20", 11, 20, [{ result: 11, active: true, discarded: false }])]
  };
  const message = { ...createMessage({}, roll), speaker: { scene: "speaker-scene" } };

  assert.equal(createRollEvent(message, roll, 0, "generic").sceneId, "speaker-scene");
  assert.equal(createRollEvent({ ...message, speaker: {} }, roll, 0, "generic").sceneId, "viewed-scene");
});