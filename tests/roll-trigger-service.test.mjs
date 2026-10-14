import assert from "node:assert/strict";
import test from "node:test";

const users = new Map([
  ["player-1", { id: "player-1", isGM: false, active: true }],
  ["player-2", { id: "player-2", isGM: false, active: true }],
  ["gm-1", { id: "gm-1", isGM: true, active: true }],
  ["gm-2", { id: "gm-2", isGM: true, active: true }]
]);

globalThis.game = {
  user: { id: "player-1", isGM: false },
  // gm-1 is the designated active GM, gm-2 an additional (assistant) GM.
  users: {
    activeGM: users.get("gm-1"),
    get(id) {
      return users.get(id) ?? null;
    }
  },
  i18n: {
    localize(key) {
      return key;
    }
  },
  messages: {
    get(id) {
      return this._messages.get(id) ?? null;
    },
    _messages: new Map()
  }
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

const { exceedsActionLimit, getMatchActionCost, hasNothingToRun, isActiveGmClient, RELAY_CLEANUP_DELAY_MS, RollTriggerService } = await import("../scripts/roll-trigger-service.js");

function createService() {
  return new RollTriggerService({
    adapter: {
      supportsMessage() {
        return true;
      },
      extractRollEvents() {
        return [];
      }
    },
    settings: {
      enabled: true,
      allowPlayerButtons: true,
      storeTriggeredInChat: true,
      moduleId: "sephrals-roll-triggers",
      getTriggers() {
        return [];
      }
    }
  });
}

test("non-GM deferred execution creates a GM relay chat request", async () => {
  ChatMessage.created.length = 0;
  const service = createService();
  const button = {
    disabled: false,
    setAttribute(name, value) {
      if (name === "disabled") this.disabled = value;
    },
    classList: {
      add() {}
    }
  };

  const result = await service.executeDeferredTrigger({
    id: "message-1",
    getFlag() {
      return [{
        triggerId: "trigger-1",
        trigger: { id: "trigger-1", name: "Trigger", executionMode: "chat-button" },
        event: { total: 20, rollType: "attack" },
        actions: [],
        executed: false
      }];
    }
  }, "trigger-1", { button });

  assert.deepEqual(result, { queued: true, mode: "chat-button" });
  assert.equal(button.disabled, "disabled");
  assert.deepEqual(ChatMessage.created, [{
    content: "<div class=\"srt-deferred-request\" hidden></div>",
    whisper: ["gm-1"],
    flags: {
      "sephrals-roll-triggers": {
        deferredRequest: {
          messageId: "message-1",
          triggerId: "trigger-1",
          userId: "player-1"
        }
      }
    }
  }]);
});

function createRelay(authorId, request = { messageId: "message-2", triggerId: "trigger-2", userId: authorId }) {
  return {
    _source: { author: authorId },
    getFlag(scope, key) {
      if (scope !== "sephrals-roll-triggers" || key !== "deferredRequest") return null;
      return request;
    }
  };
}

test("GM deferred request handler resolves the source message and executes the relay", async () => {
  const service = createService();
  const message = { id: "message-2", _source: { author: "player-1" } };
  game.messages._messages.set("message-2", message);
  game.user = { id: "gm-1", isGM: true };

  let received = null;
  service.executeDeferredTrigger = async (resolvedMessage, triggerId, context) => {
    received = { resolvedMessage, triggerId, context };
  };

  const handled = await service.handleDeferredRequestMessage(createRelay("player-1"));

  assert.equal(handled, true);
  assert.deepEqual(received, {
    resolvedMessage: message,
    triggerId: "trigger-2",
    context: { requestRelay: true }
  });
});

test("deferred relay requests are handled only by the active GM", async () => {
  const service = createService();
  game.messages._messages.set("message-2", { id: "message-2", _source: { author: "player-1" } });
  game.user = { id: "gm-2", isGM: true };

  let executed = false;
  service.executeDeferredTrigger = async () => {
    executed = true;
  };

  assert.equal(await service.handleDeferredRequestMessage(createRelay("player-1")), true);
  assert.equal(executed, false);
});

test("deferred relay requests from players without rights on the roll are rejected", async () => {
  const service = createService();
  game.messages._messages.set("message-2", { id: "message-2", _source: { author: "player-1" }, speaker: {} });
  game.user = { id: "gm-1", isGM: true };

  let executed = 0;
  service.executeDeferredTrigger = async () => {
    executed += 1;
  };

  // player-2 neither rolled the message nor owns its speaker actor. The self-declared userId does not count.
  await service.handleDeferredRequestMessage(createRelay("player-2", { messageId: "message-2", triggerId: "trigger-2", userId: "player-1" }));
  assert.equal(executed, 0);

  // With player buttons disabled, even the roller cannot run the trigger through a relay.
  service.settings.allowPlayerButtons = false;
  await service.handleDeferredRequestMessage(createRelay("player-1"));
  assert.equal(executed, 0);

  service.settings.allowPlayerButtons = true;
  await service.handleDeferredRequestMessage(createRelay("player-1"));
  assert.equal(executed, 1);
});

test("players get a warning instead of a relay request when no GM is online", async () => {
  ChatMessage.created.length = 0;
  const warnings = [];
  globalThis.ui = { notifications: { warn: (text) => warnings.push(text) } };
  const activeGM = game.users.activeGM;
  game.users.activeGM = null;
  game.user = { id: "player-1", isGM: false };

  const service = createService();
  const result = await service.requestDeferredTriggerExecution({ id: "message-1" }, "trigger-1");

  assert.deepEqual(result, { skipped: true, reason: "no-active-gm" });
  assert.equal(ChatMessage.created.length, 0);
  assert.deepEqual(warnings, ["SRT.Notification.NoActiveGm"]);

  game.users.activeGM = activeGM;
  delete globalThis.ui;
});

test("isActiveGmClient is true only on the designated active GM", () => {
  game.user = { id: "gm-1", isGM: true };
  assert.equal(isActiveGmClient(), true);
  game.user = { id: "gm-2", isGM: true };
  assert.equal(isActiveGmClient(), false);
  game.user = { id: "player-1", isGM: false };
  assert.equal(isActiveGmClient(), false);
});

test("renderChatMessage hides internal deferred relay messages", () => {
  const service = createService();
  const html = { hidden: false, style: {} };
  const relay = {
    getFlag(scope, key) {
      if (scope !== "sephrals-roll-triggers" || key !== "deferredRequest") return null;
      return { messageId: "message-2", triggerId: "trigger-2", userId: "player-1" };
    }
  };

  const rendered = service.renderChatMessage(relay, html);

  assert.equal(rendered, false);
  assert.equal(html.hidden, true);
  assert.equal(html.style.display, "none");
});

test("processChatMessage evaluates custom-js triggers for player-authored rolls on the GM client", async () => {
  ChatMessage.created.length = 0;
  game.user = { id: "gm-1", isGM: true, name: "GM" };

  const event = {
    rollIndex: 0,
    rollType: "skill",
    total: 22,
    formula: "1d100",
    diceResults: [{ faces: 100, value: 22 }],
    userId: "player-1",
    user: { id: "player-1", isGM: false, name: "Player One" },
    actorId: "actor-1",
    actorName: "Investigator",
    actorType: "pc",
    visibility: "public",
    isCombat: false,
    sceneId: "scene-1",
    flags: {}
  };

  const message = {
    id: "message-player-roll",
    uuid: "ChatMessage.message-player-roll",
    getFlag(scope, key) {
      if (scope !== "sephrals-roll-triggers" || key !== "processed") return null;
      return this._processed ?? null;
    },
    async setFlag(scope, key, value) {
      if (scope === "sephrals-roll-triggers" && key === "processed") {
        this._processed = value;
      }
      return value;
    }
  };

  const service = new RollTriggerService({
    adapter: {
      supportsMessage() {
        return true;
      },
      extractRollEvents() {
        return [event];
      }
    },
    settings: {
      enabled: true,
      debug: false,
      allowPlayerButtons: true,
      storeTriggeredInChat: true,
      moduleId: "sephrals-roll-triggers",
      defaultExecutionMode: "automatic",
      respectPrivateRolls: true,
      maxActionsPerMessage: 5,
      getTriggers() {
        return [{
          id: "player-doubles",
          enabled: true,
          executionMode: "automatic",
          filters: { rollType: ["skill"] },
          match: {
            type: "custom-js",
            expression: 'event.total >= 11 && event.total <= 99 && event.total % 11 === 0'
          },
          actions: [{
            type: "chat-message",
            template: "{{actor.name}} can mark {{roll.total}} for improvement"
          }]
        }];
      }
    }
  });

  await service.processChatMessage(message);

  assert.equal(ChatMessage.created.length, 1);
  assert.equal(ChatMessage.created[0].content, "Investigator can mark 22 for improvement");
  assert.equal(message._processed, true);
});

function createRollMessage(id) {
  return {
    id,
    uuid: `ChatMessage.${id}`,
    flags: {},
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

function createRollEventStub(rollIndex, value) {
  return {
    rollIndex,
    rollType: "damage",
    total: value,
    formula: "1d6",
    diceResults: [{ faces: 6, value }],
    userId: "player-1",
    user: { id: "player-1", isGM: false, name: "Player One" },
    actorName: "Hero",
    visibility: "public",
    flags: {}
  };
}

function createProcessingService({ events, triggers, maxActionsPerMessage = 10 }) {
  return new RollTriggerService({
    adapter: {
      supportsMessage() {
        return true;
      },
      extractRollEvents() {
        return events;
      }
    },
    settings: {
      enabled: true,
      debug: false,
      storeTriggeredInChat: true,
      moduleId: "sephrals-roll-triggers",
      defaultExecutionMode: "automatic",
      respectPrivateRolls: true,
      maxActionsPerMessage,
      getTriggers() {
        return triggers;
      }
    }
  });
}

function createSixTrigger(overrides = {}) {
  return {
    id: "six",
    enabled: true,
    executionMode: "automatic",
    filters: {},
    match: { type: "die-max", faces: 6, minCount: 1 },
    actions: [{ type: "chat-message", template: "Six on roll {{roll.total}}" }],
    ...overrides
  };
}

test("processChatMessage runs only on the active GM client", async () => {
  ChatMessage.created.length = 0;
  const events = [createRollEventStub(0, 6)];

  game.user = { id: "gm-2", isGM: true };
  const message = createRollMessage("message-assistant");
  await createProcessingService({ events, triggers: [createSixTrigger()] }).processChatMessage(message);
  assert.equal(ChatMessage.created.length, 0);
  assert.equal(message.flags["sephrals-roll-triggers"], undefined);

  game.user = { id: "gm-1", isGM: true };
  await createProcessingService({ events, triggers: [createSixTrigger()] }).processChatMessage(createRollMessage("message-active"));
  assert.equal(ChatMessage.created.length, 1);
});

test("processChatMessage ignores roll table cards posted by a trigger", async () => {
  game.user = { id: "gm-1", isGM: true };
  ChatMessage.created.length = 0;
  const message = createRollMessage("message-table-card");
  message.flags["sephrals-roll-triggers"] = { triggerOutput: { triggerId: "six" } };

  await createProcessingService({ events: [createRollEventStub(0, 6)], triggers: [createSixTrigger()] }).processChatMessage(message);

  assert.equal(ChatMessage.created.length, 0);
  assert.equal(message.flags["sephrals-roll-triggers"].processed, undefined);
});

test("processChatMessage runs a trigger once per message unless it allows multiple matches", async () => {
  game.user = { id: "gm-1", isGM: true };
  const events = [createRollEventStub(0, 6), createRollEventStub(1, 6)];

  ChatMessage.created.length = 0;
  await createProcessingService({ events, triggers: [createSixTrigger()] }).processChatMessage(createRollMessage("message-once"));
  assert.deepEqual(ChatMessage.created.map((data) => data.content), ["Six on roll 6"]);

  ChatMessage.created.length = 0;
  await createProcessingService({ events, triggers: [createSixTrigger({ allowMultipleMatches: true })] }).processChatMessage(createRollMessage("message-multi"));
  assert.equal(ChatMessage.created.length, 2);

  ChatMessage.created.length = 0;
  await createProcessingService({ events, triggers: [createSixTrigger({ oncePerMessage: false })] }).processChatMessage(createRollMessage("message-each"));
  assert.equal(ChatMessage.created.length, 2);
});

test("processChatMessage stores one chat button per trigger and message", async () => {
  game.user = { id: "gm-1", isGM: true };
  const message = createRollMessage("message-buttons");
  const events = [createRollEventStub(0, 6), createRollEventStub(1, 6)];

  await createProcessingService({ events, triggers: [createSixTrigger({ executionMode: "chat-button" })] }).processChatMessage(message);

  const stored = message.flags["sephrals-roll-triggers"].deferredMatches;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].triggerId, "six");
  assert.equal(stored[0].rollIndex, 0);
});

test("processChatMessage never runs more actions than the per-message limit", async () => {
  game.user = { id: "gm-1", isGM: true };
  ChatMessage.created.length = 0;
  const twoActions = [{ type: "chat-message", template: "B1" }, { type: "chat-message", template: "B2" }];
  const triggers = [
    createSixTrigger({ id: "a", priority: 300, actions: [{ type: "chat-message", template: "A" }], allowMultipleMatches: true }),
    createSixTrigger({ id: "b", priority: 200, actions: twoActions, allowMultipleMatches: true }),
    createSixTrigger({ id: "c", priority: 100, actions: [{ type: "chat-message", template: "C" }], allowMultipleMatches: true })
  ];
  const events = [createRollEventStub(0, 6), createRollEventStub(1, 6)];

  await createProcessingService({ events, triggers, maxActionsPerMessage: 2 }).processChatMessage(createRollMessage("message-limit"));

  // "b" would need two more actions after "a" and is skipped. "c" fills the limit, the second roll adds nothing.
  assert.deepEqual(ChatMessage.created.map((data) => data.content), ["A", "C"]);
});

test("the action limit helpers charge one slot per action and nothing for chat buttons", () => {
  assert.equal(getMatchActionCost({ actions: [] }), 1);
  assert.equal(getMatchActionCost({ actions: [{}, {}, {}] }), 3);
  assert.equal(exceedsActionLimit({ executionMode: "automatic", actions: [{}, {}] }, 2, 3), true);
  assert.equal(exceedsActionLimit({ executionMode: "automatic", actions: [{}] }, 2, 3), false);
  assert.equal(exceedsActionLimit({ executionMode: "chat-button", actions: [{}, {}, {}, {}] }, 3, 3), false);
  assert.equal(exceedsActionLimit({ executionMode: "disabled", actions: [{}, {}] }, 3, 3), false);
});

test("a chat button clicked twice before the first run finishes runs only once", async () => {
  ChatMessage.created.length = 0;
  const previousUser = game.user;
  game.user = { id: "player-1", isGM: false };
  const service = createService();
  const message = {
    id: "message-double",
    getFlag() {
      return [{
        triggerId: "trigger-1",
        trigger: { id: "trigger-1", name: "Trigger", executionMode: "chat-button" },
        event: { total: 20, rollType: "attack" },
        actions: [],
        executed: false
      }];
    }
  };

  const [first, second] = await Promise.all([
    service.executeDeferredTrigger(message, "trigger-1"),
    service.executeDeferredTrigger(message, "trigger-1")
  ]);

  assert.deepEqual(first, { queued: true, mode: "chat-button" });
  assert.deepEqual(second, { skipped: true, reason: "running" });
  assert.equal(ChatMessage.created.length, 1);
  assert.equal(service.runningDeferred.size, 0);
  game.user = previousUser;
});

test("the active GM removes a relay request once handled, accepted or rejected", async () => {
  const service = createService();
  service.relayCleanupDelay = 0;
  game.messages._messages.set("message-2", { id: "message-2", _source: { author: "player-1" }, speaker: {} });
  service.executeDeferredTrigger = async () => {};
  const withDelete = (relay) => {
    relay.deleted = 0;
    relay.id = `relay-${Math.random()}`;
    game.messages._messages.set(relay.id, relay);
    relay.delete = async () => {
      relay.deleted += 1;
    };
    return relay;
  };

  game.user = { id: "gm-1", isGM: true };
  const accepted = withDelete(createRelay("player-1"));
  const rejected = withDelete(createRelay("player-2"));
  await service.handleDeferredRequestMessage(accepted);
  await service.handleDeferredRequestMessage(rejected);
  assert.equal(accepted.deleted, 1);
  assert.equal(rejected.deleted, 1);

  game.user = { id: "gm-2", isGM: true };
  const ignored = withDelete(createRelay("player-1"));
  await service.handleDeferredRequestMessage(ignored);
  assert.equal(ignored.deleted, 0);
});

test("relay cleanup waits for the notification animation and skips messages that are already gone", async () => {
  const service = createService();
  assert.equal(service.relayCleanupDelay, RELAY_CLEANUP_DELAY_MS);
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay) => timers.push({ callback, delay });
  try {
    let deleted = 0;
    const relay = { id: "relay-late", delete: async () => { deleted += 1; } };
    game.messages._messages.set(relay.id, relay);
    service.scheduleRelayCleanup(relay);
    assert.equal(deleted, 0);
    assert.equal(timers[0].delay, RELAY_CLEANUP_DELAY_MS);
    await timers[0].callback();
    assert.equal(deleted, 1);

    const gone = { id: "relay-gone", delete: async () => { deleted += 1; } };
    service.scheduleRelayCleanup(gone);
    await timers[1].callback();
    assert.equal(deleted, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("a trigger without actions asks nothing, stores no button and only the whisper log still reports it", async () => {
  game.user = { id: "gm-1", isGM: true };
  ChatMessage.created.length = 0;
  const message = createRollMessage("message-empty");
  const events = [createRollEventStub(0, 6)];
  const triggers = [
    createSixTrigger({ id: "ask", executionMode: "confirm-gm", actions: [] }),
    createSixTrigger({ id: "button", executionMode: "chat-button", actions: [] }),
    createSixTrigger({ id: "log", name: "Log", executionMode: "gm-whisper-log", actions: [] })
  ];
  const originalDialog = globalThis.Dialog;
  let asked = 0;
  globalThis.Dialog = { async confirm() { asked += 1; return true; } };
  try {
    await createProcessingService({ events, triggers }).processChatMessage(message);
  } finally {
    globalThis.Dialog = originalDialog;
  }

  assert.equal(asked, 0);
  assert.equal(message.flags["sephrals-roll-triggers"].deferredMatches, undefined);
  assert.equal(ChatMessage.created.length, 1);
  assert.match(ChatMessage.created[0].content, /Log/);
  assert.equal(hasNothingToRun({ executionMode: "automatic", actions: [] }), true);
  assert.equal(hasNothingToRun({ executionMode: "automatic", actions: [{ type: "gm-note" }] }), false);
  assert.equal(hasNothingToRun({ executionMode: "gm-whisper-log", actions: [] }), false);
});
