import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkbox, FakeElement, input, section, select } from "./fake-dom.mjs";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const de = JSON.parse(readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));

globalThis.game = {
  i18n: { localize: (key) => en[key] ?? key, format: (key, data) => `${key}:${JSON.stringify(data)}`, lang: "en" },
  world: { id: "w", title: "W" },
  scenes: [{ id: "scene-a", name: "Scene A" }],
  actors: [{ id: "actor-a", name: "Actor A", items: [{ id: "sword", name: "Sword" }] }],
  items: [{ id: "item-a", name: "Item A" }],
  tables: [{ id: "table-a", name: "Table A" }],
  macros: [],
  journal: []
};
globalThis.foundry = { utils: { randomID: () => "generated-id", escapeHTML: (value) => String(value) } };
globalThis.CONFIG = { statusEffects: [{ id: "prone", name: "EFFECT.StatusProne" }] };
globalThis.Roll = { validate: (formula) => /^\d*d\d+([+-]\d+)?$/.test(formula) };

const editor = await import("../scripts/trigger-editor.js");
const model = await import("../scripts/editor-model.js");
const data = await import("../scripts/trigger-data.js");

// ---- Field state --------------------------------------------------------------------------------------------------

test("match, extra condition and action fields hide what the choice does not use", () => {
  const sections = ["faces", "threshold", "expression"].map((field) => section({ "data-srt-match-field": field }));
  const root = section({}, sections);
  editor.applyMatchFieldState(root, "total-above");
  assert.deepEqual(sections.map((entry) => entry.hidden), [true, false, true]);

  const extra = ["faces", "value"].map((field) => section({ "data-srt-extra-match-field": field }));
  editor.applyExtraMatchFieldState(section({}, extra), "die-value");
  assert.deepEqual(extra.map((entry) => entry.hidden), [false, false]);
  editor.applyExtraMatchFieldState(section({}, extra), "die-max");
  assert.deepEqual(extra.map((entry) => entry.hidden), [false, true]);

  const fields = ["visibility", "template", "sound", "volume", "status", "macro"].map((field) => section({ "data-srt-action-field": field }));
  editor.applyActionFieldState(section({}, fields), "play-sound");
  assert.deepEqual(fields.map((entry) => entry.hidden), [false, true, false, false, true, true]);
  editor.applyActionFieldState(section({}, fields), "macro");
  assert.deepEqual(fields.map((entry) => entry.hidden), [true, true, true, true, true, false]);
});

test("detail filters follow the broad filter choices", () => {
  const details = ["scene", "actor", "item"].map((detail) => section({ "data-srt-filter-detail": detail }));
  const rollTypes = select("triggerRollTypes", [["any"], ["attack"], ["skill"]], ["any"], { multiple: "" });
  const actorTypes = select("triggerActorTypes", [["any"], ["pc"]], ["any"], { multiple: "" });
  const root = section({}, [rollTypes, actorTypes, ...details]);

  editor.applyFilterDetailState(root);
  assert.deepEqual(details.map((entry) => entry.hidden), [false, true, true]);

  rollTypes.options[0].selected = false;
  rollTypes.options[1].selected = true;
  actorTypes.options[0].selected = false;
  actorTypes.options[1].selected = true;
  editor.applyFilterDetailState(root);
  assert.deepEqual(details.map((entry) => entry.hidden), [false, false, false]);
});

test("a multi select shows what is picked, or its empty text", () => {
  const items = select("triggerIncludeItems", [["a", "Sword"], ["b", "Bow"]], ["a", "b"], { multiple: "", "data-srt-empty-label": "-" });
  const summary = section({ "data-srt-multiselect-summary": "triggerIncludeItems" });
  const root = section({}, [items, summary]);
  assert.equal(editor.getMultiSelectSummaryLabel(items), "Sword, Bow");
  editor.updateMultiSelectSummary(root, "triggerIncludeItems");
  assert.equal(summary.textContent, "Sword, Bow");
  items.options.forEach((option) => { option.selected = false; });
  editor.updateAllMultiSelectSummaries(root);
  assert.equal(summary.textContent, "-");
});

