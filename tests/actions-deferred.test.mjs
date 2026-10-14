import assert from "node:assert/strict";
import test from "node:test";

// RollTable mock: draw() returns the drawn results, toMessage() records the result card it would post.
function createTable(id, name, text) {
  return {
    id,
    name,
    drawOptions: null,
    async draw(options) {
      this.drawOptions = options;
      return { roll: { total: 7 }, results: [{ text }] };
    },
    async toMessage(results, { roll, messageData = {}, messageOptions = {} } = {}) {
      const message = { table: name, results, roll, ...messageData, messageOptions };
      createdMessages.push(message);
      return message;
    }
  };
}

globalThis.game = {
  user: { isGM: true },
  tables: {
    get(id) {
      return id === "table-1" ? createTable(id, "Crit Table", "Big crit") : null;
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
    },
    format(key, data) {
      return `${key} ${data.name}`;
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
  escapeHtml,
  executeMatch,
  hydrateDeferredMatch,
  markDeferredMatchExecuted,
  renderTemplateString,
  resolveActionVisibility,
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
    ? createTable("table-uuid", "UUID Table", "UUID result")
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

  // The table's own result card is posted with the drawn result, the roll and the action's whisper recipients.
  assert.equal(createdMessages[1].table, "Crit Table");
  assert.deepEqual(createdMessages[1].results, [{ text: "Big crit" }]);
  assert.deepEqual(createdMessages[1].roll, { total: 7 });
  assert.deepEqual(createdMessages[1].whisper, ["u1"]);
  assert.deepEqual(createdMessages[1].messageOptions, { rollMode: "gmroll" });
  assert.equal(createdMessages[1].flavor, "SRT.Chat.TriggerReference <strong>Combo Trigger</strong>: TABLE.DrawFlavor Crit Table");
  assert.deepEqual(createdMessages[1].flags, { "sephrals-roll-triggers": { triggerOutput: { triggerId: "combo" } } });
  assert.equal(createdMessages[2].table, "UUID Table");
  assert.deepEqual(createdMessages[2].results, [{ text: "UUID result" }]);

  // postResult: false draws without posting anything.
  assert.equal(result.results[2][0].table.drawOptions.displayChat, false);
  assert.equal(createdMessages.length, 3);

  delete globalThis.fromUuid;
});

test("roll-table results use v14 message modes and keep public cards public", async () => {
  createdMessages.length = 0;
  globalThis.CONFIG = { ChatMessage: { modes: { public: {}, gm: {} } } };

  await executeMatch({
    trigger: { id: "crit", name: "Crit <b>& more</b>" },
    event: { userId: "u1", formula: "1d20", total: 20 },
    actions: [
      { type: "roll-table", tables: ["table-1"], visibility: "public" },
      { type: "roll-table", tables: ["table-1"], visibility: "gm" }
    ],
    executionMode: "automatic"
  }, { allowDeferred: false });

  assert.deepEqual(createdMessages[0].whisper, []);
  assert.deepEqual(createdMessages[0].messageOptions, { messageMode: "public" });
  assert.match(createdMessages[0].flavor, /<strong>Crit &lt;b&gt;&amp; more&lt;\/b&gt;<\/strong>/);
  assert.deepEqual(createdMessages[1].whisper, ["gm-1"]);
  assert.deepEqual(createdMessages[1].messageOptions, { messageMode: "gm" });

  delete globalThis.CONFIG;
});

test("roll-table actions skip the result card when nothing was drawn", async () => {
  createdMessages.length = 0;
  const empty = createTable("table-empty", "Empty Table", "");
  empty.draw = async () => ({ roll: null, results: [] });
  globalThis.fromUuid = async (uuid) => uuid === "RollTable.empty" ? empty : null;

  await executeMatch({
    trigger: { id: "empty", name: "Empty" },
    event: { userId: "u1", formula: "1d20", total: 1 },
    actions: [{ type: "roll-table", tables: ["RollTable.empty"], visibility: "gm" }],
    executionMode: "automatic"
  }, { allowDeferred: false });

  assert.equal(createdMessages.length, 0);
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
      return id === "table-alias" ? createTable(id, "Alias Table", "Alias result") : null;
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
  assert.equal(createdMessages[0].table, "Alias Table");
  assert.match(createdMessages[1].content, /@UUID\[JournalEntry.alias\]\{Alias Journal\}/);

  game.tables = originalTables;
  game.journal = originalJournal;
  delete game.rollTables;
  delete game.journalEntries;
});

test("empty templates and table lists fall back to the default card, message text and single table", async () => {
  createdMessages.length = 0;

  const result = await executeMatch({
    trigger: { id: "fallbacks", name: "Fallback Trigger" },
    event: { userId: "u1", user: { name: "Player" }, actorName: "Hero", formula: "1d20", total: 20 },
    actions: [
      // The trigger editor stores template "" when the journal template field is left blank.
      { type: "journal-link", journal: "journal-1", template: "", visibility: "public" },
      { type: "journal-link", journal: "journal-1", template: "   ", visibility: "public" },
      { type: "chat-message", template: "", message: "Legacy {{actor.name}}", visibility: "public" },
      { type: "gm-note", template: "", message: "Legacy note" },
      { type: "roll-table", tables: [], table: "table-1", visibility: "gm" }
    ],
    executionMode: "automatic"
  }, { allowDeferred: false });

  assert.equal(createdMessages[0].content, "<div><strong>Fallback Trigger</strong></div><div>@UUID[JournalEntry.journal-1]{Journal One}</div>");
  assert.equal(createdMessages[1].content, createdMessages[0].content);
  assert.equal(createdMessages[2].content, "Legacy Hero");
  assert.equal(createdMessages[3].content, "Legacy note");
  assert.equal(createdMessages[4].table, "Crit Table");
  assert.equal(result.results[4].length, 1);

  // A written journal template is still used as is.
  createdMessages.length = 0;
  await executeMatch({
    trigger: { id: "custom", name: "Custom" },
    event: { userId: "u1", formula: "1d20", total: 20 },
    actions: [{ type: "journal-link", journal: "journal-1", template: "See {{journal.name}}", visibility: "public" }],
    executionMode: "automatic"
  }, { allowDeferred: false });
  assert.equal(createdMessages[0].content, "See Journal One");
});

test("escapeHtml prefers foundry.utils.escapeHTML and falls back to the same table", () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#x27;Jerry&#x27;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(20), "20");

  globalThis.foundry = { utils: { escapeHTML: (value) => `escaped:${value}` } };
  assert.equal(escapeHtml("<b>"), "escaped:<b>");
  delete globalThis.foundry;
});

