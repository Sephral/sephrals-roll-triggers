import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMatches,
  explainTrigger,
  explainTriggerConditions,
  FILTER_KEYS,
  getBlockingFilters,
  matchTrigger,
  orderTriggersByPriority,
  simulateTriggers
} from "../scripts/triggers.js";

globalThis.game = { user: { isGM: true } };

function createEvent(overrides = {}) {
  return {
    diceResults: [{ faces: 20, value: 20 }],
    total: 25,
    rollType: "attack",
    actorType: "pc",
    actorId: "actor-1",
    itemId: null,
    visibility: "public",
    isCombat: true,
    sceneId: "scene-1",
    userId: "u1",
    user: { isGM: false },
    flags: {},
    ...overrides
  };
}

function createTrigger(overrides = {}) {
  return {
    id: "nat20",
    name: "Natural 20",
    enabled: true,
    priority: 100,
    executionMode: "automatic",
    filters: {},
    match: { type: "die-max", faces: 20, minCount: 1 },
    actions: [{ type: "chat-message", template: "Crit" }],
    ...overrides
  };
}

test("getBlockingFilters names every filter that blocks the roll", () => {
  const trigger = createTrigger({
    filters: { rollType: ["damage"], combatState: "out-of-combat", includeActors: ["actor-2"], gmOnly: true }
  });

  assert.deepEqual(getBlockingFilters(trigger, createEvent()), ["gmOnly", "rollType", "combatState", "actor"]);
  assert.deepEqual(getBlockingFilters(createTrigger(), createEvent()), []);
  assert.deepEqual(getBlockingFilters(createTrigger({ filters: { forcePublic: true } }), createEvent({ visibility: "blind" }), { respectPrivateRolls: true }), ["privateRoll"]);
  assert.equal(FILTER_KEYS.includes("diceCount"), true);
});

test("the filter explanation agrees with matchTrigger for each single filter", () => {
  const event = createEvent({ itemId: "item-1" });
  const cases = [
    { playerOnly: true },
    { users: ["u2"] },
    { actorType: ["npc"] },
    { rollType: ["save"] },
    { visibility: ["blind"] },
    { combatState: "out-of-combat" },
    { includeScenes: ["scene-2"] },
    { includeActors: ["actor-2"] },
    { includeItems: ["item-2"] },
    { exactDiceCountByFaces: { 20: 2 } },
    { rollType: ["attack"], includeItems: ["item-1"] }
  ];

  for (const filters of cases) {
    const trigger = createTrigger({ filters });
    const blocked = getBlockingFilters(trigger, event).length > 0;
    assert.equal(blocked, matchTrigger(trigger, event) === null, JSON.stringify(filters));
  }
});

test("explainTriggerConditions reports each condition and keeps errors of custom conditions", () => {
  const trigger = createTrigger({
    extraMatches: [
      { type: "total-above", threshold: 30 },
      { type: "custom-js", expression: "event.missing.value > 1" }
    ]
  });

  const conditions = explainTriggerConditions(trigger, createEvent());
  assert.deepEqual(conditions.map((entry) => entry.passed), [true, false, false]);
  assert.equal(conditions[0].error, null);
  assert.match(conditions[2].error, /reading 'value'/);
});

test("explainTrigger takes the verdict from matchTrigger and explains it", () => {
  const event = createEvent();
  const matching = explainTrigger(createTrigger(), event, { defaultExecutionMode: "confirm-gm" });
  assert.equal(matching.matched, true);
  assert.equal(matching.match.executionMode, "automatic");
  assert.deepEqual(matching.blockedBy, []);

  const blocked = explainTrigger(createTrigger({ filters: { rollType: ["damage"] } }), event);
  assert.equal(blocked.matched, false);
  assert.equal(blocked.match, null);
  assert.deepEqual(blocked.blockedBy, ["rollType"]);
  assert.deepEqual(blocked.conditions.map((entry) => entry.passed), [true]);

  const off = explainTrigger(createTrigger({ enabled: false }), event);
  assert.equal(off.enabled, false);
  assert.equal(off.matched, false);

  // A custom condition that throws makes matchTrigger throw. The explanation keeps the message instead.
  const broken = explainTrigger(createTrigger({ match: { type: "custom-js", expression: "event.nothing.here" } }), event);
  assert.equal(broken.matched, false);
  assert.match(broken.error, /reading 'here'/);
});

test("simulateTriggers orders by priority and stops where collectMatches stops", () => {
  const triggers = [
    createTrigger({ id: "low", name: "Low", priority: 10 }),
    createTrigger({ id: "high", name: "High", priority: 300, stopLowerPriority: true }),
    createTrigger({ id: "miss", name: "Miss", priority: 500, match: { type: "die-min", faces: 20 } }),
    createTrigger({ id: "off", name: "Off", priority: 200, enabled: false })
  ];
  const event = createEvent();

  const reports = simulateTriggers(triggers, event);
  assert.deepEqual(reports.map((report) => report.trigger.id), ["miss", "high", "off", "low"]);
  assert.deepEqual(reports.map((report) => report.matched), [false, true, false, false]);
  assert.equal(reports[2].stoppedBy.id, "high");
  assert.equal(reports[3].stoppedBy.id, "high");
  assert.equal(reports[0].stoppedBy, null);

  // The matches of the simulation are exactly the matches of the chat processing.
  const simulated = reports.filter((report) => report.matched).map((report) => report.match.trigger.id);
  assert.deepEqual(simulated, collectMatches(triggers, event).map((match) => match.trigger.id));
  assert.deepEqual(orderTriggersByPriority(triggers).map((trigger) => trigger.id), ["miss", "high", "off", "low"]);
});

test("a disabled trigger with stop lower priority never stops other triggers", () => {
  const triggers = [
    createTrigger({ id: "off", priority: 300, enabled: false, stopLowerPriority: true }),
    createTrigger({ id: "on", priority: 100 })
  ];

  const reports = simulateTriggers(triggers, createEvent());
  assert.deepEqual(reports.map((report) => [report.trigger.id, report.matched, report.stoppedBy]), [["off", false, null], ["on", true, null]]);
});
