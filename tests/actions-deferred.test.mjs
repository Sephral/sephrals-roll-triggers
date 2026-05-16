import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  user: { isGM: true },
  tables: {
    get(id) {
      return id === "table-1" ? {
        id,
        name: "Crit Table",
        async draw() {
          return { results: [{ text: "Big crit" }] };
        }
      } : null;
    },
    find(callback) {
      const table = this.get("table-1");
      return callback(table) ? table : null;
    }
  },
  macros: {
    get(id) {
      return id === "macro-1" ? {
        id,
        name: "Macro One",
        async execute(scope) {
          executedMacros.push(scope);
          return scope;
        }
      } : null;
    },
    find(callback) {
      const macro = this.get("macro-1");
      return callback(macro) ? macro : null;
    }
  },
  journal: {
    get(id) {
      return id === "journal-1" ? { id, name: "Journal One", uuid: "JournalEntry.journal-1" } : null;
    },
    find(callback) {
      const journal = this.get("journal-1");
      return callback(journal) ? journal : null;
    }
  },
  i18n: {
    localize(key) {
      return key;
    }
  }
};

const createdMessages = [];
const executedMacros = [];

globalThis.Dialog = {
  async confirm() {
    return true;
  }
};

globalThis.ChatMessage = {
  getWhisperRecipients() {
    return [{ id: "gm-1" }];
  },
  async create(data) {
    createdMessages.push(data);
    return data;
  }
};

const {
  confirmExecution,
  executeMatch,
  hydrateDeferredMatch,
  markDeferredMatchExecuted,
  serializeDeferredMatch
} = await import("../scripts/actions.js");

test("serializeDeferredMatch stores enough data to hydrate later", () => {
  const serialized = serializeDeferredMatch({
    trigger: {
      id: "nat20",
      name: "Natural 20",
      executionMode: "chat-button"
    },
    event: {
      rollIndex: 0,
      formula: "1d20+5",
      total: 25,
      rollType: "attack",
      actorName: "Hero",
      actorId: "a1",
      actorType: "pc",
      userId: "u1",
      visibility: "public",
      diceTerms: [{ faces: 20 }],
      diceResults: [{ faces: 20, value: 20 }],
      flags: { dnd5e: { critical: true } }
    },
    actions: [{ type: "chat-message", template: "Crit by {{actor.name}}", visibility: "public" }],
    executionMode: "chat-button"
  });

  const hydrated = hydrateDeferredMatch(serialized);
  assert.equal(hydrated.trigger.id, "nat20");
  assert.equal(hydrated.event.actorName, "Hero");
  assert.deepEqual(hydrated.actions, [{ type: "chat-message", template: "Crit by {{actor.name}}", visibility: "public" }]);
});

test("executeMatch can force immediate execution for chat-button matches", async () => {
  createdMessages.length = 0;

  const result = await executeMatch({
    trigger: { id: "nat20", name: "Natural 20" },
    event: {
      actorId: "a1",
      actorName: "Hero",
      userId: "u1",
      user: { name: "Player" },
      formula: "1d20+5",
      total: 25,
      rollType: "attack",
      diceResults: [{ faces: 20, value: 20 }],
      systemId: "dnd5e",
      systemVersion: "5.2.0"
    },
    actions: [{ type: "chat-message", template: "Crit by {{actor.name}}", visibility: "public" }],
    executionMode: "chat-button"
  }, {
    allowDeferred: false,
    forceExecutionMode: "automatic"
  });

  assert.equal(result.skipped, false);
  assert.equal(createdMessages.length, 1);
  assert.equal(createdMessages[0].content, "Crit by Hero");
});

test("markDeferredMatchExecuted flips the first matching deferred entry", async () => {
  const stored = [{ triggerId: "nat20", executed: false }, { triggerId: "nat1", executed: false }];
  const message = {
    getFlag() {
      return stored;
    },
    async setFlag(_scope, _key, value) {
      stored.splice(0, stored.length, ...value);
    }
  };

  const changed = await markDeferredMatchExecuted(message, "nat20");
  assert.equal(changed, true);
  assert.deepEqual(stored, [{ triggerId: "nat20", executed: true }, { triggerId: "nat1", executed: false }]);
});

test("hydrateDeferredMatch returns null for incomplete entries", () => {
  assert.equal(hydrateDeferredMatch({ trigger: null, event: {} }), null);
  assert.equal(hydrateDeferredMatch({ trigger: {}, event: null }), null);
});

test("confirmExecution stops immediately for non-GM users", async () => {
  game.user.isGM = false;
  assert.equal(await confirmExecution({ actions: [] }), false);
  game.user.isGM = true;
});