function buildKindRoot(kind = "roll", event = "turn-start") {
  const pieces = {
    kind: select("triggerKind", [["roll"], ["combat"]], kind),
    event: select("triggerCombatEvent", [["turn-start"], ["round-start"], ["combat-start"], ["effect-end"]], event),
    execution: select("triggerExecutionMode", [["automatic"], ["confirm-gm"], ["chat-button"], ["gm-whisper-log"], ["disabled"]], "chat-button"),
    rollOnly: section({ "data-srt-kind-section": "roll" }),
    combatOnly: section({ "data-srt-kind-section": "combat" }),
    rounds: section({ "data-srt-combat-field": "rounds" }),
    effect: section({ "data-srt-combat-field": "effect" }),
    actors: section({ "data-srt-combat-field": "actors" }),
    rollActors: section({ "data-srt-kind-section": "roll", "data-srt-combat-field": "actors" }),
    label: section({ "data-srt-tab-label": "match" })
  };
  return { root: section({}, Object.values(pieces)), ...pieces };
}

test("the kind of a trigger decides which sections show, a combat event which fields", () => {
  const view = buildKindRoot("roll");
  assert.equal(editor.applyKindState(view.root), "roll");
  assert.equal(view.rollOnly.hasAttribute("data-srt-kind-hidden"), false);
  assert.equal(view.combatOnly.hasAttribute("data-srt-kind-hidden"), true);
  assert.equal(view.rounds.hasAttribute("data-srt-kind-hidden"), false);
  assert.equal(view.label.textContent, "SRT.Dialog.TabMatch".replace("SRT.Dialog.TabMatch", en["SRT.Dialog.TabMatch"]));
  assert.equal(view.execution.value, "chat-button");

  view.kind.value = "combat";
  assert.equal(editor.applyKindState(view.root), "combat");
  assert.equal(view.rollOnly.hasAttribute("data-srt-kind-hidden"), true);
  assert.equal(view.combatOnly.hasAttribute("data-srt-kind-hidden"), false);
  assert.equal(view.rounds.hasAttribute("data-srt-kind-hidden"), false);
  assert.equal(view.effect.hasAttribute("data-srt-kind-hidden"), true);
  assert.equal(view.actors.hasAttribute("data-srt-kind-hidden"), false);
  assert.equal(view.rollActors.hasAttribute("data-srt-kind-hidden"), true);
  assert.equal(view.label.textContent, en["SRT.Dialog.TabEvent"]);
  // no chat button for a combat trigger: the option is gone and the choice falls back to asking the GM
  assert.equal(view.execution.options[2].disabled, true);
  assert.equal(view.execution.options[0].disabled, false);
  assert.equal(view.execution.value, "confirm-gm");

  view.event.value = "round-start";
  editor.applyKindState(view.root);
  assert.equal(view.actors.hasAttribute("data-srt-kind-hidden"), true);
  view.event.value = "combat-start";
  editor.applyKindState(view.root);
  assert.equal(view.rounds.hasAttribute("data-srt-kind-hidden"), true);
  view.event.value = "effect-end";
  editor.applyKindState(view.root);
  assert.equal(view.effect.hasAttribute("data-srt-kind-hidden"), false);

  view.kind.value = "roll";
  editor.applyKindState(view.root);
  assert.equal(view.execution.options[2].disabled, false);
  assert.equal(view.combatOnly.hasAttribute("data-srt-kind-hidden"), true);
});

test("the item list follows the chosen actors and keeps picked items", () => {
  const actors = select("triggerIncludeActors", [["actor-a", "Actor A"]], ["actor-a"], { multiple: "" });
  const items = select("triggerIncludeItems", [["item-a", "Item A"]], ["item-a"], { multiple: "" });
  const summary = section({ "data-srt-multiselect-summary": "triggerIncludeItems" });
  const created = [];
  items.ownerDocument = { createElement: (tag) => { const element = new FakeElement(tag); created.push(element); return element; } };
  items.replaceChildren = (...options) => { items.options = options; };
  actors.options[0].selected = true;
  editor.rebuildItemChoices(section({}, [actors, items, summary]));
  const labels = items.options.map((option) => option.textContent);
  assert.ok(labels.includes("Actor A: Sword"));
  assert.ok(labels.includes("Item A (item-a)"));
  assert.equal(items.options.find((option) => option.value === "item-a").selected, true);
  assert.equal(items.options.find((option) => option.value === "sword").selected, false);
});

