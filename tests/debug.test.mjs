import assert from "node:assert/strict";
import test from "node:test";

const users = new Map([
  ["gm-1", { id: "gm-1", isGM: true, active: true }],
  ["gm-2", { id: "gm-2", isGM: true, active: true }]
]);

globalThis.game = {
  user: { id: "gm-1", isGM: true, name: "GM" },
  users: {
    activeGM: users.get("gm-1"),
    get(id) {
      return users.get(id) ?? null;
    }
  },
  i18n: {
    localize(key) {
      return key;
    },
    format(key) {
      return key;
    }
  },
  messages: { get: () => null, contents: [] }
};

globalThis.ChatMessage = {
  created: [],
  getWhisperRecipients() {
    return [{ id: "gm-1" }];
  },
  async create(data) {
    this.created.push(data);
    return data;
  }
};

const { DebugTrace } = await import("../scripts/debug-file.mjs");
const { describeMessage, summarizeEvent } = await import("../scripts/debug.js");
const { RollTriggerService } = await import("../scripts/roll-trigger-service.js");

function createRollMessage(id, flags = {}) {
  return {
    id,
    uuid: `ChatMessage.${id}`,
    flags,
    getFlag(scope, key) {
      return this.flags[scope]?.[key] ?? null;
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope][key] = value;
      return value;
    }
  };
}

function createEvent(rollIndex, value) {
  return {
    rollIndex,
    rollType: "damage",
    total: value,
    formula: "1d6",
    diceResults: [{ faces: 6, value }],
    userId: "player-1",
    user: { id: "player-1", isGM: false, name: "Player One" },
    actor: { id: "actor-1", name: "Hero" },
    actorName: "Hero",
    visibility: "public",
    flags: { big: true },
    rawMessage: { id: "raw" },
    rawRoll: { formula: "1d6" },
    rawRolls: [{ formula: "1d6" }]
  };
}

function createSixTrigger(overrides = {}) {
  return {
    id: "six",
    name: "Six",
    enabled: true,
    executionMode: "automatic",
    filters: {},
    match: { type: "die-max", faces: 6, minCount: 1 },
    actions: [{ type: "chat-message", template: "Six on roll {{roll.total}}" }],
    ...overrides
  };
}

function createService({ events = [], triggers = [], enabled = true, supported = true, trace = new DebugTrace() } = {}) {
  return new RollTriggerService({
    adapter: {
      supportsMessage: () => supported,
      extractRollEvents: () => events
    },
    settings: {
      enabled,
      debug: false,
      storeTriggeredInChat: true,
      moduleId: "sephrals-roll-triggers",
      defaultExecutionMode: "automatic",
      respectPrivateRolls: true,
      maxActionsPerMessage: 10,
      getTriggers: () => triggers
    },
    trace
  });
}

const reasons = (trace) => trace.entries.filter((entry) => entry.event === "skipped").map((entry) => entry.reason);

test("the trace records why a message set off nothing", async () => {
  const trace = new DebugTrace();
  const events = [createEvent(0, 6)];

  game.user = { id: "gm-2", isGM: true };
  await createService({ events, triggers: [createSixTrigger()], trace }).processChatMessage(createRollMessage("assistant"));
  game.user = { id: "gm-1", isGM: true };
  await createService({ events, triggers: [createSixTrigger()], enabled: false, trace }).processChatMessage(createRollMessage("off"));
  // A message with rolls the adapter cannot read is recorded, a plain text message is not
  await createService({ events, triggers: [createSixTrigger()], supported: false, trace }).processChatMessage({ ...createRollMessage("unread"), rolls: [{}] });
  await createService({ events, triggers: [createSixTrigger()], supported: false, trace }).processChatMessage(createRollMessage("text"));
  await createService({ events, triggers: [createSixTrigger()], trace })
    .processChatMessage(createRollMessage("table", { "sephrals-roll-triggers": { triggerOutput: { triggerId: "six" } } }));
  await createService({ events, triggers: [createSixTrigger()], trace })
    .processChatMessage(createRollMessage("old", { "sephrals-roll-triggers": { processed: true } }));
  await createService({ events, triggers: [], trace }).processChatMessage(createRollMessage("none"));
  await createService({ events: [], triggers: [createSixTrigger()], trace }).processChatMessage(createRollMessage("empty"));

  // Other clients (here an assistant GM) record nothing
  assert.deepEqual(reasons(trace), ["disabled", "unsupported", "trigger-output", "already-processed", "no-active-triggers", "no-new-rolls"]);
  assert.deepEqual(trace.entries.map((entry) => entry.messageId), ["off", "unread", "table", "old", "none", "empty"]);
});

test("the trace records each matched trigger and the result of the message", async () => {
  game.user = { id: "gm-1", isGM: true };
  ChatMessage.created.length = 0;
  const trace = new DebugTrace();
  const events = [createEvent(0, 6), createEvent(1, 6)];

  await createService({ events, triggers: [createSixTrigger()], trace }).processChatMessage(createRollMessage("hit"));

  const matched = trace.forMessage("hit").filter((entry) => entry.event === "matched");
  assert.deepEqual(matched.map((entry) => [entry.triggerId, entry.triggerName, entry.rollIndex, entry.result]), [
    ["six", "Six", 0, "executed"],
    ["six", "Six", 1, "once-per-message"]
  ]);
  const processed = trace.forMessage("hit").find((entry) => entry.event === "processed");
  assert.equal(processed.rollCount, 2);
  assert.equal(processed.executedActions, 1);
  assert.deepEqual(processed.matchedTriggers, ["six"]);
});

test("the message details explain every trigger without the raw roll data", async () => {
  game.user = { id: "gm-1", isGM: true };
  const events = [createEvent(0, 6)];
  const triggers = [createSixTrigger(), createSixTrigger({ id: "gm", name: "GM only", filters: { gmOnly: true } })];
  const service = createService({ events, triggers });
  const message = createRollMessage("details");
  await service.processChatMessage(message);

  const description = describeMessage(service, message);
  assert.equal(description.activeGmClient, true);
  assert.equal(description.supported, true);
  assert.equal(description.events.length, 1);
  assert.equal(description.events[0].event.rawRoll, undefined);
  assert.equal(description.events[0].event.flags, undefined);
  assert.deepEqual(description.events[0].event.user, { id: "player-1", name: "Player One", isGM: false });
  assert.deepEqual(description.events[0].triggers.map((report) => [report.triggerId, report.matched, report.blockedBy]), [
    ["six", true, []],
    ["gm", false, ["gmOnly"]]
  ]);
  assert.deepEqual(description.processedState, { rollCount: 1, matchedTriggers: ["six"], executedActions: 1 });
  assert.equal(description.storedFlags.processed, 1);
});

test("the message details work before the service is ready", () => {
  const description = describeMessage(null, createRollMessage("early"));
  assert.equal(description.supported, false);
  assert.match(description.error, /not ready/);
  assert.deepEqual(summarizeEvent(null), { user: null });
});
