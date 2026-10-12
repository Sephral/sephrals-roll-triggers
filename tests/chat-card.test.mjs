import assert from "node:assert/strict";
import test from "node:test";

class FakeElement {
  constructor() {
    this.markup = "";
  }

  querySelector() {
    return null;
  }

  insertAdjacentHTML(_position, markup) {
    this.markup += markup;
  }
}

globalThis.HTMLElement = FakeElement;
globalThis.game = {
  user: { id: "gm-1", isGM: true },
  i18n: {
    localize(key) {
      return key;
    }
  }
};

const ownedActor = {
  testUserPermission(user, level) {
    return level === "OWNER" && user.id === "owner-1";
  }
};

globalThis.ChatMessage = {
  getSpeakerActor(speaker) {
    return speaker?.actor === "actor-1" ? ownedActor : null;
  }
};

const { canUserRunTriggerButtons, TriggerChatCardRenderer } = await import("../scripts/chat-card.js");

function createMessage(overrides = {}) {
  return {
    id: "message-1",
    _source: { author: "roller-1" },
    speaker: { actor: "actor-1" },
    blind: false,
    deferred: [{ triggerId: "nat20", triggerName: "Natural 20", executed: false }],
    getFlag(_scope, key) {
      return key === "deferredMatches" ? this.deferred : null;
    },
    ...overrides
  };
}

const player = (id) => ({ id, isGM: false });

test("GMs may always run stored triggers", () => {
  assert.equal(canUserRunTriggerButtons(createMessage(), { id: "gm-1", isGM: true }, { allowPlayerButtons: false }), true);
  assert.equal(canUserRunTriggerButtons(createMessage({ blind: true }), { id: "gm-1", isGM: true }, {}), true);
});

test("players may run stored triggers only on their own rolls or rolls of actors they own", () => {
  const options = { allowPlayerButtons: true };

  assert.equal(canUserRunTriggerButtons(createMessage(), player("roller-1"), options), true);
  assert.equal(canUserRunTriggerButtons(createMessage(), player("owner-1"), options), true);
  assert.equal(canUserRunTriggerButtons(createMessage(), player("other-1"), options), false);
  assert.equal(canUserRunTriggerButtons(createMessage({ speaker: {} }), player("owner-1"), options), false);
  assert.equal(canUserRunTriggerButtons(createMessage({ _source: {}, author: { id: "roller-1" } }), player("roller-1"), options), true);
});

test("players get no buttons without the setting, on blind rolls, or without a user", () => {
  assert.equal(canUserRunTriggerButtons(createMessage(), player("roller-1"), { allowPlayerButtons: false }), false);
  assert.equal(canUserRunTriggerButtons(createMessage({ blind: true }), player("roller-1"), { allowPlayerButtons: true }), false);
  assert.equal(canUserRunTriggerButtons(createMessage(), null, { allowPlayerButtons: true }), false);
});

test("appendButtons renders only for permitted users and escapes trigger names", () => {
  const renderer = new TriggerChatCardRenderer();
  const message = createMessage({
    deferred: [
      { triggerId: "x\" onclick=\"alert(1)", triggerName: "<img src=x onerror=alert(1)>", executed: false },
      { triggerId: "done", triggerName: "Done", executed: true }
    ]
  });

  game.user = { id: "gm-1", isGM: true };
  const root = new FakeElement();
  assert.equal(renderer.appendButtons(message, root, {}), true);
  assert.match(root.markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(root.markup, /data-trigger-id="x&quot; onclick=&quot;alert\(1\)"/);
  assert.doesNotMatch(root.markup, /<img/);
  assert.doesNotMatch(root.markup, /Done/);

  game.user = player("other-1");
  const otherRoot = new FakeElement();
  assert.equal(renderer.appendButtons(message, otherRoot, { allowPlayerButtons: true }), false);
  assert.equal(otherRoot.markup, "");

  game.user = player("roller-1");
  const rollerRoot = new FakeElement();
  assert.equal(renderer.appendButtons(message, rollerRoot, { allowPlayerButtons: true }), true);
});