test("extra conditions are numbered again after one is removed", () => {
  const conditions = [1, 2, 3].map(() => section({ "data-srt-extra-match": "" }, [section({ "data-srt-extra-match-number": "" })]));
  const list = section({}, conditions);
  conditions[1].remove();
  editor.renumberExtraMatchConditions(list);
  assert.deepEqual(list.querySelectorAll("[data-srt-extra-match]").map((condition) => condition.querySelector("[data-srt-extra-match-number]").textContent), ["1", "2"]);
});

test("the file picker opens Foundry's FilePicker and writes the chosen path back", () => {
  const opened = [];
  globalThis.foundry.applications = {
    apps: {
      FilePicker: {
        implementation: class {
          constructor(options) { opened.push(options); this.options = options; }
          render(options) { this.rendered = options; }
        }
      }
    }
  };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  try {
    const field = input("triggerSound0", "old.ogg");
    const events = [];
    field.dispatchEvent = (event) => events.push(event.type);
    const picker = editor.openFilePickerFor(field, "audio");
    assert.equal(opened[0].type, "audio");
    assert.equal(opened[0].current, "old.ogg");
    assert.deepEqual(picker.rendered, { force: true });
    opened[0].callback("sounds/new.ogg");
    assert.equal(field.value, "sounds/new.ogg");
    assert.deepEqual(events, ["change"]);
    assert.equal(editor.openFilePickerFor(null, "audio"), null);
  } finally {
    delete globalThis.foundry.applications;
  }
});

// ---- The form -----------------------------------------------------------------------------------------------------

function buildForm(overrides = {}) {
  const value = (name, fallback = "") => input(name, overrides[name] ?? fallback);
  const slotFields = (index) => [
    select(`triggerActionType${index}`, [["none"], ["chat-message"], ["play-sound"], ["change-resource"], ["roll-formula"]], overrides[`type${index}`] ?? "none"),
    value(`triggerActionVisibility${index}`, "public"), value(`triggerChatTemplate${index}`), value(`triggerTables${index}`), value(`triggerMacro${index}`), value(`triggerJournal${index}`),
    value(`triggerSound${index}`), value(`triggerSoundVolume${index}`), value(`triggerEffectStatus${index}`), value(`triggerEffectUuid${index}`),
    value(`triggerEffectRounds${index}`), value(`triggerEffectTarget${index}`), value(`triggerResourcePath${index}`), value(`triggerResourceOperation${index}`),
    value(`triggerResourceValue${index}`), value(`triggerImage${index}`), value(`triggerImageCaption${index}`), value(`triggerRollFormula${index}`), value(`triggerRollFlavor${index}`)
  ];
  const extra = (overrides.extra ?? []).map((condition) => section({ "data-srt-extra-match": "" }, Object.entries(condition).map(([field, fieldValue]) => {
    const element = new FakeElement("input", { "data-srt-extra-match-input": field });
    element.value = fieldValue;
    return element;
  })));
  return section({}, [
    value("triggerName", "My trigger"), value("triggerDescription"), value("triggerCategory", "house-rule"), value("triggerPriority", "250"),
    select("triggerExecutionMode", [["automatic"], ["confirm-gm"]], overrides.executionMode ?? "automatic"),
    checkbox("triggerOncePerMessage", overrides.oncePerMessage ?? true),
    select("triggerKind", [["roll"], ["combat"]], overrides.kind ?? "roll"),
    select("triggerCombatEvent", [["turn-start"], ["round-start"]], overrides.combatEvent ?? "turn-start"),
    value("triggerCombatRound", overrides.round ?? ""), value("triggerCombatEvery", overrides.every ?? ""), value("triggerCombatEffect"),
    select("triggerMatchType", [["die-max"], ["total-above"]], overrides.matchType ?? "die-max"),
    value("triggerFaces", "20"), value("triggerValue"), value("triggerThreshold"), value("triggerMinCount", "1"), value("triggerDegree"), value("triggerPath"),
    new FakeElement("textarea", { name: "triggerExpression" }),
    ...extra,
    select("triggerRollTypes", [["any"], ["attack"]], overrides.rollTypes ?? [], { multiple: "" }),
    select("triggerActorTypes", [["any"], ["pc"]], [], { multiple: "" }),
    select("triggerVisibilityFilter", [["any"]], [], { multiple: "" }),
    select("triggerCombatState", [["any"], ["in-combat"]], "any"),
    select("triggerIncludeScenes", [["scene-a"]], [], { multiple: "" }),
    select("triggerIncludeActors", [["actor-a"]], [], { multiple: "" }),
    select("triggerIncludeItems", [["sword"]], [], { multiple: "" }),
    checkbox("triggerPlayerOnly", false), checkbox("triggerGmOnly", false),
    ...slotFields(0), ...slotFields(1), ...slotFields(2)
  ]);
}

