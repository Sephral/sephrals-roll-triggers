import { getExecutionModeChoices, localize, format } from "./settings.js";
import { DEFAULT_SOUND_VOLUME } from "./actions.js";
import { GALLERY_SOURCE_PREFIX } from "./rule-gallery.js";
import { FILTER_VISIBILITY_CHOICES, ROLL_TYPE_CHOICES } from "./choices.js";
import { COMBAT_EVENT_FIELDS, COMBAT_EVENT_LABEL_KEYS, COMBAT_EVENTS, COMBAT_EXECUTION_MODES, isCombatTrigger } from "./combat-events.js";
import {
  ACTION_TYPE_CHOICES,
  ACTOR_TYPE_CHOICES,
  buildEditableActions,
  COMBAT_STATE_CHOICES,
  EFFECT_TARGET_CHOICES,
  getDefaultExecutionMode,
  getItemSelectChoices,
  getReferenceSelectChoices,
  getSelectChoices,
  getSelectedFilterValues,
  getSelectedReferenceValue,
  getStatusEffectChoices,
  localizeChoiceMap,
  MATCH_INPUT_FIELDS,
  MATCH_TYPE_CHOICES,
  MAX_ACTION_SLOTS,
  normalizeCommaList,
  normalizeActionList,
  normalizeTrigger,
  readOncePerMessage,
  RESOURCE_OPERATION_CHOICES,
  validateEditorActions,
  ACTION_VISIBILITY_CHOICES
} from "./trigger-data.js";

// The model of the trigger editor: what the templates show (built from a trigger), how the form is read back and
// checked, and how the read values become a trigger again. No window code here, see trigger-editor.js.

export const EDITOR_TABS = Object.freeze(["general", "match", "filters", "actions"]);

export const KIND_CHOICES = Object.freeze({ roll: "Dialog.KindRoll", combat: "Dialog.KindCombat" });

// One input of the match tab. The primary match uses the named inputs (name="triggerFaces"), additional AND
// conditions use scoped attributes (data-srt-extra-match-input="faces").
export function buildMatchFieldDescriptors(match, { extra = false } = {}) {
  return MATCH_INPUT_FIELDS.map((definition) => ({
    field: definition.field,
    name: definition.inputName,
    extra,
    isTextarea: definition.input === "textarea",
    inputType: definition.input,
    rows: extra ? 3 : 5,
    label: localize(definition.labelKey),
    hint: localize(definition.hintKey),
    value: match?.[definition.field] ?? definition.fallback ?? ""
  }));
}

export function buildExtraMatchDescriptor(match, index, matchType) {
  const type = String(match?.type ?? "die-value");
  return {
    index,
    number: Number(index) + 1,
    type,
    typeChoices: localizeChoiceMap(MATCH_TYPE_CHOICES),
    fields: buildMatchFieldDescriptors(match, { extra: true }),
    matchType: matchType ?? type
  };
}

function textField(field, name, label, hint, value, extra = {}) {
  return { field, name, kind: "text", label: localize(label), hint: localize(hint), value: value ?? "", ...extra };
}

function numberField(field, name, label, hint, value, attrs) {
  return { field, name, kind: "number", label: localize(label), hint: localize(hint), value: value ?? "", attrs };
}

function selectField(field, name, label, hint, choices, selected) {
  return { field, name, kind: "select", label: localize(label), hint: localize(hint), choices, selected };
}

function fileField(field, name, label, hint, value, picker) {
  return { field, name, kind: "file", label: localize(label), hint: localize(hint), value: value ?? "", picker, browse: localize("Dialog.BrowseFiles") };
}

