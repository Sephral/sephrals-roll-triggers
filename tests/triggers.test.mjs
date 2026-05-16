import assert from "node:assert/strict";
import test from "node:test";

import { collectMatches, evaluateMatchCondition, matchTrigger } from "../scripts/triggers.js";

function createEvent(overrides = {}) {
  return {
    diceResults: [{ faces: 20, value: 20 }],
    total: 25,
    rollType: "attack",
    actorType: "pc",
    visibility: "public",
    isCombat: true,
    sceneId: "scene-1",
    userId: "u1",
    user: { isGM: false },
    flags: {},
    ...overrides
  };
}

test("match conditions support max and repeated values", () => {
  assert.equal(evaluateMatchCondition({ type: "die-max", faces: 20, minCount: 1 }, createEvent()), true);
  assert.equal(evaluateMatchCondition({ type: "die-max", faces: 2, minCount: 1 }, createEvent({ diceResults: [{ faces: 2, value: 2 }], total: 2 })), true);
  assert.equal(
    evaluateMatchCondition(
      { type: "at-least-n-value", faces: 20, value: 1, minCount: 2 },
      createEvent({ diceResults: [{ faces: 20, value: 1 }, { faces: 20, value: 1 }, { faces: 20, value: 14 }] })
    ),
    true
  );
});

test("collectMatches respects priority order and stopLowerPriority", () => {
  const triggers = [
    {
      id: "low",
      enabled: true,
      priority: 100,
      executionMode: "automatic",
      filters: { rollType: ["attack"] },
      match: { type: "die-max", faces: 20, minCount: 1 },
      actions: []
    },
    {
      id: "high",
      enabled: true,
      priority: 200,
      stopLowerPriority: true,
      executionMode: "automatic",
      filters: { rollType: ["attack"] },
      match: { type: "die-max", faces: 20, minCount: 1 },
      actions: []
    }
  ];

  const matches = collectMatches(triggers, createEvent());
  assert.deepEqual(matches.map((match) => match.trigger.id), ["high"]);
});

test("matchTrigger respects advanced filters and default execution mode", () => {
  const trigger = {
    id: "filtered",
    enabled: true,
    filters: {
      users: ["u1"],
      actorType: ["pc"],
      rollType: ["attack"],
      visibility: ["public"],
      combatState: "in-combat",
      includeScenes: ["scene-1"],
      includeActors: ["actor-1"],
      includeItems: ["item-1"],
      exactDiceCountByFaces: { 20: 2 }
    },
    match: { type: "die-max", faces: 20, minCount: 1 },
    actions: [{ type: "chat-message", template: "Hit" }]
  };

  const event = createEvent({
    actorId: "actor-1",
    itemId: "item-1",
    diceResults: [{ faces: 20, value: 20 }, { faces: 20, value: 4 }]
  });

  const match = matchTrigger(trigger, event, { defaultExecutionMode: "automatic" });
  assert.equal(match.executionMode, "automatic");
  assert.equal(match.trigger.id, "filtered");
  assert.equal(matchTrigger(trigger, createEvent({ actorId: "actor-2", itemId: "item-1", diceResults: event.diceResults })), null);
  assert.equal(matchTrigger(trigger, createEvent({ actorId: "actor-1", itemId: "item-2", diceResults: event.diceResults })), null);
});

test("matchTrigger respects player-gm filters and private-roll override blocking", () => {
  const trigger = {
    id: "private",
    enabled: true,
    filters: {
      playerOnly: true,
      forcePublic: true
    },
    match: { type: "die-max", faces: 20, minCount: 1 },
    actions: []
  };

  assert.equal(matchTrigger(trigger, createEvent({ visibility: "blind" }), { respectPrivateRolls: true }), null);
  assert.equal(matchTrigger(trigger, createEvent({ user: { isGM: true } })), null);
  assert.equal(matchTrigger({ ...trigger, filters: { gmOnly: true } }, createEvent({ user: { isGM: false } })), null);
  assert.ok(matchTrigger({ ...trigger, filters: { playerOnly: true, visibilityOverride: true, forcePublic: true } }, createEvent({ visibility: "blind" }), { respectPrivateRolls: true }));
});

test("evaluateMatchCondition covers thresholds, system flags, and custom js", () => {
  globalThis.foundry = {
    utils: {
      getProperty(object, path) {
        return path.split(".").reduce((current, part) => current?.[part], object);
      }
    }
  };

  const event = createEvent({
    diceResults: [{ faces: 6, value: 2 }, { faces: 6, value: 5 }, { faces: 6, value: 5 }],
    total: 18,
    successDegree: "critical-success",
    flags: { system: { critical: true } },
    user: { isGM: true }
  });

  assert.equal(evaluateMatchCondition({ type: "die-result-above", faces: 6, threshold: 4 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "die-result-below", faces: 6, threshold: 3 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "total-above", threshold: 17 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "total-below", threshold: 19 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "success-degree", degree: "critical-success" }, event), true);
  assert.equal(evaluateMatchCondition({ type: "system-flag", path: "system.critical" }, event), true);
  assert.equal(evaluateMatchCondition({ type: "custom-js", expression: 'event.total === 18 && event.rollType === "attack"' }, event), true);
  assert.equal(evaluateMatchCondition({ type: "custom-js", expression: 'event.total === 17' }, { ...event, user: { isGM: false } }), false);
  assert.equal(evaluateMatchCondition({ type: "unknown" }, event), false);
});