test("the form is read back into one result, empty multi selects mean any", () => {
  const result = model.readTriggerForm(buildForm({ rollTypes: ["attack"] }));
  assert.equal(result.name, "My trigger");
  assert.equal(result.priority, 250);
  assert.equal(result.kind, "roll");
  assert.equal(result.oncePerMessage, true);
  assert.equal(result.matchType, "die-max");
  assert.equal(result.faces, "20");
  assert.deepEqual(result.rollTypes, ["attack"]);
  assert.deepEqual(result.actorTypes, ["any"]);
  assert.deepEqual(result.includeScenes, []);
  assert.equal(result.actions.length, 3);
  assert.equal(result.actions[0].type, "none");
  assert.deepEqual(model.readTriggerForm(buildForm({ kind: "combat", combatEvent: "round-start", round: "2", every: "3" })).combatEvery, "3");
});

test("extra conditions are read in order", () => {
  const result = model.readTriggerForm(buildForm({ extra: [{ type: "total-below", threshold: "4" }, { type: "die-value", value: "2", minCount: "" }] }));
  assert.deepEqual(result.extraMatches.map((match) => [match.type, match.threshold, match.value, match.minCount]), [["total-below", "4", "", "1"], ["die-value", "", "2", "1"]]);
});

test("the sound volume is read in percent and stored as 0 to 1", () => {
  const form = buildForm({ type0: "play-sound", triggerSound0: "a.ogg", triggerSoundVolume0: "50" });
  const result = model.readTriggerForm(form);
  assert.equal(result.actions[0].sound, "a.ogg");
  assert.equal(result.actions[0].volume, 0.5);
  assert.equal(model.readTriggerForm(buildForm({ type0: "play-sound" })).actions[0].volume, 0.8);
});

test("the form is checked before it is saved: every problem is named, the editor stays open", () => {
  const bad = model.readTriggerForm(buildForm({ type0: "play-sound", type1: "change-resource", triggerResourcePath1: "name", triggerResourceValue1: "x" }));
  const errors = model.validateEditorForm(bad);
  assert.ok(errors.length >= 3);
  assert.deepEqual(model.validateEditorForm(model.readTriggerForm(buildForm())), []);

  const combat = (overrides) => model.validateEditorForm(model.readTriggerForm(buildForm({ kind: "combat", ...overrides })));
  assert.deepEqual(combat({ combatEvent: "round-start", every: "3" }), []);
  assert.deepEqual(combat({ round: "2" }), []);
  assert.equal(combat({ round: "0" }).length, 1);
  assert.equal(combat({ every: "1.5" }).length, 1);
  assert.equal(combat({ round: "abc" }).length, 1);
});