test("renderTemplateString keeps the GM template HTML and escapes substituted values", () => {
  const content = renderTemplateString("<em>{{actor.name}}</em> by {{user.name}}: {{roll.total}}", {
    actor: { name: "<img src=x onerror=alert(1)>" },
    user: { name: "Tom & Jerry" },
    roll: { total: 20 }
  });

  assert.equal(content, "<em>&lt;img src=x onerror=alert(1)&gt;</em> by Tom &amp; Jerry: 20");
});

test("chat, journal, gm-whisper-log and confirm output escape names", async () => {
  createdMessages.length = 0;
  const event = {
    actorName: "<b>Hero</b>",
    userId: "u1",
    user: { name: "<i>Player</i>" },
    formula: "1d20<script>",
    total: 20
  };
  const trigger = { id: "x", name: "<script>Nat20</script>" };

  await executeMatch({
    trigger,
    event,
    actions: [
      { type: "chat-message", template: "<p>{{actor.name}} / {{user.name}} / {{trigger.name}}</p>", visibility: "public" },
      { type: "journal-link", journal: "journal-1", visibility: "public" }
    ],
    executionMode: "automatic"
  }, { allowDeferred: false });

  assert.equal(createdMessages[0].content, "<p>&lt;b&gt;Hero&lt;/b&gt; / &lt;i&gt;Player&lt;/i&gt; / &lt;script&gt;Nat20&lt;/script&gt;</p>");
  assert.match(createdMessages[1].content, /<strong>&lt;script&gt;Nat20&lt;\/script&gt;<\/strong>/);

  await executeMatch({ trigger, event, actions: [], executionMode: "gm-whisper-log" });
  assert.equal(createdMessages.at(-1).content, "<div><strong>&lt;script&gt;Nat20&lt;/script&gt;</strong>: 1d20&lt;script&gt; = 20</div>");

  const originalConfirm = Dialog.confirm;
  let dialogContent = "";
  Dialog.confirm = async ({ content }) => {
    dialogContent = content;
    return false;
  };
  await confirmExecution({ trigger, event, actions: [{ type: "<img>" }] });
  Dialog.confirm = originalConfirm;

  assert.match(dialogContent, /&lt;script&gt;Nat20&lt;\/script&gt;/);
  assert.match(dialogContent, /&lt;b&gt;Hero&lt;\/b&gt;/);
  assert.match(dialogContent, /<li>&lt;img&gt;<\/li>/);
  assert.doesNotMatch(dialogContent, /<script>|<b>Hero/);
});

