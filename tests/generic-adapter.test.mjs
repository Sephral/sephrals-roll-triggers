import assert from "node:assert/strict";
import test from "node:test";

import { GenericRollAdapter } from "../scripts/adapters/generic-adapter.js";

class DiceTerm {
  constructor(formula, total, faces, results) {
    this.formula = formula;
    this.total = total;
    this.faces = faces;
    this.number = results.length;
    this.results = results.map((result) => ({ result, active: true, discarded: false }));
  }
}

test("generic adapter extracts roll events from message rolls", () => {
  globalThis.game = {
    system: { id: "dnd5e", version: "5.2.5" },
    combat: { started: false },
    user: { id: "u1", isGM: true, name: "GM" },
    users: { get(id) { return id === "u1" ? globalThis.game.user : null; } }
  };
  globalThis.canvas = { scene: { id: "scene-1" } };
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const adapter = new GenericRollAdapter();
  const message = {
    id: "m1",
    user: "u1",
    speaker: {},
    flags: {},
    rolls: [{
      formula: "1d20 + 5",
      total: 25,
      terms: [new DiceTerm("1d20", 20, 20, [20])]
    }],
    getAssociatedActor() {
      return { id: "a1", name: "Hero", type: "character" };
    }
  };

  assert.equal(adapter.supportsMessage(message), true);
  const events = adapter.extractRollEvents(message);
  assert.equal(events.length, 1);
  assert.equal(events[0].systemId, "dnd5e");
  assert.equal(events[0].actorName, "Hero");
  assert.equal(events[0].formula, "1d20 + 5");
  assert.deepEqual(events[0].diceResults, [{ faces: 20, value: 20 }]);
});
test("generic adapter reads the rolls Ready Set Roll keeps in its flags and names the card's item", () => {
  globalThis.game = {
    system: { id: "dnd5e", version: "5.3.3" },
    combat: { started: true },
    user: { id: "u1", isGM: true, name: "GM" },
    users: { get(id) { return id === "u1" ? globalThis.game.user : null; } }
  };
  globalThis.canvas = { scene: { id: "scene-1" } };
  globalThis.foundry = { dice: { terms: { DiceTerm } } };

  const adapter = new GenericRollAdapter();
  const sword = { id: "sword-1", name: "Longsword" };
  const message = {
    id: "rsr-card",
    speaker: {},
    rolls: [],
    flags: {
      dnd5e: { item: { type: "weapon", id: "sword-1", uuid: "Actor.a1.Item.sword-1" } },
      rsr5e: {
        processed: true,
        rolls: [
          { formula: "1d20 + 5", total: 17, options: { rollType: "attack" }, terms: [new DiceTerm("1d20", 12, 20, [12])] },
          { formula: "1d8 + 3", total: 10, options: { rollType: "damage", type: "slashing" }, terms: [new DiceTerm("1d8", 7, 8, [7])] }
        ]
      }
    },
    getAssociatedActor() {
      return { id: "a1", name: "Syr Jonabread", type: "character", items: { get: (id) => (id === sword.id ? sword : null) } };
    }
  };

  assert.equal(adapter.supportsMessage(message), true);
  assert.equal(adapter.supportsMessage({ ...message, flags: { dnd5e: message.flags.dnd5e } }), false);
  const events = adapter.extractRollEvents(message);
  assert.deepEqual(events.map((event) => [event.rollIndex, event.rollType, event.diceResults[0]?.value]), [[0, "attack", 12], [1, "damage", 7]]);
  assert.equal(events[1].itemId, "sword-1");
  assert.equal(events[1].itemName, "Longsword");
  assert.equal(events[1].rawRolls.length, 2);

  // Ready Set Roll adds the rolls by an update of its flags.
  assert.equal(adapter.rollsChanged({ flags: { rsr5e: { rolls: [] } } }), true);
  assert.equal(adapter.rollsChanged({ rolls: [] }), true);
  assert.equal(adapter.rollsChanged({ flags: { rsr5e: { processed: true } } }), false);
  assert.equal(adapter.rollsChanged({ content: "<p></p>" }), false);
});