test("the form makes the trigger: name needed, the old one kept where the form has no field", () => {
  const current = data.normalizeTrigger({ id: "t1", name: "Old", stopLowerPriority: true, filters: { users: ["u1"] }, actions: [{ type: "chat-message", template: "x" }] });
  assert.equal(model.buildTriggerFromEditorResult(current, { ...model.readTriggerForm(buildForm()), name: "  " }), null);

  const roll = model.buildTriggerFromEditorResult(current, model.readTriggerForm(buildForm({ oncePerMessage: false, rollTypes: ["attack"] })));
  assert.equal(roll.id, "t1");
  assert.equal(roll.name, "My trigger");
  assert.equal(roll.priority, 250);
  assert.equal(roll.stopLowerPriority, true);
  assert.deepEqual(roll.filters.users, ["u1"]);
  assert.deepEqual(roll.filters.rollType, ["attack"]);
  assert.equal(roll.oncePerMessage, false);
  assert.equal(roll.match.type, "die-max");
  assert.equal("kind" in roll, false);
  assert.equal(roll.source, "user");

  // a rule of the gallery stays marked when it is edited, its copy does not
  const rule = data.normalizeTrigger({ id: "g1", name: "Rule", source: "gallery:d20Nat20Cheer", match: { type: "die-max", faces: 20 } });
  assert.equal(model.buildTriggerFromEditorResult(rule, model.readTriggerForm(buildForm())).source, "gallery:d20Nat20Cheer");
  assert.equal(model.buildTriggerFromEditorResult(rule, model.readTriggerForm(buildForm()), { duplicate: true }).source, "user");
  assert.equal(model.buildTriggerFromEditorResult(current, model.readTriggerForm(buildForm())).source, "user");

  const copy = model.buildTriggerFromEditorResult(current, model.readTriggerForm(buildForm()), { duplicate: true, randomId: () => "new-id" });
  assert.equal(copy.id, "new-id");

  const combat = model.buildTriggerFromEditorResult(current, model.readTriggerForm(buildForm({ kind: "combat", combatEvent: "round-start", every: "3", executionMode: "automatic" })));
  assert.equal(combat.kind, "combat");
  assert.deepEqual(combat.combat, { event: "round-start", round: null, every: 3, effect: null });
  assert.equal(combat.match.type, "combat-event");

  // a combat trigger edited into a roll trigger loses its combat data
  const back = model.buildTriggerFromEditorResult(combat, model.readTriggerForm(buildForm({ kind: "roll" })));
  assert.equal("kind" in back, false);
  assert.equal("combat" in back, false);
  assert.equal(back.match.type, "die-max");
});

test("a fresh trigger starts with the default execution mode of the settings", () => {
  const settings = new Map([["sephrals-roll-triggers.defaultExecutionMode", "automatic"]]);
  globalThis.game.settings = {
    settings,
    get: (module, key) => settings.get(`${module}.${key}`),
    set: async () => {}
  };
  game.user = { isGM: true };
  try {
    assert.equal(model.getBlankTrigger().executionMode, "automatic");
    settings.set("sephrals-roll-triggers.defaultExecutionMode", "confirm-gm");
    assert.equal(model.getBlankTrigger().executionMode, "confirm-gm");
    assert.equal(model.getBlankTrigger().match.type, "die-max");
  } finally {
    delete globalThis.game.settings;
  }
});

// ---- What the templates show --------------------------------------------------------------------------------------

test("the editor context carries every field the form reads, with the same names", () => {
  const current = data.normalizeTrigger({ id: "t", name: "T", match: { type: "die-max", faces: 20 }, extraMatches: [{ type: "die-value", value: 6 }], actions: [{ type: "play-sound", sound: "a.ogg", volume: 0.5 }] });
  const context = model.buildEditorContext(current);

  assert.equal(context.general.kind, "roll");
  assert.equal(context.general.oncePerMessage, true);
  assert.deepEqual(Object.keys(context.general.kindChoices), ["roll", "combat"]);
  assert.ok("chat-button" in context.general.executionChoices);
  assert.equal(context.match.extraMatches.length, 1);
  assert.equal(context.match.extraMatches[0].number, 1);
  assert.equal(context.match.fields.find((field) => field.field === "faces").value, 20);
  assert.equal(context.actions.length, 3);
  assert.equal(context.actions[0].fields.find((field) => field.field === "volume").value, 50);
  assert.equal(context.filters.rollTypes.summary, en["SRT.RollType.Any"]);

  // every field name of the descriptors is read by readTriggerForm
  const asked = new Set();
  const spy = { querySelector(selector) { asked.add(selector); return null; }, querySelectorAll() { return []; } };
  model.readTriggerForm(spy);
  for (const field of context.actions.flatMap((slot) => slot.fields)) assert.ok(asked.has(`[name="${field.name}"]`), field.name);
  for (const field of context.match.fields) assert.ok(asked.has(`[name="${field.name}"]`), field.name);
  assert.ok(asked.has('[name="triggerKind"]') && asked.has('[name="triggerOncePerMessage"]') && asked.has('[name="triggerCombatEvent"]'));

  const combat = model.buildEditorContext(data.normalizeTrigger({ id: "c", name: "C", kind: "combat", combat: { event: "round-start", every: 3 } }));
  assert.equal(combat.general.kind, "combat");
  assert.equal(combat.combat.event, "round-start");
  assert.equal(combat.combat.every, 3);
  assert.ok(!("chat-button" in combat.general.executionChoices));
  assert.equal(Object.keys(combat.combat.eventChoices).length, 6);
});

