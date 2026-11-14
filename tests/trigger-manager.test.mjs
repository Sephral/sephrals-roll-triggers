import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.game = {
  i18n: {
    localize(key) {
      return key;
    },
    format(key, data) {
      return `${key}:${JSON.stringify(data)}`;
    },
    lang: "en"
  },
  world: {
    id: "test-world",
    title: "Test World"
  },
  scenes: [{ id: "scene-a", name: "Scene A", uuid: "Scene.scene-a" }],
  actors: [{ id: "actor-a", name: "Actor A", uuid: "Actor.actor-a" }],
  items: [{ id: "item-a", name: "Item A", uuid: "Item.item-a" }],
  tables: [{ id: "table-a", name: "Table A", uuid: "RollTable.table-a" }],
  macros: [{ id: "macro-a", name: "Macro A", uuid: "Macro.macro-a" }],
  journal: [{ id: "journal-a", name: "Journal A", uuid: "JournalEntry.journal-a" }]
};

globalThis.foundry = {
  utils: {
    randomID() {
      return "generated-id";
    },
    escapeHTML(value) {
      return String(value);
    }
  }
};

globalThis.FormApplication = class {};
globalThis.HTMLElement = class HTMLElement {};

const __test__ = await import("../scripts/trigger-data.js");

test("normalizeCommaList and getCollectionEntries normalize common input shapes", () => {
  assert.deepEqual(__test__.normalizeCommaList(" one, two ,, three "), ["one", "two", "three"]);
  assert.deepEqual(__test__.getCollectionEntries(null), []);
  assert.deepEqual(__test__.getCollectionEntries({ contents: [{ id: "x" }] }), [{ id: "x" }]);
  assert.deepEqual(__test__.getCollectionEntries(new Map([["a", { id: "a" }]])), [{ id: "a" }]);
});

test("normalizeTrigger keeps core fields and chat action", () => {
  const trigger = __test__.normalizeTrigger({
    id: "nat20",
    name: "Natural 20",
    priority: "250",
    executionMode: "automatic",
    match: { type: "die-max", faces: "20", threshold: "18", minCount: "1" },
    filters: { rollType: ["attack", "save"], actorType: ["pc"], visibility: ["public"], combatState: "in-combat" },
    actions: [{ type: "chat-message", template: "Critical!", visibility: "public" }]
  });

  assert.equal(trigger.id, "nat20");
  assert.equal(trigger.priority, 250);
  assert.equal(trigger.match.faces, 20);
  assert.equal(trigger.match.threshold, null);
  assert.deepEqual(trigger.filters.rollType, ["attack", "save"]);
  assert.deepEqual(trigger.filters.actorType, ["pc"]);
  assert.deepEqual(trigger.filters.visibility, ["public"]);
  assert.equal(trigger.filters.combatState, "in-combat");
  assert.deepEqual(trigger.actions, [{ type: "chat-message", template: "Critical!", visibility: "public" }]);
});

test("normalizeTrigger preserves multiple actions and drops incomplete entries", () => {
  const trigger = __test__.normalizeTrigger({
    id: "combo",
    name: "Combo Trigger",
    actions: [
      { type: "chat-message", template: "First action", visibility: "public" },
      { type: "roll-table", tables: ["crit-table"], visibility: "gm" },
      { type: "chat-message", template: "   ", visibility: "public" }
    ]
  });

  assert.deepEqual(trigger.actions, [
    { type: "chat-message", template: "First action", visibility: "public" },
    { type: "roll-table", tables: ["crit-table"], visibility: "gm" }
  ]);
});

test("buildEditableActions pads action slots for the editor", () => {
  const actions = __test__.buildEditableActions([
    { type: "chat-message", template: "One", visibility: "public" }
  ]);

  assert.equal(actions.length, __test__.MAX_ACTION_SLOTS);
  assert.equal(actions[0].type, "chat-message");
  assert.equal(actions[1].type, "none");
  assert.equal(actions[1].visibility, "public");
});

