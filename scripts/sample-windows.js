// Sample windows (api.samples, contract in samples.mjs): the rules window, the gallery, the editor, the test bench, the
// questions and the chat cards of the module filled with made-up rules, so translators and testers see every text in its
// place without writing a rule or rolling a die first. Nothing here saves a rule, fires a reaction or posts a message:
// the windows read their rules from memory, every button that would change something only says that it does nothing.
import { buildConfirmContent, buildLogContent, renderTemplateString } from "./actions.js";
import { buildRuleTrigger, GALLERY_RULES, getRule, isCombatRule } from "./rule-gallery.js";
import { getGalleryClass } from "./gallery-window.js";
import { getEditorClass } from "./trigger-editor.js";
import { getManagerClass } from "./trigger-manager.js";
import { describeReport, getTestBenchClass } from "./roll-test-bench.js";
import { buildReportContent } from "./selftest.js";
import { getInternalProfiles } from "./default-presets.js";
import { describeMatch, normalizeMatch, normalizeProfile, normalizeTrigger, presentProfile, presentTrigger, getVisibleProfiles } from "./trigger-data.js";
import { ensureModuleTranslationsLoaded, format, getRuntimeOptions, localize, MODULE_ID } from "./settings.js";
import { TriggerChatCardRenderer } from "./chat-card.js";
import { blockedForm, closeSample, markSample, openSampleDialog, openSampleHtml, sampleActions, sampleCast, sampleId } from "./samples.mjs";

const ID_PREFIX = "srt-sample-";
const HERO = "ari";

function hero() {
  return sampleCast().find((member) => member.id === HERO);
}

/* -------------------------------------------- */
/*  The made-up rules                           */
/* -------------------------------------------- */

// Rules of the gallery with another state: [rule id, overrides]. Titles and texts are the gallery's own, in the language.
const RULE_STATES = [
  ["d20Nat20Cheer", { priority: 100 }],
  ["d20Nat1Groan", { priority: 90, executionMode: "chat-button" }],
  ["dnd5eCritInspiration", { priority: 80, executionMode: "confirm-gm" }],
  ["dnd5eFumbleProne", { priority: 70, executionMode: "confirm-gm", enabled: false }],
  ["anyRollHigh", { priority: 60, executionMode: "gm-whisper-log" }],
  ["dnd5eDeathSaveNat20", { priority: 50, filters: { playerOnly: true } }],
  ["dnd5eMaxDamage", { priority: 40, executionMode: "disabled" }],
  ["combatTurnAnnounce", { priority: 30 }],
  ["combatEveryThird", { priority: 20 }],
  ["combatEffectEnds", { priority: 10 }],
  ["combatNpcTurnNote", { priority: 5 }]
];

/** One made-up rule from the gallery, normalized like a stored rule. */
export function sampleTrigger(ruleId, overrides = {}) {
  const rule = getRule(ruleId);
  if (!rule) return null;
  const built = buildRuleTrigger(rule, {}, { id: `${ID_PREFIX}${ruleId}` });
  const filters = { ...built.filters, ...(overrides.filters ?? {}) };
  return normalizeTrigger({ ...built, ...overrides, filters, source: "user" });
}

/** The rules of the rules window: roll and combat rules, every execution mode, enabled and disabled. */
export function sampleTriggers() {
  return RULE_STATES.map(([id, overrides]) => sampleTrigger(id, overrides)).filter(Boolean);
}

/** The profiles of the rules window: the included starter profiles and one imported profile. */
export function sampleProfiles(showInternal = true) {
  const imported = normalizeProfile({
    id: `${ID_PREFIX}imported`,
    name: localize("Sample.ProfileName"),
    description: localize("Sample.ProfileText"),
    systemId: "dnd5e",
    source: "imported",
    triggers: sampleTriggers().slice(0, 3)
  });
  return getVisibleProfiles([...getInternalProfiles().map((profile) => normalizeProfile(profile)), imported], showInternal).map((profile) => presentProfile(profile));
}

/** What the rules window template shows for the made-up rules. */
export function sampleManagerContext() {
  const runtime = getRuntimeOptions();
  const triggers = sampleTriggers().map((trigger) => presentTrigger(trigger));
  const profiles = sampleProfiles(true);
  return {
    hasTriggers: triggers.length > 0,
    hasProfiles: profiles.length > 0,
    triggers,
    profiles,
    triggerCount: triggers.length,
    profileCount: profiles.length,
    enableImportExport: true,
    uiTheme: runtime.uiTheme,
    worldTitle: game.world?.title ?? game.world?.id ?? "-"
  };
}

