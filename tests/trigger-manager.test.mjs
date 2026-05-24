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

const { __test__ } = await import("../scripts/trigger-manager.js");

test("normalizeCommaList and getCollectionEntries normalize common input shapes", () => {
  assert.deepEqual(__test__.normalizeCommaList(" one, two ,, three "), ["one", "two", "three"]);
  assert.deepEqual(__test__.getCollectionEntries(null), []);
  assert.deepEqual(__test__.getCollectionEntries({ contents: [{ id: "x" }] }), [{ id: "x" }]);
  assert.deepEqual(__test__.getCollectionEntries(new Map([["a", { id: "a" }]])), [{ id: "a" }]);
});

test("buildDatalistOptions escapes values for dialog datalists", () => {
  assert.equal(
    __test__.buildDatalistOptions(["Scene A", "Actor <B>"]),
    '<option value="Scene A"></option><option value="Actor <B>"></option>'
  );
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

test("applyManagerTheme sets root and app theme attributes", () => {
  const state = { foundry: false, signature: false };
  const appRoot = { dataset: {} };
  const host = {
    dataset: {},
    classList: {
      toggle(name, active) {
        if (name === "is-theme-foundry") state.foundry = active;
        if (name === "is-theme-signature") state.signature = active;
      }
    },
    querySelector(selector) {
      return selector === ".srt-app" ? appRoot : null;
    }
  };

  __test__.applyManagerTheme(host, "foundry");

  assert.equal(host.dataset.uiTheme, "foundry");
  assert.equal(appRoot.dataset.uiTheme, "foundry");
  assert.equal(state.foundry, true);
  assert.equal(state.signature, false);
});

test("manager template is driven by prelocalized strings", () => {
  const template = readFileSync(new URL("../templates/trigger-manager.html", import.meta.url), "utf8");

  assert.equal(template.includes("{{localize \"SRT."), false);
  assert.equal(__test__.getManagerTemplateStrings().title, "SRT.Manager.Title");
  assert.equal(template.includes("<strong>{{strings.execution}}</strong>"), false);
  assert.equal(template.includes("srt-card-meta-label"), true);
  assert.equal(template.includes("srt-inline-action__label"), true);
  assert.equal(template.includes("{{../strings.execution}}"), true);
  assert.equal(template.includes("{{../strings.edit}}"), true);
  assert.equal(template.includes("{{../strings.systemLabel}}"), true);
  assert.equal(template.includes("{{../strings.importProfile}}"), true);
});

test("resolveDialogRoot accepts raw elements, jquery-like wrappers, and form containers", () => {
  const root = new HTMLElement();
  const wrapperRoot = new HTMLElement();
  const formRoot = new HTMLElement();
  const form = new HTMLElement();
  form.closest = () => formRoot;

  assert.equal(__test__.resolveDialogRoot(root), root);
  assert.equal(__test__.resolveDialogRoot([wrapperRoot]), wrapperRoot);
  assert.equal(__test__.resolveDialogRoot({ element: [wrapperRoot] }), wrapperRoot);
  assert.equal(__test__.resolveDialogRoot({ form }), formRoot);
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

test("buildSelectOptions marks multiple selected values", () => {
  assert.equal(
    __test__.buildSelectOptions({ attack: "Attack", skill: "Skill", check: "Check" }, ["skill", "check"]),
    '<option value="attack" >Attack</option><option value="skill" selected>Skill</option><option value="check" selected>Check</option>'
  );
});

test("getMultiSelectSummaryLabel uses selected option labels or the empty fallback", () => {
  assert.equal(
    __test__.getMultiSelectSummaryLabel({
      selectedOptions: [
        { textContent: "Skill" },
        { textContent: "Check" }
      ],
      dataset: { srtEmptyLabel: "Any roll type" }
    }),
    "Skill, Check"
  );

  assert.equal(
    __test__.getMultiSelectSummaryLabel({
      selectedOptions: [],
      dataset: { srtEmptyLabel: "Any roll type" }
    }),
    "Any roll type"
  );
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

test("applyActionFieldState hides unrelated editor sections", () => {
  const sections = [
    { dataset: { srtActionField: "visibility" }, hidden: false },
    { dataset: { srtActionField: "template" }, hidden: false },
    { dataset: { srtActionField: "macro" }, hidden: false }
  ];
  const container = {
    querySelectorAll() {
      return sections;
    }
  };

  __test__.applyActionFieldState(container, "macro");

  assert.equal(sections[0].hidden, true);
  assert.equal(sections[1].hidden, true);
  assert.equal(sections[2].hidden, false);
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

test("applyMatchFieldState hides unrelated match inputs", () => {
  const sections = [
    { dataset: { srtMatchField: "faces" }, hidden: false },
    { dataset: { srtMatchField: "threshold" }, hidden: false },
    { dataset: { srtMatchField: "expression" }, hidden: false }
  ];
  const root = {
    querySelectorAll() {
      return sections;
    }
  };

  __test__.applyMatchFieldState(root, "total-above");

  assert.equal(sections[0].hidden, true);
  assert.equal(sections[1].hidden, false);
  assert.equal(sections[2].hidden, true);
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

test("applyFilterDetailState hides irrelevant detail filters", () => {
  const sections = [
    { dataset: { srtFilterDetail: "scene" }, hidden: false },
    { dataset: { srtFilterDetail: "actor" }, hidden: false },
    { dataset: { srtFilterDetail: "item" }, hidden: false }
  ];
  const root = {
    querySelector(selector) {
      if (selector === 'select[name="triggerRollTypes"]') return { value: ["initiative", "skill"] };
      if (selector === 'select[name="triggerActorTypes"]') return { value: ["any"] };
      return null;
    },
    querySelectorAll() {
      return sections;
    }
  };

  __test__.applyFilterDetailState(root);

  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
  assert.equal(sections[2].hidden, false);
});

test("configureTriggerDialog wires select change handlers and applies initial state", () => {
  const sections = [
    { dataset: { srtActionField: "visibility" }, hidden: false },
    { dataset: { srtActionField: "template" }, hidden: false },
    { dataset: { srtActionField: "macro" }, hidden: false }
  ];
  const select = {
    value: "chat-message",
    handler: null,
    addEventListener(_event, handler) {
      this.handler = handler;
    }
  };
  const actionContainer = {
    querySelector(selector) {
      return selector === "[data-srt-action-type]" ? select : null;
    },
    querySelectorAll() {
      return sections;
    }
  };
  const rollTypeSelect = {
    name: "triggerRollTypes",
    value: ["skill", "check"],
    selectedOptions: [{ textContent: "Skill" }, { textContent: "Check" }],
    handlers: [],
    addEventListener(_event, handler) {
      this.handlers.push(handler);
    }
  };
  const rollTypeSummary = { dataset: { srtMultiselectSummary: "triggerRollTypes" }, textContent: "" };
  const root = new HTMLElement();
  root.querySelector = (selector) => {
    if (selector === 'select[name="triggerRollTypes"]') return rollTypeSelect;
    if (selector === '[data-srt-multiselect-summary="triggerRollTypes"]') return rollTypeSummary;
    return null;
  };
  root.querySelectorAll = (selector) => {
    if (selector === "[data-srt-action-config]") return [actionContainer];
    if (selector === 'select[name="triggerRollTypes"], select[name="triggerActorTypes"]') return [rollTypeSelect];
    if (selector === "select[multiple]") return [rollTypeSelect];
    if (selector === "[data-srt-multiselect-summary]") return [rollTypeSummary];
    return [];
  };

  __test__.configureTriggerDialog(root);
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[2].hidden, true);
  assert.equal(rollTypeSummary.textContent, "Skill, Check");

  select.value = "macro";
  select.handler();
  assert.equal(sections[0].hidden, true);
  assert.equal(sections[1].hidden, true);
  assert.equal(sections[2].hidden, false);
});

test("configureTriggerDialog wires match select change handlers and applies initial state", () => {
  const sections = [
    { dataset: { srtMatchField: "faces" }, hidden: false },
    { dataset: { srtMatchField: "threshold" }, hidden: false },
    { dataset: { srtMatchField: "expression" }, hidden: false }
  ];
  const matchSelect = {
    value: "die-max",
    handler: null,
    addEventListener(_event, handler) {
      this.handler = handler;
    }
  };
  const root = new HTMLElement();
  root.querySelector = (selector) => selector === 'select[name="triggerMatchType"]' ? matchSelect : null;
  root.querySelectorAll = (selector) => {
    if (selector === "[data-srt-action-config]") return [];
    if (selector === "[data-srt-dialog-tab]") return [];
    if (selector === "[data-srt-dialog-panel]") return [];
    if (selector === "[data-srt-match-field]") return sections;
    return [];
  };

  __test__.configureTriggerDialog(root);
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
  assert.equal(sections[2].hidden, true);

  matchSelect.value = "custom-js";
  matchSelect.handler();
  assert.equal(sections[0].hidden, true);
  assert.equal(sections[1].hidden, true);
  assert.equal(sections[2].hidden, false);
});

test("configureTriggerDialog activates trigger dialog tabs and toggles panels", () => {
  const tabButtons = [
    createTabButton("general"),
    createTabButton("match"),
    createTabButton("filters")
  ];
  const panels = [
    createTabPanel("general"),
    createTabPanel("match"),
    createTabPanel("filters")
  ];
  const root = new HTMLElement();
  root.querySelector = (selector) => selector === "[data-srt-dialog-tab]" ? tabButtons[0] : null;
  root.querySelectorAll = (selector) => {
    if (selector === "[data-srt-dialog-tab]") return tabButtons;
    if (selector === "[data-srt-dialog-panel]") return panels;
    if (selector === "[data-srt-action-config]") return [];
    return [];
  };

  __test__.configureTriggerDialog(root);

  assert.equal(tabButtons[0].attributes["aria-selected"], "true");
  assert.equal(tabButtons[1].attributes["aria-selected"], "false");
  assert.equal(panels[0].hidden, false);
  assert.equal(panels[1].hidden, true);

  tabButtons[2].handler();
  assert.equal(tabButtons[2].attributes["aria-selected"], "true");
  assert.equal(tabButtons[2].tabIndex, 0);
  assert.equal(tabButtons[0].tabIndex, -1);
  assert.equal(panels[2].hidden, false);
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[2].classes.has("active"), true);
  assert.equal(panels[0].classes.has("active"), false);
});

test("resizeTriggerDialogToContent clears stale auto-height markers without forcing a new height", () => {
  const wrapper = {
    style: {},
    dataset: { srtAutoHeight: "367px" },
    querySelector(selector) {
      return selector === ".window-content" ? { style: {} } : null;
    }
  };
  const root = {
    closest() {
      return wrapper;
    },
    querySelector() {
      return null;
    }
  };

  __test__.resizeTriggerDialogToContent(root);
  assert.equal(wrapper.style.height, undefined);
  assert.equal(wrapper.dataset.srtAutoHeight, undefined);
});

test("ensureTriggerDialogSize applies the intended default dialog footprint", () => {
  const wrapper = {
    style: {},
    getBoundingClientRect() {
      return { width: 400, height: 328 };
    }
  };
  const root = {
    closest() {
      return wrapper;
    }
  };

  __test__.ensureTriggerDialogSize(root);

  assert.equal(wrapper.style.minWidth, `${__test__.TRIGGER_DIALOG_MIN_WIDTH}px`);
  assert.equal(wrapper.style.minHeight, `${__test__.TRIGGER_DIALOG_MIN_HEIGHT}px`);
  assert.equal(wrapper.style.width, "560px");
  assert.equal(wrapper.style.height, "560px");
});

test("ensureTriggerDialogSize keeps a narrower minimum than the default width", () => {
  const wrapper = {
    style: {},
    getBoundingClientRect() {
      return { width: 520, height: 500 };
    }
  };
  const root = {
    closest() {
      return wrapper;
    }
  };

  __test__.ensureTriggerDialogSize(root);

  assert.equal(wrapper.style.minWidth, "440px");
  assert.equal(wrapper.style.width, "560px");
});

test("calculateTriggerDialogResize follows mouse delta with compact minimums", () => {
  assert.deepEqual(
    __test__.calculateTriggerDialogResize({
      startWidth: 590,
      startHeight: 490,
      startX: 100,
      startY: 100,
      currentX: 101,
      currentY: 101
    }),
    { width: 591, height: 491 }
  );

  assert.deepEqual(
    __test__.calculateTriggerDialogResize({
      startWidth: 590,
      startHeight: 490,
      startX: 100,
      startY: 100,
      currentX: -200,
      currentY: -200
    }),
    { width: __test__.TRIGGER_DIALOG_MIN_WIDTH, height: __test__.TRIGGER_DIALOG_MIN_HEIGHT }
  );
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
      gmOnly: false
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
    gmOnly: false
  });
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

function createTabButton(tabId) {
  const button = {
    dataset: { srtDialogTab: tabId },
    attributes: {},
    classes: new Set(),
    tabIndex: 0,
    active: false,
    handler: null,
    classList: {
      toggle(name, active) {
        if (active) this.owner.classes.add(name);
        else this.owner.classes.delete(name);
        this.owner.active = this.owner.classes.has("active");
      },
      owner: null
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(_event, handler) {
      this.handler = handler;
    }
  };

  button.classList.owner = button;
  return button;
}

function createTabPanel(tabId) {
  const panel = {
    dataset: { srtDialogPanel: tabId },
    classes: new Set(),
    hidden: false,
    active: false,
    classList: {
      toggle(name, active) {
        if (active) this.owner.classes.add(name);
        else this.owner.classes.delete(name);
        this.owner.active = this.owner.classes.has("active");
      },
      owner: null
    }
  };

  panel.classList.owner = panel;
  return panel;
}