test("normalizeAction preserves explicit action visibility", () => {
  assert.deepEqual(
    __test__.normalizeAction({ type: "chat-message", template: "Warn", visibility: "player" }),
    { type: "chat-message", template: "Warn", visibility: "player" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "roll-table", tables: ["crit-table"], visibility: "gm" }),
    { type: "roll-table", tables: ["crit-table"], visibility: "gm" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "macro", macro: "macro-1" }),
    { type: "macro", macro: "macro-1" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "journal-link", journal: "journal-1", template: "", visibility: "player" }),
    { type: "journal-link", journal: "journal-1", template: "", visibility: "player" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "gm-note", template: "GM only" }),
    { type: "gm-note", template: "GM only" }
  );
});

test("normalizeAction falls back to message and table fields when the primary field is empty", () => {
  assert.deepEqual(
    __test__.normalizeAction({ type: "chat-message", template: "", message: "Legacy text" }),
    { type: "chat-message", template: "Legacy text", visibility: "public" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "gm-note", template: "", message: "Legacy note" }),
    { type: "gm-note", template: "Legacy note" }
  );
  assert.deepEqual(
    __test__.normalizeAction({ type: "roll-table", tables: [], table: "crit-table" }),
    { type: "roll-table", tables: ["crit-table"], visibility: "gm" }
  );
  assert.equal(__test__.normalizeAction({ type: "roll-table", tables: [], table: "" }), null);
});

test("presentTrigger summarizes action types with visibility", () => {
  const presented = __test__.presentTrigger(__test__.normalizeTrigger({
    id: "combo",
    name: "Combo",
    actions: [
      { type: "chat-message", template: "Warn", visibility: "player" },
      { type: "roll-table", tables: ["crit-table"], visibility: "gm" }
    ]
  }));

  assert.equal(presented.actionLabel, "SRT.Action.ChatMessage (SRT.Visibility.Player) + SRT.Action.RollTable (SRT.Visibility.Gm)");
});

test("getReferenceChoices exposes ids, names, and uuids from collections", () => {
  assert.deepEqual(__test__.getReferenceChoices("scene"), ["scene-a", "Scene A", "Scene.scene-a"]);
  assert.deepEqual(__test__.getReferenceChoices("table"), ["table-a", "Table A", "RollTable.table-a"]);
  assert.deepEqual(__test__.getReferenceChoices("macro"), ["macro-a", "Macro A", "Macro.macro-a"]);
});

test("reference collections support Foundry aliases for tables and journals", () => {
  assert.equal(__test__.getReferenceCollection("table"), game.tables);
  assert.equal(__test__.getReferenceCollection("journal"), game.journal);

  const originalJournal = game.journal;
  game.journal = null;
  game.journalEntries = [{ id: "journal-b", name: "Journal B", uuid: "JournalEntry.journal-b" }];
  assert.deepEqual(__test__.getReferenceSelectChoices("journal"), {
    "journal-b": "Journal B (journal-b)"
  });
  game.journal = originalJournal;
  delete game.journalEntries;
});

test("reference filter fields format as Name (ID) and parse back to ids", () => {
  assert.equal(__test__.formatReferenceValue("scene", "scene-a"), "Scene A (scene-a)");
  assert.equal(__test__.formatReferenceList("actor", ["actor-a"]), "Actor A (actor-a)");
  assert.equal(__test__.parseReferenceToken("scene", "Scene A (scene-a)"), "scene-a");
  assert.deepEqual(__test__.parseReferenceList("item", "Item A (item-a), missing-value"), ["item-a", "missing-value"]);
});

test("reference select choices expose normal combobox labels and selected ids", () => {
  assert.deepEqual(__test__.getReferenceSelectChoices("scene", ["scene-a"]), {
    "scene-a": "Scene A (scene-a)"
  });
  assert.deepEqual(__test__.getReferenceSelectChoices("table", ["table-a"]), {
    "table-a": "Table A (table-a)"
  });
  assert.equal(__test__.getSelectedReferenceValue(["scene-a", "scene-b"]), "scene-a");
  assert.equal(__test__.getSelectedReferenceValue(""), "");
});