/* -------------------------------------------- */
/*  The test bench result                       */
/* -------------------------------------------- */

function report(trigger, extra = {}) {
  return { trigger, enabled: trigger.enabled, stoppedBy: null, blockedBy: [], conditions: [], matched: false, match: null, error: null, ...extra };
}

/** A roll of 20 on a d20 checked against the made-up rules: a match, a miss, a rule that is off, one that was stopped. */
export function sampleBenchRun() {
  const [cheer, groan, inspiration, prone, high, deathSave] = sampleTriggers();
  const max = normalizeMatch({ type: "die-max", faces: 20, minCount: 1 });
  const min = normalizeMatch({ type: "die-min", faces: 20, minCount: 1 });
  const above = normalizeMatch({ type: "total-above", threshold: 30 });
  const event = { actorName: hero().name, formula: "1d20 + 5", total: 25 };
  const match = (trigger) => ({ trigger, event, executionMode: trigger.executionMode, actions: trigger.actions });
  const reports = [
    report(cheer, { matched: true, conditions: [{ passed: true, condition: max }], match: match(cheer) }),
    report(inspiration, { matched: true, conditions: [{ passed: true, condition: max }, { passed: true, condition: above }], match: match(inspiration) }),
    report(groan, { conditions: [{ passed: false, condition: min }] }),
    report(deathSave, { blockedBy: ["playerOnly", "rollType"], conditions: [{ passed: true, condition: max }] }),
    report(prone, { enabled: false }),
    report(high, { stoppedBy: cheer }),
    report(groan, { conditions: [{ passed: false, condition: above, error: "event.total is not a function" }], error: "event.total is not a function" })
  ];
  const views = reports.map((entry) => describeReport(entry, { describeCondition: describeMatch, overLimit: entry === reports[1], maxActions: 2 }));
  return { formula: "1d20 + 5", total: 25, diceText: "d20: 20", views };
}

/* -------------------------------------------- */
/*  Chat cards                                  */
/* -------------------------------------------- */

const RESULTS = { anyDoubles: "4, 4", swadeSnakeEyes: "1, 1", crucibleTriple: "6, 6, 6", crucibleTripleOnes: "1, 1, 1" };

function templateContext(ruleId) {
  const member = hero();
  return {
    actor: { name: member.name },
    roll: { formula: "1d20 + 11", total: 31, results: RESULTS[ruleId] ?? "20" },
    combat: { round: 3 },
    effect: { name: sampleBlessing() }
  };
}

function sampleBlessing() {
  return game.i18n?.lang === "de" ? "Segen" : "Bless";
}

/** The cards the reactions of the gallery rules post: [{ruleId, content, gm}], in catalog order. */
export function sampleReactionCards({ combat = false, gm = false } = {}) {
  const cards = [];
  for (const rule of GALLERY_RULES) {
    if (isCombatRule(rule) !== combat) continue;
    for (const action of rule.actions ?? []) {
      if (!action.textKey || action.type === "play-sound") continue;
      const isNote = action.type === "gm-note";
      if (isNote !== gm) continue;
      const content = renderTemplateString(localize(`Gallery.Rule.${rule.id}.${action.textKey}`), templateContext(rule.id));
      if (content.trim()) cards.push({ ruleId: rule.id, content, gm: isNote });
    }
  }
  return cards;
}

/** A chat log with several made-up messages in one window. Rendered again on every render, so the texts follow translations. */
async function openCards({ id, title, items, width = 380 }) {
  const body = async () => {
    const Message = globalThis.getDocumentClass?.("ChatMessage") ?? globalThis.ChatMessage;
    const log = document.createElement("ol");
    log.className = "chat-log sephral-sample-chat";
    log.style.cssText = "list-style:none;margin:0;padding:0;";
    for (const item of await items()) {
      const message = new Message({
        _id: foundry.utils.randomID(),
        content: item.content,
        speaker: item.speaker ?? { alias: game.modules.get(MODULE_ID)?.title ?? MODULE_ID },
        author: game.user?.id,
        timestamp: Date.now(),
        flavor: item.flavor ?? "",
        whisper: item.gm ? [game.user.id] : [],
        rolls: (item.rolls ?? []).map((roll) => roll.toJSON()),
        flags: item.flags ?? {}
      });
      const rendered = (typeof message.renderHTML === "function") ? await message.renderHTML() : (await message.getHTML())?.[0];
      if (!rendered) continue;
      log.append(rendered);
      await item.after?.(rendered, message);
    }
    return log;
  };
  return openSampleHtml({ moduleId: MODULE_ID, id, title, body, width, classes: ["sephral-sample-chat-window"] });
}