test("resolveActionVisibility keeps private and blind rolls private with respect private rolls", () => {
  const match = (visibility, visibilityMode) => ({ trigger: { visibilityMode }, event: { visibility } });

  // Setting off or a public roll: the action's own visibility applies.
  assert.equal(resolveActionVisibility("public", match("blind"), {}), "public");
  assert.equal(resolveActionVisibility("public", match("public"), { respectPrivateRolls: true }), "public");

  // Private, self and blind rolls turn public output into a GM whisper.
  for (const rollVisibility of ["gm-private", "self", "blind"]) {
    assert.equal(resolveActionVisibility("public", match(rollVisibility), { respectPrivateRolls: true }), "gm");
  }

  // Whispers to the roller stay for private rolls, blind rolls never reach players.
  assert.equal(resolveActionVisibility("player", match("gm-private"), { respectPrivateRolls: true }), "player");
  assert.equal(resolveActionVisibility("player", match("blind"), { respectPrivateRolls: true }), "gm");
  assert.equal(resolveActionVisibility("custom", match("blind"), { respectPrivateRolls: true }), "gm");

  // Any visibilityMode other than "inherit" uses the action's visibility.
  assert.equal(resolveActionVisibility("public", match("blind", "action"), { respectPrivateRolls: true }), "public");
});

test("executeMatch applies the inherited roll privacy to chat actions", async () => {
  createdMessages.length = 0;

  await executeMatch({
    trigger: { id: "blind", name: "Blind" },
    event: { userId: "u1", visibility: "blind", formula: "1d20", total: 20 },
    actions: [
      { type: "chat-message", template: "Secret", visibility: "public" },
      { type: "chat-message", template: "To player", visibility: "player" }
    ],
    executionMode: "automatic"
  }, { allowDeferred: false, respectPrivateRolls: true });

  assert.deepEqual(createdMessages.map((message) => message.whisper), [["gm-1"], ["gm-1"]]);
});
test("confirmExecution uses DialogV2 when available and treats closing as no", async () => {
  const previousFoundry = globalThis.foundry;
  const calls = [];
  let answer = true;
  globalThis.foundry = {
    ...previousFoundry,
    applications: { api: { DialogV2: { async confirm(options) { calls.push(options); return answer; } } } }
  };
  const match = { trigger: { name: "T" }, event: { actorName: "A", formula: "1d20", total: 20 }, actions: [] };
  try {
    assert.equal(await confirmExecution(match), true);
    answer = null;
    assert.equal(await confirmExecution(match), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].window.title, "SRT.Dialog.ConfirmTitle");
    assert.equal(calls[0].rejectClose, false);
  } finally {
    globalThis.foundry = previousFoundry;
  }
});
