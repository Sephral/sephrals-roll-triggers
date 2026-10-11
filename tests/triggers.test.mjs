import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMatches,
  evaluateMatchCondition,
  evaluateTriggerConditions,
  getTriggerConditions,
  matchTrigger
} from "../scripts/triggers.js";

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
  globalThis.game = { user: { isGM: true } };

  const event = createEvent({
    diceResults: [{ faces: 6, value: 2 }, { faces: 6, value: 5 }, { faces: 6, value: 5 }],
    total: 18,
    successDegree: "critical-success",
    flags: { system: { critical: true } },
    user: { isGM: false }
  });

  assert.equal(evaluateMatchCondition({ type: "die-result-above", faces: 6, threshold: 4 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "die-result-below", faces: 6, threshold: 3 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "total-above", threshold: 17 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "total-below", threshold: 19 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "success-degree", degree: "critical-success" }, event), true);
  assert.equal(evaluateMatchCondition({ type: "system-flag", path: "system.critical" }, event), true);
  assert.equal(evaluateMatchCondition({ type: "custom-js", expression: 'event.total === 18 && event.rollType === "attack"' }, event), true);
  assert.equal(
    evaluateMatchCondition(
      { type: "custom-js", expression: 'event.rollType === "skill" && event.total >= 11 && event.total <= 99 && event.total % 11 === 0' },
      createEvent({ rollType: "skill", total: 22, user: { isGM: false } })
    ),
    true
  );
  globalThis.game = { user: { isGM: false } };
  assert.equal(evaluateMatchCondition({ type: "custom-js", expression: 'event.total === 17' }, event), false);
  assert.equal(evaluateMatchCondition({ type: "unknown" }, event), false);
});
test("empty die faces means any die instead of dice with zero faces", () => {
  const event = createEvent({ diceResults: [{ faces: 8, value: 1 }, { faces: 6, value: 2 }] });

  assert.equal(evaluateMatchCondition({ type: "die-value", faces: null, value: 1, minCount: 1 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "die-value", faces: "", value: 2, minCount: 1 }, event), true);
  assert.equal(evaluateMatchCondition({ type: "die-value", faces: 6, value: 1, minCount: 1 }, event), false);
  assert.equal(evaluateMatchCondition({ type: "die-min", faces: null, minCount: 1 }, event), true);
});

test("getTriggerConditions returns the primary match followed by valid extra conditions", () => {
  const primary = { type: "die-value", value: 1 };
  const extra = { type: "die-value", value: 2 };

  assert.deepEqual(getTriggerConditions({ match: primary }), [primary]);
  assert.deepEqual(getTriggerConditions({ match: primary, extraMatches: [extra, null, "x"] }), [primary, extra]);
  assert.deepEqual(getTriggerConditions({ match: primary, extraMatches: "invalid" }), [primary]);
  assert.deepEqual(getTriggerConditions({}), [{}]);
});

test("matchTrigger requires the primary match and every extra condition for the same roll", () => {
  const trigger = {
    id: "swade-one-two",
    enabled: true,
    executionMode: "automatic",
    filters: {},
    match: { type: "die-value", faces: null, value: 1, minCount: 1 },
    extraMatches: [{ type: "die-value", faces: null, value: 2, minCount: 1 }],
    actions: []
  };

  const hit = createEvent({ diceResults: [{ faces: 8, value: 1 }, { faces: 6, value: 2 }], total: 3 });
  const onlyPrimary = createEvent({ diceResults: [{ faces: 8, value: 1 }, { faces: 6, value: 5 }], total: 6 });
  const onlyExtra = createEvent({ diceResults: [{ faces: 8, value: 4 }, { faces: 6, value: 2 }], total: 6 });

  assert.equal(matchTrigger(trigger, hit)?.trigger.id, "swade-one-two");
  assert.equal(matchTrigger(trigger, onlyPrimary), null);
  assert.equal(matchTrigger(trigger, onlyExtra), null);
  assert.equal(evaluateTriggerConditions(trigger, hit), true);
  assert.equal(evaluateTriggerConditions(trigger, onlyPrimary), false);

  const threeWay = {
    ...trigger,
    extraMatches: [...trigger.extraMatches, { type: "total-above", threshold: 2 }]
  };
  assert.ok(matchTrigger(threeWay, hit));
  assert.equal(matchTrigger({ ...threeWay, extraMatches: [...trigger.extraMatches, { type: "total-above", threshold: 3 }] }, hit), null);
});

test("matchTrigger keeps the primary only behavior without extra conditions", () => {
  const base = {
    id: "nat20",
    enabled: true,
    filters: {},
    match: { type: "die-max", faces: 20, minCount: 1 },
    actions: []
  };

  for (const trigger of [base, { ...base, extraMatches: [] }, { ...base, extraMatches: null }, { ...base, extraMatches: [null] }]) {
    assert.ok(matchTrigger(trigger, createEvent()));
    assert.equal(matchTrigger(trigger, createEvent({ diceResults: [{ faces: 20, value: 7 }] })), null);
  }
});

test("custom js extra conditions keep the GM only evaluation rule", () => {
  const trigger = {
    id: "custom-and",
    enabled: true,
    filters: {},
    match: { type: "die-max", faces: 20, minCount: 1 },
    extraMatches: [{ type: "custom-js", expression: "event.total === 25" }],
    actions: []
  };

  globalThis.game = { user: { isGM: true } };
  assert.ok(matchTrigger(trigger, createEvent()));
  assert.equal(matchTrigger(trigger, createEvent({ total: 24 })), null);

  globalThis.game = { user: { isGM: false } };
  assert.equal(matchTrigger(trigger, createEvent()), null);
});