async function sampleRoll(formula) {
  return new Roll(formula).evaluate({ allowInteractive: false });
}

function reference(name) {
  return `${foundry.utils.escapeHTML(localize("Chat.TriggerReference"))} <strong>${foundry.utils.escapeHTML(name)}</strong>`;
}

/* -------------------------------------------- */
/*  Windows over the real classes               */
/* -------------------------------------------- */

async function openSampleApp(id, build) {
  await ensureModuleTranslationsLoaded();
  const appId = sampleId(MODULE_ID, id);
  await closeSample(appId);
  const app = markSample(build(appId));
  await app.render({ force: true });
  return app;
}

function openManager() {
  return openSampleApp("manager", (id) => {
    const Manager = getManagerClass();
    const Sample = class SRTSampleManager extends Manager {
      static DEFAULT_OPTIONS = { actions: sampleActions(Manager, []) };

      async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return { ...context, ...sampleManagerContext() };
      }
    };
    return new Sample({ id });
  });
}

// The gallery with some rules marked as added, as a world looks that has taken a few of them.
function openGallery() {
  return openSampleApp("gallery", (id) => {
    const Gallery = getGalleryClass();
    const Sample = class SRTSampleGallery extends Gallery {
      static DEFAULT_OPTIONS = { actions: sampleActions(Gallery, []) };

      async _prepareContext(options) {
        const context = await super._prepareContext(options);
        for (const group of context.groups) group.rules.forEach((rule, index) => { if (index % 3 === 0) rule.added = true; });
        return context;
      }
    };
    return new Sample({ id });
  });
}

// The editor over a made-up rule. Adding and removing a condition only change the form, Save says it does nothing.
function openEditor(id, trigger, titleKey) {
  return openSampleApp(id, (appId) => {
    const Editor = getEditorClass();
    const Sample = class SRTSampleEditor extends Editor {
      static DEFAULT_OPTIONS = {
        form: { handler: blockedForm, closeOnSubmit: false, submitOnChange: false },
        actions: sampleActions(Editor, ["addExtraMatch", "removeExtraMatch"])
      };
    };
    return new Sample({ current: trigger, title: localize(titleKey), id: appId });
  });
}

function editorTriggers() {
  const firstTable = (game.tables?.contents ?? Array.from(game.tables ?? []))[0];
  const roll = normalizeTrigger({
    ...sampleTrigger("dnd5eCritInspiration"),
    description: localize("Gallery.Rule.dnd5eCritInspiration.Then"),
    extraMatches: [{ type: "total-above", threshold: 25 }],
    filters: { rollType: ["attack"], actorType: ["pc"], visibility: ["public"], combatState: "in-combat", playerOnly: true },
    actions: [
      { type: "chat-message", visibility: "public", template: localize("Gallery.Rule.dnd5eCritCheer.Text") },
      { type: "apply-effect", status: "prone", target: "actor", rounds: 2, visibility: "gm" },
      { type: "change-resource", path: "system.attributes.inspiration", operation: "add", value: "1" }
    ]
  });
  const effectEnd = sampleTrigger("combatEffectEnds", { combat: { event: "effect-end", round: 2, every: 2, effect: sampleBlessing() } });
  const actions = normalizeTrigger({
    ...sampleTrigger("d20Nat20Table"),
    actions: [
      { type: "roll-table", visibility: "gm", tables: firstTable ? [firstTable.id] : [] },
      { type: "play-sound", sound: "sounds/dice.wav", volume: 0.6 },
      { type: "show-image", image: "icons/svg/d20-highlight.svg", caption: localize("Gallery.Rule.d20Nat20Cheer.Text") }
    ]
  });
  const formula = normalizeTrigger({
    ...sampleTrigger("d20Nat20Bonus"),
    actions: [
      { type: "roll-formula", formula: "1d6", visibility: "public", flavor: localize("Gallery.Rule.d20Nat20Bonus.Flavor") },
      { type: "gm-note", template: localize("Gallery.Rule.d20Nat1Note.Text") },
      { type: "macro", macro: "" }
    ]
  });
  return { roll, effectEnd, actions, formula };
}