test("a copy of a trigger is named as a copy", () => {
  const context = model.buildEditorContext(data.normalizeTrigger({ id: "t", name: "Rule" }), { duplicate: true });
  assert.match(context.general.name, /Dialog\.DuplicateName/);
});

test("the templates exist, use known texts and name the partials they include", () => {
  const dir = new URL("../templates/", import.meta.url);
  const files = [...readdirSync(new URL("editor/", dir)).map((name) => `editor/${name}`), "trigger-manager.html", "gallery.html"];
  assert.ok(files.length >= 12);
  for (const file of files) {
    const html = readFileSync(new URL(file, dir), "utf8");
    for (const [, key] of html.matchAll(/srtT ["']([\w.]+)["']/g)) {
      assert.ok(en[`SRT.${key}`], `${file}: en ${key}`);
      assert.ok(de[`SRT.${key}`], `${file}: de ${key}`);
    }
    for (const [, partial] of html.matchAll(/\{\{> "([^"]+)"/g)) {
      assert.ok(editor.EDITOR_PARTIALS.includes(partial), `${file}: ${partial}`);
    }
  }
  assert.equal(editor.EDITOR_PARTIALS.length, 4);
  for (const partial of editor.EDITOR_PARTIALS) assert.ok(files.includes(partial.replace(/^.*templates\//, "")), partial);
});

// ---- The window ---------------------------------------------------------------------------------------------------

class FakeApplicationV2 {
  constructor(options = {}) {
    this.options = options;
    this.element = null;
  }
  _prepareTabs() { return { general: { id: "general" }, match: { id: "match" } }; }
  async close() { this.closed = true; this._onClose?.({}); }
}

test("the editor window has parts, tabs and actions, validates on submit and resolves once", async () => {
  globalThis.foundry.applications = { api: { ApplicationV2: FakeApplicationV2, HandlebarsApplicationMixin: (Base) => class extends Base {} }, instances: new Map() };
  editor.__test__.resetEditorClass();
  try {
    const Editor = editor.__test__.getEditorClass();
    assert.deepEqual(Object.keys(Editor.PARTS), ["tabs", "general", "match", "filters", "actions", "footer"]);
    assert.deepEqual(Editor.TABS.sheet.tabs.map((tab) => tab.id), model.EDITOR_TABS);
    assert.equal(Editor.TABS.sheet.initial, "general");
    assert.equal(Editor.DEFAULT_OPTIONS.tag, "form");
    assert.deepEqual(Object.keys(Editor.DEFAULT_OPTIONS.actions).sort(), ["addExtraMatch", "pickFile", "removeExtraMatch"]);
    for (const part of Object.values(Editor.PARTS)) {
      const path = part.template.replace(/^modules\/sephrals-roll-triggers\//, "");
      assert.ok(readFileSync(new URL(`../${path}`, import.meta.url), "utf8").length > 0, path);
    }

    let resolved = [];
    const current = data.normalizeTrigger({ id: "t", name: "T" });
    const editorWindow = new Editor({ current, title: "Edit", resolve: (value) => resolved.push(value) });
    assert.equal(editorWindow.title, "Edit");
    assert.deepEqual(Object.values(editorWindow._prepareTabs("sheet")).map((tab) => tab.label), [en["SRT.Dialog.TabGeneral"], en["SRT.Dialog.TabMatch"]]);

    const handler = Editor.DEFAULT_OPTIONS.form.handler;
    editorWindow.element = buildForm({ type0: "play-sound" });
    await assert.rejects(() => handler.call(editorWindow, {}, null, null), /./);
    assert.deepEqual(resolved, []);
    assert.equal(editorWindow.closed, undefined);

    editorWindow.element = buildForm({ triggerName: "x" });
    await handler.call(editorWindow, {}, null, null);
    assert.equal(editorWindow.closed, true);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].name, "x");

    // closing without saving resolves null, once
    const second = [];
    const closing = new Editor({ current, resolve: (value) => second.push(value) });
    await closing.close();
    await closing.close();
    assert.deepEqual(second, [null]);
  } finally {
    editor.__test__.resetEditorClass();
    delete globalThis.foundry.applications;
  }
});
