import assert from "node:assert/strict";
import test from "node:test";

const created = [];
const me = { id: "gm-1", isGM: true };

globalThis.game = {
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}`, lang: "en" },
  user: me,
  users: { activeGM: me, find: () => null },
  system: { id: "dnd5e", version: "5.3.3" },
  combats: { contents: [] }
};
globalThis.foundry = { utils: { randomID: () => "generated-id", escapeHTML: (value) => String(value) } };
globalThis.ChatMessage = {
  getWhisperRecipients: () => [{ id: "gm-1" }],
  async create(message) {
    created.push(message);
    return message;
  }
};

const { CombatTriggerService, buildCombatEvent } = await import("../scripts/combat-service.js");
const { normalizeTrigger } = await import("../scripts/trigger-data.js");

function makeCombat() {
  const effect = { id: "fx1", uuid: "Actor.a1.ActiveEffect.fx1", name: "Bless", statuses: new Set(["blessed"]), duration: { expired: false } };
  const actors = {
    a1: { id: "a1", name: "Hero", type: "character", effects: { contents: [effect] }, testUserPermission: () => false, documentName: "Actor" },
    a2: { id: "a2", name: "Goblin", type: "npc", effects: { contents: [] }, testUserPermission: () => false, documentName: "Actor" }
  };
  const combatants = [
    { id: "c1", actorId: "a1", name: "Hero", actor: actors.a1, token: { id: "t1" } },
    { id: "c2", actorId: "a2", name: "Goblin", actor: actors.a2, token: { id: "t2" } }
  ];
  const combat = {
    id: "combat-1",
    name: "Fight",
    round: 1,
    turn: 0,
    started: true,
    active: true,
    scene: { id: "scene-1" },
    combatants: { contents: combatants, get: (id) => combatants.find((entry) => entry.id === id) }
  };
  game.combats.contents = [combat];
  return { combat, effect, actors };
}

function makeService(triggers, settings = {}) {
  return new CombatTriggerService({
    settings: { enabled: true, defaultExecutionMode: "automatic", respectPrivateRolls: true, getTriggers: () => triggers.map((trigger) => normalizeTrigger(trigger)), ...settings }
  });
}

const trigger = (id, combat, extra = {}) => ({
  id, name: id, kind: "combat", combat, executionMode: "automatic", actions: [{ type: "chat-message", template: `${id}: {{actor.name}} / round {{combat.round}} / {{combat.event}} / {{effect.name}}` }], ...extra
});

test.beforeEach(() => {
  created.length = 0;
  me.isGM = true;
  game.users.activeGM = me;
});

test("the event carries the combat, the combatant and the fields filters read", () => {
  const { combat } = makeCombat();
  const event = buildCombatEvent(combat, { type: "turn-start", round: 2, turn: 1, combatantId: "c2" });
  assert.equal(event.kind, "combat");
  assert.equal(event.combatEvent, "turn-start");
  assert.equal(event.actorName, "Goblin");
  assert.equal(event.actorType, "npc");
  assert.equal(event.sceneId, "scene-1");
  assert.equal(event.round, 2);
  assert.equal(event.isCombat, true);
  assert.equal(event.visibility, "public");
  assert.deepEqual(event.diceResults, []);
  assert.match(event.description, /Combat\.Description\.TurnStart/);

  const roundEvent = buildCombatEvent(combat, { type: "round-start", round: 3 });
  assert.equal(roundEvent.actor, null);
  assert.equal(roundEvent.actorType, "none");
});

test("a turn change runs the matching combat triggers once, with the combat in the template", async () => {
  const { combat } = makeCombat();
  const service = makeService([trigger("start", { event: "turn-start" }), trigger("end", { event: "turn-end" }), trigger("round", { event: "round-start" })]);
  await service.handleTurnChange(combat, { round: 1, turn: 0, combatantId: "c1" }, { round: 1, turn: 1, combatantId: "c2" });
  assert.deepEqual(created.map((message) => message.content), ["end: Hero / round 1 / turn-end / ", "start: Goblin / round 1 / turn-start / "]);

  // the same turn change again within a moment is the same event
  await service.handleTurnChange(combat, { round: 1, turn: 0, combatantId: "c1" }, { round: 1, turn: 1, combatantId: "c2" });
  assert.equal(created.length, 2);
});

test("a new round and the start of a combat bring their events", async () => {
  const { combat } = makeCombat();
  combat.round = 2;
  combat.turn = 0;
  const service = makeService([trigger("round", { event: "round-start", every: 2 }), trigger("begin", { event: "combat-start" })]);
  await service.handleTurnChange(combat, { round: 1, turn: 1, combatantId: "c2" }, { round: 2, turn: 0, combatantId: "c1" });
  assert.deepEqual(created.map((message) => message.content), ["round:  / round 2 / round-start / "]);

  created.length = 0;
  await service.handleTurnChange(combat, { round: 0, turn: null, combatantId: null }, { round: 1, turn: 0, combatantId: "c1" });
  assert.deepEqual(created.map((message) => message.content.split(":")[0]), ["begin"]);
});

test("only the active GM runs combat triggers, and only while the module is on", async () => {
  const { combat } = makeCombat();
  const previous = { round: 1, turn: 0, combatantId: "c1" };
  const current = { round: 1, turn: 1, combatantId: "c2" };

  game.users.activeGM = { id: "other-gm" };
  await makeService([trigger("start", { event: "turn-start" })]).handleTurnChange(combat, previous, current);
  assert.equal(created.length, 0);

  game.users.activeGM = me;
  await makeService([trigger("start", { event: "turn-start" })], { enabled: false }).handleTurnChange(combat, previous, current);
  assert.equal(created.length, 0);

  me.isGM = false;
  await makeService([trigger("start", { event: "turn-start" })]).handleTurnChange(combat, previous, current);
  assert.equal(created.length, 0);

  me.isGM = true;
  await makeService([{ ...trigger("start", { event: "turn-start" }), enabled: false }]).handleTurnChange(combat, previous, current);
  assert.equal(created.length, 0);
  await makeService([trigger("start", { event: "turn-start" }, { kind: undefined })]).handleTurnChange(combat, previous, current);
  assert.equal(created.length, 0);
});

test("a finished combat runs the combat end triggers, one that never started does not", async () => {
  const { combat } = makeCombat();
  const service = makeService([trigger("done", { event: "combat-end" })]);
  await service.handleCombatDeleted({ ...combat, round: 0 });
  assert.equal(created.length, 0);
  await service.handleCombatDeleted(combat);
  assert.equal(created.length, 1);
  assert.match(created[0].content, /round 1/);
});

test("an effect that runs out counts once, whether it is only expired or deleted too", async () => {
  const { combat, effect, actors } = makeCombat();
  const service = makeService([trigger("ends", { event: "effect-end", effect: "bless" }), trigger("other", { event: "effect-end", effect: "haste" })]);

  await service.handleTurnChange(combat, { round: 1, turn: 0, combatantId: "c1" }, { round: 1, turn: 1, combatantId: "c2" });
  assert.equal(created.length, 0);

  effect.duration.expired = true;
  combat.round = 2;
  await service.handleTurnChange(combat, { round: 1, turn: 1, combatantId: "c2" }, { round: 2, turn: 0, combatantId: "c1" });
  assert.deepEqual(created.map((message) => message.content), ["ends: Hero / round 2 / effect-end / Bless"]);

  // the effect is deleted afterwards: already reported
  await service.handleEffectDeleted({ ...effect, parent: actors.a1 });
  assert.equal(created.length, 1);
  // a later turn change does not report it again
  await service.handleTurnChange(combat, { round: 2, turn: 0, combatantId: "c1" }, { round: 2, turn: 1, combatantId: "c2" });
  assert.equal(created.length, 1);
});

test("an effect that is removed by hand during a combat fires its trigger", async () => {
  const { effect, actors } = makeCombat();
  const service = makeService([trigger("ends", { event: "effect-end" })]);
  await service.handleEffectDeleted({ ...effect, parent: actors.a1 });
  assert.deepEqual(created.map((message) => message.content), ["ends: Hero / round 1 / effect-end / Bless"]);

  // an effect of an actor who is not in a running combat, or of an item, does nothing
  created.length = 0;
  await service.handleEffectDeleted({ ...effect, id: "fx9", uuid: "x9", parent: { id: "nobody", documentName: "Actor" } });
  await service.handleEffectDeleted({ ...effect, id: "fx8", uuid: "x8", parent: { id: "a1", documentName: "Item" } });
  assert.equal(created.length, 0);
});

test("a trigger that asks the GM is not run without an answer, a broken action does not stop the others", async () => {
  const { combat } = makeCombat();
  const broken = trigger("broken", { event: "turn-start" }, { priority: 300, actions: [{ type: "gm-note", template: "{{actor.name}}" }] });
  const good = trigger("good", { event: "turn-start" }, { priority: 100 });
  const service = makeService([broken, good]);
  const original = ChatMessage.create;
  let calls = 0;
  ChatMessage.create = async (message) => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return original(message);
  };
  const warn = console.error;
  console.error = () => {};
  try {
    await service.handleTurnChange(combat, { round: 1, turn: 0, combatantId: "c1" }, { round: 1, turn: 1, combatantId: "c2" });
  } finally {
    ChatMessage.create = original;
    console.error = warn;
  }
  assert.equal(created.length, 1);
  assert.match(created[0].content, /^good:/);
});