test("filter select helpers keep known labels and preserve unknown selected values", () => {
  assert.equal(__test__.getSelectedFilterValue(["attack", "damage"], "any"), "attack");
  assert.deepEqual(__test__.getSelectedFilterValues(["attack", "damage"], ["any"]), ["attack", "damage"]);
  assert.deepEqual(__test__.getSelectedFilterValues([], ["any"]), ["any"]);
  assert.deepEqual(__test__.getSelectChoices({ any: "Any", attack: "Attack" }, ["custom-type"]), {
    any: "Any",
    attack: "Attack",
    "custom-type": "custom-type"
  });
});

test("getActionFieldState matches action-specific editor fields", () => {
  assert.deepEqual(__test__.getActionFieldState("chat-message"), {
    visibility: true,
    template: true,
    tables: false,
    macro: false,
    journal: false
  });
  assert.deepEqual(__test__.getActionFieldState("macro"), {
    visibility: false,
    template: false,
    tables: false,
    macro: true,
    journal: false
  });
});

test("getMatchFieldState matches the selected match type", () => {
  assert.deepEqual(__test__.getMatchFieldState("die-value"), {
    faces: true,
    value: true,
    threshold: false,
    minCount: false,
    degree: false,
    path: false,
    expression: false
  });
  assert.deepEqual(__test__.getMatchFieldState("custom-js"), {
    faces: false,
    value: false,
    threshold: false,
    minCount: false,
    degree: false,
    path: false,
    expression: true
  });
});

test("filter detail state follows broad filter selections", () => {
  assert.deepEqual(__test__.getFilterDetailState({ actorType: "any", rollType: "any" }), {
    scene: true,
    actor: false,
    item: false
  });
  assert.deepEqual(__test__.getFilterDetailState({ actorType: "npc", rollType: "attack" }), {
    scene: true,
    actor: true,
    item: true
  });
  assert.deepEqual(__test__.getFilterDetailState({ actorType: ["pc", "npc"], rollType: ["initiative", "skill"] }), {
    scene: true,
    actor: true,
    item: true
  });
});

test("the item filter lists the items of the chosen actors before the sidebar items", () => {
  const previousActors = game.actors;
  const items = [{ id: "sword-1", name: "Longsword" }, { id: "fist-1", name: "Unarmed Strike" }];
  game.actors = [
    { id: "actor-a", name: "Actor A", uuid: "Actor.actor-a" },
    { id: "syr", name: "Syr Jonabread", uuid: "Actor.syr", items: Object.assign([...items], { get: (id) => items.find((item) => item.id === id) }) }
  ];
  try {
    assert.deepEqual(Object.entries(__test__.getItemSelectChoices(["syr"], [])), [
      ["sword-1", "Syr Jonabread: Longsword"],
      ["fist-1", "Syr Jonabread: Unarmed Strike"],
      ["item-a", "Item A (item-a)"]
    ]);
    // Without the actor the sidebar items remain, a picked item of the actor keeps its name.
    assert.deepEqual(Object.entries(__test__.getItemSelectChoices([], ["sword-1"])), [
      ["item-a", "Item A (item-a)"],
      ["sword-1", "Syr Jonabread: Longsword"]
    ]);
  } finally {
    game.actors = previousActors;
  }
});