// The fields of one action slot in the order of the editor. The marker field names decide which fields an action
// type shows (ACTION_FIELD_VISIBILITY).
export function buildActionFieldDescriptors(action, index) {
  const none = { "": localize("Dialog.None") };
  return [
    selectField("visibility", `triggerActionVisibility${index}`, "Dialog.TriggerActionVisibility", "DialogHint.TriggerActionVisibility", localizeChoiceMap(ACTION_VISIBILITY_CHOICES), action.visibility ?? (action.type === "roll-table" ? "gm" : "public")),
    textField("template", `triggerChatTemplate${index}`, "Dialog.TriggerChatTemplate", "DialogHint.TriggerChatTemplate", action.template),
    selectField("tables", `triggerTables${index}`, "Dialog.TriggerTables", "DialogHint.TriggerTables", { ...none, ...getReferenceSelectChoices("table", action.tables ?? []) }, getSelectedReferenceValue(action.tables)),
    selectField("macro", `triggerMacro${index}`, "Dialog.TriggerMacro", "DialogHint.TriggerMacro", { ...none, ...getReferenceSelectChoices("macro", action.macro ?? "") }, getSelectedReferenceValue(action.macro)),
    selectField("journal", `triggerJournal${index}`, "Dialog.TriggerJournal", "DialogHint.TriggerJournal", { ...none, ...getReferenceSelectChoices("journal", action.journal ?? "") }, getSelectedReferenceValue(action.journal)),
    fileField("sound", `triggerSound${index}`, "Dialog.TriggerSound", "DialogHint.TriggerSound", action.sound, "audio"),
    numberField("volume", `triggerSoundVolume${index}`, "Dialog.TriggerSoundVolume", "DialogHint.TriggerSoundVolume", action.volumePercent, { min: 0, max: 100, step: 5 }),
    selectField("status", `triggerEffectStatus${index}`, "Dialog.TriggerEffectStatus", "DialogHint.TriggerEffectStatus", getStatusEffectChoices(action.status), action.status),
    textField("effectUuid", `triggerEffectUuid${index}`, "Dialog.TriggerEffectUuid", "DialogHint.TriggerEffectUuid", action.effectUuid),
    numberField("rounds", `triggerEffectRounds${index}`, "Dialog.TriggerEffectRounds", "DialogHint.TriggerEffectRounds", action.rounds ?? "", { min: 1, step: 1 }),
    selectField("effectTarget", `triggerEffectTarget${index}`, "Dialog.TriggerEffectTarget", "DialogHint.TriggerEffectTarget", localizeChoiceMap(EFFECT_TARGET_CHOICES), action.target),
    textField("resourcePath", `triggerResourcePath${index}`, "Dialog.TriggerResourcePath", "DialogHint.TriggerResourcePath", action.path, { spellcheck: false }),
    selectField("resourceOperation", `triggerResourceOperation${index}`, "Dialog.TriggerResourceOperation", "DialogHint.TriggerResourceOperation", localizeChoiceMap(RESOURCE_OPERATION_CHOICES), action.operation),
    textField("resourceValue", `triggerResourceValue${index}`, "Dialog.TriggerResourceValue", "DialogHint.TriggerResourceValue", action.value),
    fileField("image", `triggerImage${index}`, "Dialog.TriggerImage", "DialogHint.TriggerImage", action.image, "imagevideo"),
    textField("caption", `triggerImageCaption${index}`, "Dialog.TriggerImageCaption", "DialogHint.TriggerImageCaption", action.caption),
    textField("formula", `triggerRollFormula${index}`, "Dialog.TriggerRollFormula", "DialogHint.TriggerRollFormula", action.formula, { spellcheck: false }),
    textField("flavor", `triggerRollFlavor${index}`, "Dialog.TriggerRollFlavor", "DialogHint.TriggerRollFlavor", action.flavor)
  ];
}

export function buildActionSlotDescriptors(actions) {
  return buildEditableActions(actions).map((action, index) => ({
    index,
    number: index + 1,
    type: action.type ?? "none",
    typeChoices: localizeChoiceMap(ACTION_TYPE_CHOICES),
    fields: buildActionFieldDescriptors(action, index)
  }));
}

function summary(choices, selected, emptyLabel) {
  const values = new Set(normalizeCommaList(selected));
  const labels = Object.entries(choices).filter(([value]) => values.has(value)).map(([, label]) => label);
  return labels.length ? labels.join(", ") : emptyLabel;
}

// The choices of the execution mode select. A combat trigger cannot show a chat button, so that mode is left out.
export function getExecutionChoicesFor(kind) {
  const choices = getExecutionModeChoices();
  if (kind !== "combat") return choices;
  return Object.fromEntries(Object.entries(choices).filter(([mode]) => COMBAT_EXECUTION_MODES.includes(mode)));
}

