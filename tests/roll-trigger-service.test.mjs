import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  user: { id: "player-1", isGM: false },
  users: [{ id: "player-1", isGM: false, active: true }, { id: "gm-1", isGM: true, active: true }],
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

const { RollTriggerService } = await import("../scripts/roll-trigger-service.js");

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

test("GM deferred request handler resolves the source message and executes the relay", async () => {
  const service = createService();
  const message = { id: "message-2" };
  game.messages._messages.set("message-2", message);
  game.user = { id: "gm-1", isGM: true };

  let received = null;
  service.executeDeferredTrigger = async (resolvedMessage, triggerId, context) => {
    received = { resolvedMessage, triggerId, context };
  };

  const relay = {
    getFlag(scope, key) {
      if (scope !== "sephrals-roll-triggers" || key !== "deferredRequest") return null;
      return { messageId: "message-2", triggerId: "trigger-2", userId: "player-1" };
    }
  };

  const handled = await service.handleDeferredRequestMessage(relay);

  assert.equal(handled, true);
  assert.deepEqual(received, {
    resolvedMessage: message,
    triggerId: "trigger-2",
    context: { requestRelay: true }
  });
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