test("normalizeTrigger keeps advanced filter settings", () => {
  const trigger = __test__.normalizeTrigger({
    id: "filtered",
    name: "Filtered",
    filters: {
      rollType: ["attack"],
      actorType: ["npc"],
      visibility: ["blind", "gm-private"],
      combatState: "out-of-combat",
      exactDiceCountByFaces: { 100: 1, 20: 2 },
      includeScenes: ["scene-a"],
      includeActors: ["actor-a"],
      includeItems: ["item-a"],
      playerOnly: true,
      gmOnly: false,
      users: ["user-a"]
    }
  });

  assert.deepEqual(trigger.filters, {
    rollType: ["attack"],
    actorType: ["npc"],
    visibility: ["blind", "gm-private"],
    combatState: "out-of-combat",
    exactDiceCountByFaces: { 20: 2, 100: 1 },
    includeScenes: ["scene-a"],
    includeActors: ["actor-a"],
    includeItems: ["item-a"],
    playerOnly: true,
    gmOnly: false,
    users: ["user-a"]
  });
});

test("internal presets are hidden when the setting is off, imported profiles stay", () => {
  const profiles = [{ id: "a", source: "internal-preset" }, { id: "b", source: "imported" }, { id: "c" }];
  assert.deepEqual(__test__.getVisibleProfiles(profiles, true).map((profile) => profile.id), ["a", "b", "c"]);
  assert.deepEqual(__test__.getVisibleProfiles(profiles, false).map((profile) => profile.id), ["b", "c"]);
  assert.deepEqual(__test__.getVisibleProfiles(null, false), []);
});

test("describeFilters includes advanced filter hints", () => {
  assert.equal(
    __test__.describeFilters({
      rollType: ["attack"],
      actorType: ["pc"],
      visibility: ["public"],
      combatState: "in-combat",
      includeScenes: ["scene-a"],
      gmOnly: true
    }),
    "SRT.RollType.Attack | SRT.ActorType.Pc | SRT.Visibility.Public | SRT.CombatState.InCombat | SRT.Manager.FilterGmOnly | SRT.Manager.FilterScenes 1"
  );
});

test("normalizeTrigger keeps only fields relevant to the selected match type", () => {
  const trigger = __test__.normalizeTrigger({
    id: "advanced",
    name: "Advanced",
    match: {
      type: "custom-js",
      faces: "6",
      value: "2",
      threshold: "5",
      minCount: "3",
      degree: "criticalSuccess",
      path: "dnd5e.critical",
      expression: "event.total >= 18"
    }
  });

  assert.deepEqual(trigger.match, {
    type: "custom-js",
    faces: null,
    value: null,
    threshold: null,
    minCount: 1,
    degree: null,
    path: null,
    expression: "event.total >= 18",
    enabled: false
  });
});

test("describeMatch includes only visible fields for the selected match type", () => {
  assert.equal(
    __test__.describeMatch({
      type: "die-max",
      faces: 2,
      value: 20,
      threshold: 15,
      minCount: 3
    }),
    "SRT.Match.DieMax | d2"
  );
  assert.equal(
    __test__.describeMatch({
      type: "total-above",
      threshold: 17,
      degree: "criticalSuccess",
      path: "dnd5e.critical",
      expression: "event.total >= 18"
    }),
    "SRT.Match.TotalAbove | 17"
  );
  assert.equal(
    __test__.describeMatch({ type: "custom-js", expression: "event.total >= 18", threshold: 17 }),
    "SRT.Match.CustomJs | event.total >= 18"
  );
});

test("cloneProfileTrigger generates stable imported ids", () => {
  const imported = __test__.cloneProfileTrigger(
    { id: "dnd5e-core" },
    { id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 } }
  );

  assert.equal(imported.id, "dnd5e-core.nat20");
  assert.equal(imported.source, "internal-profile:dnd5e-core");
  assert.equal(imported.match.type, "die-max");
});

test("normalizeProfile and presentProfile preserve profile defaults and source labels", () => {
  const profile = __test__.normalizeProfile({
    id: "profile-a",
    name: "Profile A",
    triggers: [{ id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 } }]
  }, {
    systemId: "fallback-system"
  });

  assert.equal(profile.systemId, "fallback-system");
  assert.equal(profile.source, "imported");
  assert.equal(profile.triggers[0].source, "profile:profile-a");
  assert.equal(__test__.presentProfile({ source: "internal-preset" }).sourceLabel, "SRT.Manager.ProfileSourceInternal");
  assert.equal(__test__.presentProfile({ source: "imported" }).sourceLabel, "SRT.Manager.ProfileSourceImported");
});