// Everything the editor templates show, built from a normalized trigger.
export function buildEditorContext(current, { duplicate = false } = {}) {
  const filters = current.filters ?? {};
  const kind = isCombatTrigger(current) ? "combat" : "roll";
  const combat = current.combat ?? { event: "turn-start", round: null, every: null, effect: null };
  const rollTypeChoices = getSelectChoices(localizeChoiceMap(ROLL_TYPE_CHOICES), filters.rollType ?? []);
  const actorTypeChoices = getSelectChoices(localizeChoiceMap(ACTOR_TYPE_CHOICES), filters.actorType ?? []);
  const visibilityChoices = getSelectChoices(localizeChoiceMap(FILTER_VISIBILITY_CHOICES), filters.visibility ?? []);
  const sceneChoices = getReferenceSelectChoices("scene", filters.includeScenes ?? []);
  const actorChoices = getReferenceSelectChoices("actor", filters.includeActors ?? []);
  const itemChoices = getItemSelectChoices(filters.includeActors ?? [], filters.includeItems ?? []);
  const selectedRollTypes = getSelectedFilterValues(filters.rollType, ["any"]);
  const selectedActorTypes = getSelectedFilterValues(filters.actorType, ["any"]);
  const selectedVisibility = getSelectedFilterValues(filters.visibility, ["any"]);

  return {
    general: {
      name: duplicate ? format("Dialog.DuplicateName", { name: current.name }) : current.name,
      description: current.description,
      category: current.category,
      priority: Number(current.priority),
      kind,
      kindChoices: localizeChoiceMap(KIND_CHOICES),
      executionMode: current.executionMode,
      executionChoices: getExecutionChoicesFor(kind),
      oncePerMessage: readOncePerMessage(current)
    },
    match: {
      type: current.match.type,
      typeChoices: localizeChoiceMap(MATCH_TYPE_CHOICES),
      fields: buildMatchFieldDescriptors(current.match),
      extraMatches: (current.extraMatches ?? []).map((match, index) => buildExtraMatchDescriptor(match, index))
    },
    combat: {
      event: combat.event,
      eventChoices: Object.fromEntries(COMBAT_EVENTS.map((event) => [event, localize(COMBAT_EVENT_LABEL_KEYS[event])])),
      round: combat.round ?? "",
      every: combat.every ?? "",
      effect: combat.effect ?? ""
    },
    filters: {
      rollTypes: { choices: rollTypeChoices, selected: selectedRollTypes, summary: summary(rollTypeChoices, selectedRollTypes, localize("RollType.Any")) },
      actorTypes: { choices: actorTypeChoices, selected: selectedActorTypes, summary: summary(actorTypeChoices, selectedActorTypes, localize("ActorType.Any")) },
      visibility: { choices: visibilityChoices, selected: selectedVisibility, summary: summary(visibilityChoices, selectedVisibility, localize("Visibility.Any")) },
      combatState: { choices: localizeChoiceMap(COMBAT_STATE_CHOICES), selected: filters.combatState ?? "any" },
      scenes: { choices: sceneChoices, selected: normalizeCommaList(filters.includeScenes), summary: summary(sceneChoices, filters.includeScenes, "-") },
      actors: { choices: actorChoices, selected: normalizeCommaList(filters.includeActors), summary: summary(actorChoices, filters.includeActors, "-") },
      items: { choices: itemChoices, selected: normalizeCommaList(filters.includeItems), summary: summary(itemChoices, filters.includeItems, "-") },
      playerOnly: Boolean(filters.playerOnly),
      gmOnly: Boolean(filters.gmOnly)
    },
    actions: buildActionSlotDescriptors(current.actions)
  };
}

// ---- Reading the form back --------------------------------------------------------------------------------------

function text(root, selector, fallback = "") {
  return String(root.querySelector(selector)?.value ?? fallback).trim();
}

function selectedValues(root, selector, defaults = []) {
  const select = root.querySelector(selector);
  const values = Array.from(select?.selectedOptions ?? []).map((entry) => entry.value);
  return getSelectedFilterValues(values, defaults);
}

function checked(root, selector) {
  return Boolean(root.querySelector(selector)?.checked);
}