test("executeMatch handles disabled, deferred, confirm cancel, and gm-whisper-log modes", async () => {
  createdMessages.length = 0;

  assert.deepEqual(
    await executeMatch({ executionMode: "disabled", actions: [] }),
    { skipped: true, reason: "disabled" }
  );

  assert.deepEqual(
    await executeMatch({ executionMode: "chat-button", actions: [] }),
    { deferred: true, mode: "chat-button" }
  );

  const originalConfirm = Dialog.confirm;
  Dialog.confirm = async () => false;
  assert.deepEqual(
    await executeMatch({ executionMode: "confirm-gm", actions: [], trigger: { name: "T" }, event: { actorName: "A", formula: "1d20", total: 20 } }),
    { skipped: true, reason: "cancelled" }
  );
  Dialog.confirm = originalConfirm;

  const gmResult = await executeMatch({
    executionMode: "gm-whisper-log",
    trigger: { name: "Nat20" },
    event: { formula: "1d20+5", total: 25 },
    actions: []
  });

  assert.equal(gmResult.skipped, false);
  assert.equal(gmResult.mode, "gm-whisper-log");
  assert.equal(createdMessages.at(-1).content, "<div><strong>Nat20</strong>: 1d20+5 = 25</div>");
  assert.deepEqual(createdMessages.at(-1).whisper, ["gm-1"]);
});

test("executeMatch supports custom whispers and roll-table resolution by id and uuid", async () => {
  createdMessages.length = 0;
  globalThis.fromUuid = async (uuid) => uuid === "RollTable.uuid-1"
    ? {
        id: "table-uuid",
        name: "UUID Table",
        async draw() {
          return { results: [{ text: "UUID result" }] };
        }
      }
    : null;

  const result = await executeMatch({
    trigger: { id: "combo", name: "Combo Trigger" },
    event: {
      actorId: "a1",
      actorName: "Hero",
      userId: "u1",
      user: { name: "Player" },
      formula: "1d20+5",
      total: 25,
      rollType: "attack",
      diceResults: [{ faces: 20, value: 20 }],
      systemId: "dnd5e",
      systemVersion: "5.2.0"
    },
    actions: [
      { type: "chat-message", template: "Private for {{user.name}}", visibility: "custom", userIds: ["u2", "u3"] },
      { type: "roll-table", tables: ["table-1", "RollTable.uuid-1"], visibility: "player" },
      { type: "roll-table", tables: ["table-1"], visibility: "gm", postResult: false }
    ],
    executionMode: "automatic"
  }, {
    allowDeferred: false
  });

  assert.equal(result.skipped, false);
  assert.equal(result.results[1].length, 2);
  assert.equal(result.results[2].length, 1);
  assert.deepEqual(createdMessages[0].whisper, ["u2", "u3"]);
  assert.deepEqual(createdMessages[1].whisper, ["u1"]);
  assert.match(createdMessages[1].content, /Crit Table/);
  assert.match(createdMessages[2].content, /UUID Table/);
  assert.equal(createdMessages.length, 3);

  delete globalThis.fromUuid;
});

test("executeMatch supports macro, journal-link, and gm-note actions", async () => {
  createdMessages.length = 0;
  executedMacros.length = 0;

  const result = await executeMatch({
    trigger: { id: "bundle", name: "Bundle Trigger" },
    event: {
      actorId: "a1",
      actorName: "Hero",
      userId: "u1",
      user: { name: "Player" },
      formula: "1d20+5",
      total: 25,
      rollType: "attack",
      diceResults: [{ faces: 20, value: 20 }],
      systemId: "dnd5e",
      systemVersion: "5.2.0"
    },
    actions: [
      { type: "macro", macro: "macro-1" },
      { type: "journal-link", journal: "journal-1", visibility: "public" },
      { type: "gm-note", template: "GM note for {{actor.name}}" }
    ],
    executionMode: "automatic"
  }, {
    allowDeferred: false
  });

  assert.equal(result.skipped, false);
  assert.equal(executedMacros.length, 1);
  assert.equal(executedMacros[0].trigger.name, "Bundle Trigger");
  assert.equal(createdMessages.length, 2);
  assert.match(createdMessages[0].content, /@UUID\[JournalEntry.journal-1\]\{Journal One\}/);
  assert.equal(createdMessages[1].content, "GM note for Hero");
  assert.deepEqual(createdMessages[1].whisper, ["gm-1"]);
});

test("executeMatch resolves rollTables and journalEntries aliases", async () => {
  createdMessages.length = 0;
  const originalTables = game.tables;
  const originalJournal = game.journal;

  game.tables = null;
  game.rollTables = {
    get(id) {
      return id === "table-alias" ? {
        id,
        name: "Alias Table",
        async draw() {
          return { results: [{ text: "Alias result" }] };
        }
      } : null;
    }
  };
  game.journal = null;
  game.journalEntries = {
    get(id) {
      return id === "journal-alias" ? { id, name: "Alias Journal", uuid: "JournalEntry.alias" } : null;
    }
  };

  const result = await executeMatch({
    trigger: { id: "aliases", name: "Alias Trigger" },
    event: { userId: "u1", user: { name: "Player" }, formula: "1d20", total: 20, rollType: "attack" },
    actions: [
      { type: "roll-table", tables: ["table-alias"], visibility: "gm" },
      { type: "journal-link", journal: "journal-alias", visibility: "public" }
    ],
    executionMode: "automatic"
  }, {
    allowDeferred: false
  });

  assert.equal(result.skipped, false);
  assert.equal(result.results[0].length, 1);
  assert.match(createdMessages[0].content, /Alias Table/);
  assert.match(createdMessages[1].content, /@UUID\[JournalEntry.alias\]\{Alias Journal\}/);

  game.tables = originalTables;
  game.journal = originalJournal;
  delete game.rollTables;
  delete game.journalEntries;
});