test("buildTriggerExportPayload includes normalized triggers and world metadata", () => {
  const payload = __test__.buildTriggerExportPayload([
    { id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 } }
  ]);

  assert.equal(payload.module, "sephrals-roll-triggers");
  assert.equal(payload.formatVersion, __test__.EXPORT_FORMAT_VERSION);
  assert.equal(payload.worldId, "test-world");
  assert.equal(payload.triggers[0].id, "nat20");
  assert.equal(payload.triggers[0].match.faces, 20);
});

test("parseImportedTriggerPayload rejects invalid payloads", () => {
  assert.throws(() => __test__.parseImportedTriggerPayload({ triggers: [] }), /SRT.Import.Invalid/);
});

test("mergeImportedTriggers replaces matching ids and adds new triggers", () => {
  const result = __test__.mergeImportedTriggers(
    [{ id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 }, priority: 100 }],
    [
      {
        id: "nat20",
        name: "Natural 20",
        match: { type: "die-max", faces: 20, minCount: 1 },
        priority: 300,
        actions: [
          { type: "chat-message", template: "Crit!", visibility: "public" },
          { type: "roll-table", tables: ["crit-table"], visibility: "gm" }
        ]
      },
      { id: "nat1", name: "Natural 1", match: { type: "die-min", faces: 20, minCount: 1 } }
    ]
  );

  assert.equal(result.added, 1);
  assert.equal(result.replaced, 1);
  assert.equal(result.triggers.length, 2);
  assert.equal(result.triggers[0].priority, 300);
  assert.equal(result.triggers[0].actions.length, 2);
});

test("buildProfileExportPayload includes profile metadata", () => {
  const payload = __test__.buildProfileExportPayload([
    {
      id: "profile-1",
      name: "Profile One",
      systemId: "dnd5e",
      triggers: [{ id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 } }]
    }
  ]);

  assert.equal(payload.module, "sephrals-roll-triggers");
  assert.equal(payload.payloadType, "profiles");
  assert.equal(payload.formatVersion, __test__.PROFILE_EXPORT_FORMAT_VERSION);
  assert.equal(payload.profiles[0].triggers[0].id, "nat20");
});

test("parseImportedProfilePayload rejects invalid payloads", () => {
  assert.throws(() => __test__.parseImportedProfilePayload({ profiles: [] }), /SRT.Import.InvalidProfiles/);
});

test("mergeImportedProfiles replaces matching ids and adds new profiles", () => {
  const result = __test__.mergeImportedProfiles(
    [{ id: "profile-1", name: "Profile One", systemId: "dnd5e", triggers: [{ id: "nat20", name: "Natural 20" }] }],
    [
      { id: "profile-1", name: "Profile One", systemId: "dnd5e", triggers: [{ id: "nat20", name: "Updated" }] },
      { id: "profile-2", name: "Profile Two", systemId: "pf2e", triggers: [{ id: "nat1", name: "Natural 1" }] }
    ]
  );

  assert.equal(result.added, 1);
  assert.equal(result.replaced, 1);
  assert.equal(result.profiles.length, 2);
  assert.equal(result.profiles[0].triggers[0].name, "Updated");
});