// Reads one extra AND condition element.
export function readExtraMatchCondition(condition) {
  const read = (field) => String(condition.querySelector?.(`[data-srt-extra-match-input="${field}"]`)?.value ?? "").trim();
  return {
    type: read("type") || "die-value",
    faces: read("faces"),
    value: read("value"),
    threshold: read("threshold"),
    minCount: read("minCount") || "1",
    degree: read("degree"),
    path: read("path"),
    expression: read("expression")
  };
}

export function readExtendedActionFields(root, index) {
  const read = (selector) => String(root.querySelector(selector)?.value ?? "");
  const volumePercent = read(`[name="triggerSoundVolume${index}"]`).trim();
  return {
    sound: read(`[name="triggerSound${index}"]`),
    volumePercent,
    volume: volumePercent === "" ? DEFAULT_SOUND_VOLUME : Number(volumePercent) / 100,
    status: read(`[name="triggerEffectStatus${index}"]`),
    effectUuid: read(`[name="triggerEffectUuid${index}"]`),
    rounds: read(`[name="triggerEffectRounds${index}"]`),
    target: read(`[name="triggerEffectTarget${index}"]`) || "actor",
    path: read(`[name="triggerResourcePath${index}"]`),
    operation: read(`[name="triggerResourceOperation${index}"]`) || "add",
    value: read(`[name="triggerResourceValue${index}"]`),
    image: read(`[name="triggerImage${index}"]`),
    caption: read(`[name="triggerImageCaption${index}"]`),
    formula: read(`[name="triggerRollFormula${index}"]`),
    flavor: read(`[name="triggerRollFlavor${index}"]`)
  };
}

// The values of the editor form (root is the form element or any element around the fields).
export function readTriggerForm(root) {
  const rawActions = Array.from({ length: MAX_ACTION_SLOTS }, (_value, index) => ({
    type: text(root, `[name="triggerActionType${index}"]`, "none"),
    visibility: text(root, `[name="triggerActionVisibility${index}"]`, "public"),
    template: String(root.querySelector(`[name="triggerChatTemplate${index}"]`)?.value ?? ""),
    tables: String(root.querySelector(`[name="triggerTables${index}"]`)?.value ?? ""),
    macro: String(root.querySelector(`[name="triggerMacro${index}"]`)?.value ?? ""),
    journal: String(root.querySelector(`[name="triggerJournal${index}"]`)?.value ?? ""),
    ...readExtendedActionFields(root, index)
  }));

  return {
    name: text(root, '[name="triggerName"]'),
    description: text(root, '[name="triggerDescription"]'),
    category: text(root, '[name="triggerCategory"]', "house-rule"),
    priority: Number(root.querySelector('[name="triggerPriority"]')?.value ?? 100),
    executionMode: text(root, '[name="triggerExecutionMode"]', "confirm-gm"),
    oncePerMessage: root.querySelector('[name="triggerOncePerMessage"]') ? checked(root, '[name="triggerOncePerMessage"]') : true,
    kind: text(root, '[name="triggerKind"]', "roll") === "combat" ? "combat" : "roll",
    combatEvent: text(root, '[name="triggerCombatEvent"]', "turn-start"),
    combatRound: text(root, '[name="triggerCombatRound"]'),
    combatEvery: text(root, '[name="triggerCombatEvery"]'),
    combatEffect: text(root, '[name="triggerCombatEffect"]'),
    matchType: text(root, '[name="triggerMatchType"]', "die-max"),
    faces: text(root, '[name="triggerFaces"]'),
    value: text(root, '[name="triggerValue"]'),
    threshold: text(root, '[name="triggerThreshold"]'),
    minCount: text(root, '[name="triggerMinCount"]', "1"),
    degree: text(root, '[name="triggerDegree"]'),
    path: text(root, '[name="triggerPath"]'),
    expression: text(root, '[name="triggerExpression"]'),
    extraMatches: Array.from(root.querySelectorAll("[data-srt-extra-match]")).map((condition) => readExtraMatchCondition(condition)),
    rollTypes: selectedValues(root, '[name="triggerRollTypes"]', ["any"]),
    actorTypes: selectedValues(root, '[name="triggerActorTypes"]', ["any"]),
    visibilityFilter: selectedValues(root, '[name="triggerVisibilityFilter"]', ["any"]),
    combatState: text(root, '[name="triggerCombatState"]', "any"),
    includeScenes: selectedValues(root, '[name="triggerIncludeScenes"]'),
    includeActors: selectedValues(root, '[name="triggerIncludeActors"]'),
    includeItems: selectedValues(root, '[name="triggerIncludeItems"]'),
    playerOnly: checked(root, '[name="triggerPlayerOnly"]'),
    gmOnly: checked(root, '[name="triggerGmOnly"]'),
    actions: rawActions
  };
}

