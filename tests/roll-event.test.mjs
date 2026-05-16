import assert from "node:assert/strict";
import test from "node:test";

import { createRollEvent, getVisibleDiceResults } from "../scripts/roll-event.js";

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

  const roll = {
    formula: "2d20kh + 7",
    total: 27,
    options: { degreeOfSuccess: "success", rollType: "check" },
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
        context: { outcome: "critical-success" },
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