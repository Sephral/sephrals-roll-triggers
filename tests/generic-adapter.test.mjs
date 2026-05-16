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