// The problems of the form, one message each. The editor stays open and shows them.
export function validateEditorForm(result) {
  const errors = [];
  if (result.kind === "combat") {
    const isCount = (value) => value === "" || (Number.isInteger(Number(value)) && Number(value) >= 1);
    if (!COMBAT_EVENTS.includes(result.combatEvent)) errors.push(localize("Validation.CombatEvent"));
    const fields = COMBAT_EVENT_FIELDS[result.combatEvent] ?? COMBAT_EVENT_FIELDS["turn-start"];
    if (fields.rounds && (!isCount(result.combatRound) || !isCount(result.combatEvery))) errors.push(localize("Validation.CombatRounds"));
  }
  errors.push(...validateEditorActions(result.actions));
  return errors;
}

// The trigger a submitted form makes: the edited trigger (current) with the values of the form put in.
// Returns null without a name.
export function buildTriggerFromEditorResult(current, result, { duplicate = false, randomId = () => foundry.utils.randomID() } = {}) {
  const name = String(result?.name ?? "").trim();
  if (!name) return null;

  const combat = result.kind === "combat";
  const filters = {
    rollType: normalizeCommaList(result.rollTypes).filter((value) => value !== "any"),
    actorType: normalizeCommaList(result.actorTypes).filter((value) => value !== "any"),
    visibility: normalizeCommaList(result.visibilityFilter).filter((value) => value !== "any"),
    combatState: result.combatState,
    includeScenes: normalizeCommaList(result.includeScenes),
    includeActors: normalizeCommaList(result.includeActors),
    includeItems: normalizeCommaList(result.includeItems),
    playerOnly: Boolean(result.playerOnly),
    gmOnly: Boolean(result.gmOnly),
    users: current.filters?.users
  };

  // The kind of a trigger is decided by the form: drop the old kind data first, normalizeTrigger adds what applies.
  const { kind: _kind, combat: _combat, ...base } = current;
  return normalizeTrigger({
    ...base,
    id: duplicate ? randomId() : current.id,
    name,
    description: result.description,
    category: result.category,
    priority: result.priority,
    executionMode: result.executionMode,
    oncePerMessage: result.oncePerMessage !== false,
    ...(combat ? { kind: "combat", combat: { event: result.combatEvent, round: result.combatRound, every: result.combatEvery, effect: result.combatEffect } } : {}),
    match: {
      type: result.matchType,
      faces: result.faces,
      value: result.value,
      threshold: result.threshold,
      minCount: result.minCount,
      degree: result.degree,
      path: result.path,
      expression: result.expression
    },
    extraMatches: Array.isArray(result.extraMatches) ? result.extraMatches : [],
    filters,
    actions: normalizeActionList(result.actions),
    // A rule from the gallery stays marked after editing, so the gallery still knows it is in the world. A copy is a trigger of its own.
    source: !duplicate && String(current.source ?? "").startsWith(GALLERY_SOURCE_PREFIX) ? current.source : "user"
  });
}

// The trigger shown in a fresh editor.
export function getBlankTrigger() {
  return normalizeTrigger({}, {
    name: "",
    category: "house-rule",
    executionMode: getDefaultExecutionMode(),
    match: { type: "die-max", faces: 20, value: null, threshold: null, minCount: 1, degree: null, path: null, expression: null },
    action: { type: "none" },
    rollType: "",
    actorType: "",
    visibility: "",
    combatState: "any",
    includeScenes: "",
    includeActors: "",
    includeItems: "",
    playerOnly: false,
    gmOnly: false
  });
}

export const __test__ = { summary };
