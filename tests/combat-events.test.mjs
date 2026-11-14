import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}`, lang: "en" },
  user: { isGM: true }
};
globalThis.foundry = { utils: { randomID: () => "generated-id", escapeHTML: (value) => String(value) } };

const events = await import("../scripts/combat-events.js");
const { matchTrigger, collectMatches, simulateTriggers, allowsRepeatedMatches } = await import("../scripts/triggers.js");
const data = await import("../scripts/trigger-data.js");

const combatTrigger = (overrides = {}) => data.normalizeTrigger({
  id: "c1",
  name: "Combat",
  kind: "combat",
  combat: { event: "turn-start" },
  actions: [{ type: "chat-message", template: "hi" }],
  ...overrides
});

const event = (overrides = {}) => ({ combatEvent: "turn-start", round: 1, actorType: "pc", actorId: "a1", sceneId: "s1", visibility: "public", isCombat: true, ...overrides });

test("combat config keeps only what the event uses", () => {
  assert.deepEqual(events.normalizeCombatConfig({ event: "turn-start", round: "3", every: "2", effect: "x" }), { event: "turn-start", round: 3, every: 2, effect: null });
  assert.deepEqual(events.normalizeCombatConfig({ event: "combat-start", round: 3, every: 2, effect: "x" }), { event: "combat-start", round: null, every: null, effect: null });
  assert.deepEqual(events.normalizeCombatConfig({ event: "effect-end", effect: " Bless " }), { event: "effect-end", round: null, every: null, effect: "Bless" });
  assert.equal(events.normalizeCombatConfig({ event: "nonsense" }).event, "turn-start");
  assert.equal(events.normalizeCombatConfig({ event: "round-start", round: "0", every: "1.5" }).round, null);
  assert.equal(events.normalizeCombatConfig({ event: "round-start", round: "0", every: "1.5" }).every, null);
});

test("round rules: a round, every N rounds, or both together", () => {
  const rule = (round, every) => (current) => events.matchesRoundRule({ round, every }, current);
  assert.equal(rule(null, null)(7), true);
  assert.deepEqual([1, 2, 3, 4, 5].filter(rule(3, null)), [3]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].filter(rule(null, 3)), [3, 6]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(rule(2, 3)), [2, 5, 8]);
  assert.equal(events.matchesRoundRule({}, "x"), false);
});

test("a turn change makes the events in the order Foundry runs them", () => {
  const types = (previous, current) => events.deriveTurnChangeEvents(previous, current).map((entry) => `${entry.type}${entry.round ? `@${entry.round}` : ""}`);

  // Begin Combat
  assert.deepEqual(types({ round: 0, turn: null, combatantId: null }, { round: 1, turn: 0, combatantId: "a" }), ["combat-start@1", "round-start@1", "turn-start@1"]);
  // next turn
  assert.deepEqual(types({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" }), ["turn-end@1", "turn-start@1"]);
  // next round
  assert.deepEqual(types({ round: 1, turn: 2, combatantId: "c" }, { round: 2, turn: 0, combatantId: "a" }), ["turn-end@1", "round-start@2", "turn-start@2"]);
  // two rounds at once
  assert.deepEqual(types({ round: 1, turn: 2, combatantId: "c" }, { round: 3, turn: 0, combatantId: "a" }), ["turn-end@1", "round-start@2", "round-start@3", "turn-start@3"]);
  // going back, nothing changed, combat not started
  assert.deepEqual(types({ round: 2, turn: 0, combatantId: "a" }, { round: 1, turn: 2, combatantId: "c" }), []);
  assert.deepEqual(types({ round: 1, turn: 2, combatantId: "c" }, { round: 1, turn: 1, combatantId: "b" }), []);
  assert.deepEqual(types({ round: 1, turn: 1, combatantId: "b" }, { round: 1, turn: 1, combatantId: "b" }), []);
  assert.deepEqual(types({ round: 0 }, { round: 0 }), []);
  // someone joins before the combatant whose turn it is: the turn number shifts, the turn is the same
  assert.deepEqual(types({ round: 1, turn: 1, combatantId: "b" }, { round: 1, turn: 2, combatantId: "b" }), []);
  // a new combatant takes the same turn
  assert.deepEqual(types({ round: 1, turn: 1, combatantId: "b" }, { round: 1, turn: 1, combatantId: "d" }), ["turn-end@1", "turn-start@1"]);
  // the turn end carries the old combatant, the start the new one
  const [end, start] = events.deriveTurnChangeEvents({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" });
  assert.equal(end.combatantId, "a");
  assert.equal(start.combatantId, "b");
});

test("a combat trigger matches its event, the round rule and the filters", () => {
  const trigger = combatTrigger({ combat: { event: "round-start", every: 3 }, filters: { includeScenes: ["s1"] } });
  assert.ok(events.matchCombatTrigger(trigger, event({ combatEvent: "round-start", round: 3 })));
  assert.equal(events.matchCombatTrigger(trigger, event({ combatEvent: "round-start", round: 4 })), null);
  assert.equal(events.matchCombatTrigger(trigger, event({ combatEvent: "turn-start", round: 3 })), null);
  assert.equal(events.matchCombatTrigger(trigger, event({ combatEvent: "round-start", round: 3, sceneId: "other" })), null);
  assert.equal(events.matchCombatTrigger({ ...trigger, enabled: false }, event({ combatEvent: "round-start", round: 3 })), null);

  const npcOnly = combatTrigger({ filters: { actorType: ["npc"] } });
  assert.equal(events.matchCombatTrigger(npcOnly, event({ actorType: "pc" })), null);
  assert.ok(events.matchCombatTrigger(npcOnly, event({ actorType: "npc" })));

  const effect = combatTrigger({ combat: { event: "effect-end", effect: "bless" } });
  assert.ok(events.matchCombatTrigger(effect, event({ combatEvent: "effect-end", effectName: "Bless (Cleric)" })));
  assert.ok(events.matchCombatTrigger(effect, event({ combatEvent: "effect-end", effectName: "Aura", effectStatuses: ["blessed"] })));
  assert.equal(events.matchCombatTrigger(effect, event({ combatEvent: "effect-end", effectName: "Haste" })), null);
});

test("a combat trigger cannot use a chat button, the match runs it after asking", () => {
  const trigger = combatTrigger({ executionMode: "chat-button" });
  assert.equal(trigger.executionMode, "confirm-gm");
  const raw = { ...trigger, executionMode: "chat-button" };
  assert.equal(events.matchCombatTrigger(raw, event()).executionMode, "confirm-gm");
  assert.equal(events.matchCombatTrigger(combatTrigger({ executionMode: "automatic" }), event()).executionMode, "automatic");
});

test("combat matches follow the priority and stop lower triggers like roll matches", () => {
  const high = combatTrigger({ id: "high", priority: 300, stopLowerPriority: true });
  const low = combatTrigger({ id: "low", priority: 100 });
  const roll = data.normalizeTrigger({ id: "roll", name: "Roll", match: { type: "die-max", faces: 20 } });
  assert.deepEqual(events.collectCombatMatches([low, roll, high], event()).map((match) => match.trigger.id), ["high"]);
  assert.deepEqual(events.collectCombatMatches([low, roll, { ...high, stopLowerPriority: false }], event()).map((match) => match.trigger.id), ["high", "low"]);
});

test("combat triggers never match a roll, and the test bench leaves them out", () => {
  const trigger = combatTrigger();
  const rollEvent = { diceResults: [{ faces: 20, value: 20 }], total: 20, rollType: "attack", visibility: "public", user: { isGM: false } };
  assert.equal(matchTrigger(trigger, rollEvent), null);
  assert.deepEqual(collectMatches([trigger], rollEvent), []);
  assert.deepEqual(simulateTriggers([trigger], rollEvent), []);
});

test("an event counts once within the dedupe window", () => {
  const seen = new Map();
  const key = events.getCombatEventKey("combat", { type: "turn-start", round: 2, turn: 1, combatantId: "b" });
  assert.equal(events.claimCombatEvent(seen, key, 1000), true);
  assert.equal(events.claimCombatEvent(seen, key, 1500), false);
  assert.equal(events.claimCombatEvent(seen, key, 1000 + events.COMBAT_EVENT_DEDUPE_MS + 1), true);
  assert.notEqual(key, events.getCombatEventKey("combat", { type: "turn-start", round: 3, turn: 1, combatantId: "b" }));
  assert.notEqual(key, events.getCombatEventKey("combat", { type: "effect-end", round: 2, turn: 1, combatantId: "b", effectId: "e" }));
});

test("expired effects: v14 flag and v13 remaining duration", () => {
  assert.equal(events.isEffectExpired({ duration: { expired: true } }), true);
  assert.equal(events.isEffectExpired({ duration: { expired: false } }), false);
  assert.equal(events.isEffectExpired({ isTemporary: true, duration: { remaining: 0 } }), true);
  assert.equal(events.isEffectExpired({ isTemporary: true, duration: { remaining: 2 } }), false);
  assert.equal(events.isEffectExpired({ isTemporary: false, duration: { remaining: 0 } }), false);
  assert.equal(events.isEffectExpired({ isTemporary: true, duration: { remaining: null } }), false);
  assert.equal(events.isEffectExpired({}), false);
});

test("Foundry 13 effects in rounds and turns are counted from the combat", () => {
  const combat = (round, turn, turns = 4) => ({ round, turn, turns: new Array(turns) });
  const effect = (duration) => ({ isTemporary: true, duration });
  // one round, started in round 1 turn 0
  const oneRound = effect({ rounds: 1, startRound: 1, startTurn: 0 });
  assert.equal(events.getRoundsRemaining(oneRound.duration, combat(1, 0)), 1);
  assert.equal(events.getRoundsRemaining(oneRound.duration, combat(1, 3)), 0.25);
  assert.equal(events.getRoundsRemaining(oneRound.duration, combat(2, 0)), 0);
  assert.equal(events.isEffectExpired(oneRound, combat(1, 3)), false);
  assert.equal(events.isEffectExpired(oneRound, combat(2, 0)), true);
  // started halfway through round 1, lasts one round: ends at the same turn of round 2
  const half = effect({ rounds: 1, startRound: 1, startTurn: 2 });
  assert.equal(events.isEffectExpired(half, combat(2, 1)), false);
  assert.equal(events.isEffectExpired(half, combat(2, 2)), true);
  // turns
  const turns = effect({ turns: 2, startRound: 1, startTurn: 0 });
  assert.equal(events.isEffectExpired(turns, combat(1, 1)), false);
  assert.equal(events.isEffectExpired(turns, combat(1, 2)), true);
  // other durations and missing data
  assert.equal(events.getRoundsRemaining({ seconds: 60 }, combat(1, 0)), null);
  assert.equal(events.getRoundsRemaining({ rounds: 1 }, null), null);
  assert.equal(events.isEffectExpired({ isTemporary: false, duration: { rounds: 1, startRound: 1 } }, combat(5, 0)), false);
  assert.equal(events.isEffectExpired(effect({ seconds: 60 }), combat(5, 0)), false);
});

test("a stored combat trigger normalizes to one shape an older version cannot match", () => {
  const trigger = combatTrigger({ combat: { event: "turn-end", round: 2 }, extraMatches: [{ type: "die-value" }], filters: { rollType: ["attack"], playerOnly: true, actorType: ["pc"] } });
  assert.equal(trigger.kind, "combat");
  assert.deepEqual(trigger.combat, { event: "turn-end", round: 2, every: null, effect: null });
  assert.equal(trigger.match.type, "combat-event");
  assert.deepEqual(trigger.extraMatches, []);
  assert.deepEqual(trigger.filters.rollType, []);
  assert.equal(trigger.filters.playerOnly, false);
  assert.deepEqual(trigger.filters.actorType, ["pc"]);
  assert.deepEqual(data.normalizeTrigger(trigger), trigger);
  // The older matcher answers false for an unknown match type
  assert.equal(matchTrigger({ ...trigger, kind: undefined, combat: undefined }, { diceResults: [], total: 20, visibility: "public", user: { isGM: true } }), null);
  // Events without actors drop the actor filters
  assert.deepEqual(combatTrigger({ combat: { event: "round-start" }, filters: { actorType: ["pc"], includeActors: ["a"] } }).filters.actorType, []);
});

test("a roll trigger keeps its shape: no kind, no combat data", () => {
  const trigger = data.normalizeTrigger({ id: "r", name: "R", match: { type: "die-max", faces: 20 }, filters: { rollType: ["attack"] } });
  assert.equal("kind" in trigger, false);
  assert.equal("combat" in trigger, false);
  assert.equal(data.presentTrigger(trigger).isCombat, false);
  assert.equal(data.presentTrigger(combatTrigger()).isCombat, true);
  assert.match(data.presentTrigger(combatTrigger({ combat: { event: "round-start", every: 3 } })).matchLabel, /CombatEvent\.RoundStart \| SRT\.Combat\.EveryRounds/);
});

test("once per message: oncePerMessage and allowMultipleMatches become one setting", () => {
  assert.equal(data.normalizeTrigger({ id: "a", name: "A" }).oncePerMessage, true);
  assert.equal(data.normalizeTrigger({ id: "a", name: "A", oncePerMessage: false }).oncePerMessage, false);
  assert.equal(data.normalizeTrigger({ id: "a", name: "A", allowMultipleMatches: true }).oncePerMessage, false);
  assert.equal(data.normalizeTrigger({ id: "a", name: "A", oncePerMessage: true, allowMultipleMatches: true }).oncePerMessage, false);
  assert.equal(data.normalizeTrigger({ id: "a", name: "A", oncePerMessage: true, allowMultipleMatches: false }).oncePerMessage, true);
  assert.equal("allowMultipleMatches" in data.normalizeTrigger({ id: "a", name: "A", allowMultipleMatches: true }), false);
  // stored triggers of older versions keep working without a migration
  assert.equal(allowsRepeatedMatches({ oncePerMessage: true, allowMultipleMatches: true }), true);
  assert.equal(allowsRepeatedMatches({ oncePerMessage: false, allowMultipleMatches: false }), true);
  assert.equal(allowsRepeatedMatches({ oncePerMessage: true, allowMultipleMatches: false }), false);
  assert.equal(allowsRepeatedMatches({}), false);
});