function openTestBench() {
  return openSampleApp("testbench", (id) => {
    const Bench = getTestBenchClass();
    const Sample = class SRTSampleBench extends Bench {
      static DEFAULT_OPTIONS = { actions: sampleActions(Bench, []) };
    };
    const app = new Sample({ id, describeCondition: describeMatch });
    app.lastRun = { key: "", view: sampleBenchRun() };
    return app;
  });
}

/* -------------------------------------------- */
/*  Questions                                   */
/* -------------------------------------------- */

function confirmMatch(trigger, event) {
  return { trigger, event, actions: trigger.actions };
}

function confirmRoll() {
  const trigger = sampleTrigger("dnd5eCritInspiration");
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "confirm-roll",
    title: localize("Dialog.ConfirmTitle"),
    content: () => buildConfirmContent(confirmMatch(trigger, { actorName: hero().name, formula: "1d20 + 11", total: 31 })),
    buttons: [{ label: localize("Dialog.Execute"), icon: "fa-solid fa-check", default: true }, { label: localize("Dialog.Cancel"), icon: "fa-solid fa-xmark" }]
  });
}

function confirmCombat() {
  const trigger = sampleTrigger("combatTurnAnnounce", { executionMode: "confirm-gm" });
  const description = format("Combat.Description.TurnStart", { actor: hero().name, round: 3 });
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "confirm-combat",
    title: localize("Dialog.ConfirmTitle"),
    content: () => buildConfirmContent(confirmMatch(trigger, { actorName: hero().name, combatEvent: "turn-start", description })),
    buttons: [{ label: localize("Dialog.Execute"), icon: "fa-solid fa-check", default: true }, { label: localize("Dialog.Cancel"), icon: "fa-solid fa-xmark" }]
  });
}

function deleteQuestion() {
  const name = sampleTrigger("d20Nat20Cheer").name;
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "delete",
    title: localize("Dialog.DeleteTitle"),
    content: () => `<p>${foundry.utils.escapeHTML(format("Dialog.DeleteContent", { name }))}</p>`,
    buttons: [{ label: localize("Manager.Delete"), icon: "fa-solid fa-trash", default: true }, { label: localize("Dialog.Cancel"), icon: "fa-solid fa-xmark" }]
  });
}

function runQuestion() {
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "run-confirm",
    title: localize("TestBench.RunConfirmTitle"),
    content: () => `<p>${foundry.utils.escapeHTML(format("TestBench.RunConfirmContent", { count: 2 }))}</p>`,
    buttons: [{ label: localize("Dialog.Execute"), icon: "fa-solid fa-check", default: true }, { label: localize("Dialog.Cancel"), icon: "fa-solid fa-xmark" }]
  });
}

/* -------------------------------------------- */
/*  Cards                                       */
/* -------------------------------------------- */

const cardsOf = (options) => () => sampleReactionCards(options);

function cardFormula() {
  const trigger = sampleTrigger("d20Nat20Bonus");
  return openCards({
    id: "card-formula",
    title: localize("Sample.CardFormula"),
    items: async () => [{
      flavor: `${localize("Gallery.Rule.d20Nat20Bonus.Flavor")} (${reference(trigger.name)})`,
      content: "",
      rolls: [await sampleRoll("1d6")],
      speaker: { alias: hero().name }
    }]
  });
}

function cardTable() {
  const trigger = sampleTrigger("d20Nat20Cheer");
  const result = game.i18n?.lang === "de" ? "Ein Goldstück mit eingeritztem Wappen." : "A gold coin with a scratched crest.";
  return openCards({
    id: "card-table",
    title: localize("Sample.CardTable"),
    items: async () => [{
      gm: true,
      flavor: `${reference(trigger.name)}: ${foundry.utils.escapeHTML(game.i18n.format("TABLE.DrawFlavor", { number: 1, name: localize("Sample.TableName") }))}`,
      content: `<p>${foundry.utils.escapeHTML(result)}</p>`,
      rolls: [await sampleRoll("1d20")]
    }]
  });
}

function cardLog() {
  const roll = { trigger: { name: sampleTrigger("anyRollHigh").name }, event: { formula: "1d20 + 11", total: 31 } };
  const description = format("Combat.Description.RoundStart", { round: 3 });
  const combat = { trigger: { name: sampleTrigger("combatRoundAnnounce")?.name ?? sampleTrigger("combatTurnAnnounce").name }, event: { combatEvent: "round-start", description } };
  return openCards({
    id: "card-log",
    title: localize("Sample.CardLog"),
    items: async () => [{ gm: true, content: buildLogContent(roll) }, { gm: true, content: buildLogContent(combat) }]
  });
}