test("normalizeTrigger normalizes extra AND conditions and defaults to an empty list", () => {
  assert.deepEqual(__test__.normalizeTrigger({ id: "legacy", name: "Legacy" }).extraMatches, []);
  assert.deepEqual(__test__.normalizeTrigger({ id: "bad", name: "Bad", extraMatches: "die-value" }).extraMatches, []);

  const trigger = __test__.normalizeTrigger({
    id: "and",
    name: "And",
    match: { type: "die-value", value: "1" },
    extraMatches: [
      { type: "die-value", faces: "6", value: "2", threshold: "9", expression: "ignored" },
      null,
      ["not", "a", "match"],
      { type: "total-above", threshold: "10", faces: "6" }
    ]
  });

  assert.deepEqual(trigger.extraMatches, [
    { type: "die-value", faces: 6, value: 2, threshold: null, minCount: 1, degree: null, path: null, expression: null, enabled: false },
    { type: "total-above", faces: null, value: null, threshold: 10, minCount: 1, degree: null, path: null, expression: null, enabled: false }
  ]);
  assert.equal(trigger.match.value, 1);
});

test("trigger export includes extra conditions and imports without them keep working", () => {
  const payload = __test__.buildTriggerExportPayload([
    { id: "nat20", name: "Natural 20", match: { type: "die-max", faces: 20, minCount: 1 } },
    { id: "and", name: "And", match: { type: "die-value", value: 1 }, extraMatches: [{ type: "die-value", value: 2 }] }
  ]);

  assert.deepEqual(payload.triggers[0].extraMatches, []);
  assert.equal(payload.triggers[1].extraMatches.length, 1);
  assert.equal(payload.triggers[1].extraMatches[0].value, 2);

  const roundTrip = __test__.parseImportedTriggerPayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(roundTrip[1].extraMatches, payload.triggers[1].extraMatches);

  const legacyImport = __test__.parseImportedTriggerPayload({
    module: "sephrals-roll-triggers",
    formatVersion: 1,
    triggers: [{ id: "old", name: "Old export", match: { type: "die-min", faces: 20, minCount: 1 } }]
  });
  assert.deepEqual(legacyImport[0].extraMatches, []);
  assert.equal(legacyImport[0].match.type, "die-min");

  const merged = __test__.mergeImportedTriggers(
    [{ id: "and", name: "And", match: { type: "die-value", value: 1 } }],
    roundTrip
  );
  assert.equal(merged.replaced, 1);
  assert.equal(merged.triggers.find((trigger) => trigger.id === "and").extraMatches[0].value, 2);
});

test("profiles and profile clones keep extra conditions", () => {
  const profile = __test__.normalizeProfile({
    id: "swade",
    name: "Savage Worlds",
    triggers: [{ id: "one-two", name: "One and two", match: { type: "die-value", value: 1 }, extraMatches: [{ type: "die-value", value: 2 }] }]
  });

  assert.equal(profile.triggers[0].extraMatches[0].value, 2);
  assert.equal(__test__.buildProfileExportPayload([profile]).profiles[0].triggers[0].extraMatches[0].value, 2);
  assert.equal(__test__.cloneProfileTrigger(profile, profile.triggers[0]).extraMatches[0].value, 2);
  assert.deepEqual(__test__.normalizeProfile({ id: "p", name: "P", triggers: [{ id: "t", name: "T" }] }).triggers[0].extraMatches, []);
});

test("trigger summary joins all conditions with the localized AND", () => {
  const single = __test__.normalizeTrigger({ id: "single", name: "Single", match: { type: "die-max", faces: 20 } });
  assert.equal(__test__.describeTriggerMatches(single), "SRT.Match.DieMax | d20");
  assert.equal(__test__.presentTrigger(single).matchLabel, "SRT.Match.DieMax | d20");

  const combined = __test__.normalizeTrigger({
    id: "combined",
    name: "Combined",
    match: { type: "die-value", value: 1 },
    extraMatches: [{ type: "die-value", faces: 6, value: 2 }, { type: "total-above", threshold: 2 }]
  });
  assert.equal(
    __test__.presentTrigger(combined).matchLabel,
    "SRT.Match.DieValue | 1 SRT.Manager.MatchAnd SRT.Match.DieValue | d6 | 2 SRT.Manager.MatchAnd SRT.Match.TotalAbove | 2"
  );
});