// The "Trigger available" panel on a roll card: what a player or the GM sees where a rule waits for a click.
function cardButtons() {
  const member = hero();
  const entries = ["d20Nat20Cheer", "dnd5eCritInspiration"].map((ruleId) => ({ triggerId: `${ID_PREFIX}${ruleId}`, triggerName: sampleTrigger(ruleId).name, executed: false }));
  return openCards({
    id: "card-buttons",
    title: localize("Sample.CardButtons"),
    items: async () => [{
      flavor: foundry.utils.escapeHTML(member.name),
      content: "",
      rolls: [await sampleRoll("1d20 + 5")],
      speaker: { alias: member.name },
      flags: { [MODULE_ID]: { deferredMatches: entries } },
      after: (element, message) => {
        // The module's own render hook adds the panel when the settings allow this user to see it, else it is added here.
        if (!element.querySelector(".srt-trigger-panel")) new TriggerChatCardRenderer().appendButtons(message, element, { allowPlayerButtons: true });
      }
    }]
  });
}

function cardSelfTest() {
  return openCards({
    id: "card-selftest",
    title: localize("Sample.CardSelfTest"),
    items: async () => [
      { gm: true, content: buildReportContent(format("SelfTest.Passed", { checks: 14, triggers: 11 })) },
      { gm: true, content: buildReportContent(format("SelfTest.Problems", { problems: 2, checks: 14 }), [format("SelfTest.Template", { name: sampleTrigger("d20Nat20Cheer").name }), localize("SelfTest.Disabled")]) }
    ]
  });
}

/* -------------------------------------------- */
/*  The list                                    */
/* -------------------------------------------- */

/**
 * The sample windows of the module (api.samples). Every entry opens a real window or card over made-up rules, nothing is saved.
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const group = localize("Sample.Group");
  const entry = (id, labelKey, open) => ({ id, label: localize(labelKey), group, open });
  const triggers = () => editorTriggers();
  return [
    entry("manager", "Sample.Manager", openManager),
    entry("gallery", "Sample.Gallery", openGallery),
    entry("editor-roll", "Sample.EditorRoll", () => openEditor("editor-roll", triggers().roll, "Dialog.TriggerEditTitle")),
    entry("editor-combat", "Sample.EditorCombat", () => openEditor("editor-combat", sampleTrigger("combatEveryThird"), "Dialog.TriggerEditTitle")),
    entry("editor-effect", "Sample.EditorEffect", () => openEditor("editor-effect", triggers().effectEnd, "Dialog.TriggerEditTitle")),
    entry("editor-actions", "Sample.EditorActions", () => openEditor("editor-actions", triggers().actions, "Dialog.TriggerDuplicateTitle")),
    entry("editor-formula", "Sample.EditorFormula", () => openEditor("editor-formula", triggers().formula, "Dialog.TriggerEditTitle")),
    entry("testbench", "Sample.TestBench", openTestBench),
    entry("confirm-roll", "Sample.ConfirmRoll", confirmRoll),
    entry("confirm-combat", "Sample.ConfirmCombat", confirmCombat),
    entry("delete", "Sample.Delete", deleteQuestion),
    entry("run-confirm", "Sample.RunConfirm", runQuestion),
    entry("cards-roll", "Sample.CardsRoll", () => openCards({ id: "cards-roll", title: localize("Sample.CardsRoll"), items: cardsOf({ combat: false, gm: false }) })),
    entry("cards-gm", "Sample.CardsGm", () => openCards({ id: "cards-gm", title: localize("Sample.CardsGm"), items: cardsOf({ combat: false, gm: true }) })),
    entry("cards-combat", "Sample.CardsCombat", () => openCards({ id: "cards-combat", title: localize("Sample.CardsCombat"), items: async () => [...sampleReactionCards({ combat: true, gm: false }), ...sampleReactionCards({ combat: true, gm: true })] })),
    entry("card-formula", "Sample.CardFormula", cardFormula),
    entry("card-table", "Sample.CardTable", cardTable),
    entry("card-log", "Sample.CardLog", cardLog),
    entry("card-buttons", "Sample.CardButtons", cardButtons),
    entry("card-selftest", "Sample.CardSelfTest", cardSelfTest)
  ];
}

export const __test__ = { RULE_STATES, editorTriggers };
