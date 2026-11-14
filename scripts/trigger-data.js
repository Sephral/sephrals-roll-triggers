import {
  format,
  getProfileStore,
  getRuntimeOptions,
  getTriggerStore,
  localize,
  MODULE_ID,
  saveProfileStore,
  saveTriggerStore
} from "./settings.js";
import {
  ACTION_LABEL_KEYS,
  ACTION_VISIBILITY_LABEL_KEYS,
  describeAction,
  EFFECT_TARGETS,
  findStatusEffect,
  getStatusEffectLabel,
  isSafeResourcePath,
  normalizeEffectRounds,
  normalizeVolume,
  RESOURCE_OPERATIONS
} from "./actions.js";
import { FILTER_VISIBILITY_CHOICES, ROLL_TYPE_CHOICES } from "./choices.js";
import { COMBAT_EVENT_FIELDS, COMBAT_EVENT_LABEL_KEYS, isCombatTrigger, normalizeCombatConfig, getCombatExecutionMode } from "./combat-events.js";
import { countFeature } from "./usage.mjs";

// Everything about the data of a trigger that needs no window: normalizing, describing, merging imports and the
// store helpers. The windows (trigger-manager.js, trigger-editor.js, gallery-window.js) build on it.

export const EXPORT_FORMAT_VERSION = 1;
export const PROFILE_EXPORT_FORMAT_VERSION = 1;
export const MAX_ACTION_SLOTS = 3;

export const MATCH_TYPE_CHOICES = {
  "die-value": "Match.DieValue",
  "die-min": "Match.DieMin",
  "die-max": "Match.DieMax",
  "at-least-n-value": "Match.AtLeastNValue",
  "at-least-n-min": "Match.AtLeastNMin",
  "at-least-n-max": "Match.AtLeastNMax",
  "all-same": "Match.AllSame",
  "at-least-n-same": "Match.AtLeastNSame",
  "die-result-above": "Match.DieResultAbove",
  "die-result-below": "Match.DieResultBelow",
  "total-above": "Match.TotalAbove",
  "total-below": "Match.TotalBelow",
  "success-degree": "Match.SuccessDegree",
  "system-flag": "Match.SystemFlag",
  "custom-js": "Match.CustomJs"
};

export const ACTION_TYPE_CHOICES = {
  none: "Action.None",
  ...ACTION_LABEL_KEYS
};

export const EFFECT_TARGET_CHOICES = {
  actor: "EffectTarget.Actor",
  targets: "EffectTarget.Targets"
};

export const RESOURCE_OPERATION_CHOICES = {
  add: "ResourceOperation.Add",
  subtract: "ResourceOperation.Subtract",
  set: "ResourceOperation.Set"
};

export const ACTION_VISIBILITY_CHOICES = { ...ACTION_VISIBILITY_LABEL_KEYS };

export const ACTOR_TYPE_CHOICES = {
  any: "ActorType.Any",
  pc: "ActorType.Pc",
  npc: "ActorType.Npc",
  vehicle: "ActorType.Vehicle"
};

export const COMBAT_STATE_CHOICES = {
  any: "CombatState.Any",
  "in-combat": "CombatState.InCombat",
  "out-of-combat": "CombatState.OutOfCombat"
};

export const ACTION_FIELD_VISIBILITY = {
  none: { visibility: false, template: false, tables: false, macro: false, journal: false },
  "chat-message": { visibility: true, template: true, tables: false, macro: false, journal: false },
  "roll-table": { visibility: true, template: false, tables: true, macro: false, journal: false },
  macro: { visibility: false, template: false, tables: false, macro: true, journal: false },
  "journal-link": { visibility: true, template: true, tables: false, macro: false, journal: true },
  "gm-note": { visibility: false, template: true, tables: false, macro: false, journal: false },
  // Fields that an entry does not list stay hidden.
  "play-sound": { visibility: true, sound: true, volume: true },
  "apply-effect": { status: true, effectUuid: true, rounds: true, effectTarget: true },
  "change-resource": { resourcePath: true, resourceOperation: true, resourceValue: true },
  "show-image": { visibility: true, image: true, caption: true },
  "roll-formula": { visibility: true, formula: true, flavor: true }
};

export const TEMPLATE_PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}/;

export const MATCH_FIELD_VISIBILITY = {
  "die-value": { faces: true, value: true, threshold: false, minCount: false, degree: false, path: false, expression: false },
  "die-min": { faces: true, value: false, threshold: false, minCount: false, degree: false, path: false, expression: false },
  "die-max": { faces: true, value: false, threshold: false, minCount: false, degree: false, path: false, expression: false },
  "at-least-n-value": { faces: true, value: true, threshold: false, minCount: true, degree: false, path: false, expression: false },
  "at-least-n-min": { faces: true, value: false, threshold: false, minCount: true, degree: false, path: false, expression: false },
  "at-least-n-max": { faces: true, value: false, threshold: false, minCount: true, degree: false, path: false, expression: false },
  "all-same": { faces: true, value: false, threshold: false, minCount: false, degree: false, path: false, expression: false },
  "at-least-n-same": { faces: true, value: false, threshold: false, minCount: true, degree: false, path: false, expression: false },
  "die-result-above": { faces: true, value: false, threshold: true, minCount: false, degree: false, path: false, expression: false },
  "die-result-below": { faces: true, value: false, threshold: true, minCount: false, degree: false, path: false, expression: false },
  "total-above": { faces: false, value: false, threshold: true, minCount: false, degree: false, path: false, expression: false },
  "total-below": { faces: false, value: false, threshold: true, minCount: false, degree: false, path: false, expression: false },
  "success-degree": { faces: false, value: false, threshold: false, minCount: false, degree: true, path: false, expression: false },
  "system-flag": { faces: false, value: false, threshold: false, minCount: false, degree: false, path: true, expression: false },
  "custom-js": { faces: false, value: false, threshold: false, minCount: false, degree: false, path: false, expression: true },
  // Stored on combat triggers so that an older version of the module, which does not know them, never matches them.
  "combat-event": { faces: false, value: false, threshold: false, minCount: false, degree: false, path: false, expression: false }
};

// Shared input definitions for the primary match and every additional AND condition.
export const MATCH_INPUT_FIELDS = [
  { field: "faces", inputName: "triggerFaces", input: "number", labelKey: "Dialog.TriggerFaces", hintKey: "DialogHint.TriggerFaces" },
  { field: "value", inputName: "triggerValue", input: "number", labelKey: "Dialog.TriggerValue", hintKey: "DialogHint.TriggerValue" },
  { field: "threshold", inputName: "triggerThreshold", input: "number", labelKey: "Dialog.TriggerThreshold", hintKey: "DialogHint.TriggerThreshold" },
  { field: "minCount", inputName: "triggerMinCount", input: "number", labelKey: "Dialog.TriggerMinCount", hintKey: "DialogHint.TriggerMinCount", fallback: 1 },
  { field: "degree", inputName: "triggerDegree", input: "text", labelKey: "Dialog.TriggerDegree", hintKey: "DialogHint.TriggerDegree" },
  { field: "path", inputName: "triggerPath", input: "text", labelKey: "Dialog.TriggerPath", hintKey: "DialogHint.TriggerPath" },
  { field: "expression", inputName: "triggerExpression", input: "textarea", labelKey: "Dialog.TriggerExpression", hintKey: "DialogHint.TriggerExpression" }
];

export const DEFAULT_EXTRA_MATCH = Object.freeze({ type: "die-value", faces: null, value: null, threshold: null, minCount: 1, degree: null, path: null, expression: null });

export const ITEM_ROLL_TYPES = new Set(["attack", "check", "save", "damage", "healing", "skill"]);

export function localizeChoiceMap(choices) {
  return Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, localize(value)]));
}

export function normalizeCommaList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry ?? "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

export function getCollectionEntries(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}

export function getReferenceCollection(referenceType) {
  if (referenceType === "scene") return game.scenes;
  if (referenceType === "actor") return game.actors;
  if (referenceType === "item") return game.items;
  if (referenceType === "table") return game.tables ?? game.rollTables;
  if (referenceType === "macro") return game.macros;
  if (referenceType === "journal") return game.journal ?? game.journalEntries;
  return null;
}

export function getReferenceChoices(referenceType) {
  const collection = getReferenceCollection(referenceType);
  const values = new Set();

  for (const entry of getCollectionEntries(collection)) {
    if (entry?.id) values.add(String(entry.id));
    if (entry?.name) values.add(String(entry.name));
    if (entry?.uuid) values.add(String(entry.uuid));
  }

  return [...values];
}

export function getReferenceSelectChoices(referenceType, selectedValues = []) {
  const collection = getReferenceCollection(referenceType);

  const entries = getCollectionEntries(collection)
    .filter((entry) => entry?.id)
    .map((entry) => ({
      id: String(entry.id),
      label: entry?.name ? `${String(entry.name)} (${String(entry.id)})` : String(entry.id)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));

  const choices = Object.fromEntries(entries.map((entry) => [entry.id, entry.label]));

  for (const value of normalizeCommaList(selectedValues)) {
    if (!value || choices[value]) continue;
    choices[value] = formatReferenceValue(referenceType, value);
  }

  return choices;
}

// Items for the item filter: first the items of the chosen actors, shown as "Aria: Longsword" and stored by their own
// id, then the items of the sidebar, which also count for copies with the same name on any actor.
export function getItemSelectChoices(actorIds = [], selectedValues = []) {
  const ownedChoices = [];
  for (const actorId of normalizeCommaList(actorIds)) {
    const actor = resolveReferenceEntry("actor", actorId);
    for (const item of getCollectionEntries(actor?.items)) {
      if (!item?.id) continue;
      ownedChoices.push({ id: String(item.id), label: `${String(actor.name ?? actorId)}: ${String(item.name ?? item.id)}` });
    }
  }
  ownedChoices.sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));

  const choices = Object.fromEntries(ownedChoices.map((entry) => [entry.id, entry.label]));
  for (const [id, label] of Object.entries(getReferenceSelectChoices("item"))) choices[id] ??= label;
  for (const value of normalizeCommaList(selectedValues)) {
    if (value && !choices[value]) choices[value] = formatOwnedItemValue(value);
  }
  return choices;
}

// A stored item id that is no sidebar item: the item of an actor, as long as that actor still has it.
export function formatOwnedItemValue(value) {
  const formatted = formatReferenceValue("item", value);
  if (formatted !== value) return formatted;
  for (const actor of getCollectionEntries(getReferenceCollection("actor"))) {
    const item = actor?.items?.get?.(value) ?? getCollectionEntries(actor?.items).find((entry) => entry?.id === value);
    if (item) return `${String(actor.name ?? actor.id)}: ${String(item.name ?? value)}`;
  }
  return value;
}


export function getSelectedReferenceValue(values) {
  return normalizeCommaList(values)[0] ?? "";
}

export function getSelectedFilterValue(values, defaultValue = "any") {
  return normalizeCommaList(values)[0] ?? defaultValue;
}

export function getSelectedFilterValues(values, defaultValues = []) {
  const selectedValues = normalizeCommaList(values);
  return selectedValues.length ? selectedValues : normalizeCommaList(defaultValues);
}

export function getSelectChoices(choices, selectedValues = []) {
  const resolved = { ...choices };

  for (const value of normalizeCommaList(selectedValues)) {
    if (!value || resolved[value]) continue;
    resolved[value] = value;
  }

  return resolved;
}

export function resolveReferenceEntry(referenceType, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const collection = getReferenceCollection(referenceType);

  for (const entry of getCollectionEntries(collection)) {
    if (!entry) continue;
    if (String(entry.id ?? "") === raw) return entry;
    if (String(entry.uuid ?? "") === raw) return entry;
    if (String(entry.name ?? "") === raw) return entry;
  }

  return null;
}

export function formatReferenceValue(referenceType, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const entry = resolveReferenceEntry(referenceType, raw);
  if (!entry?.name || !entry?.id) return raw;
  return `${entry.name} (${entry.id})`;
}

export function formatReferenceList(referenceType, values) {
  return normalizeCommaList(values).map((value) => formatReferenceValue(referenceType, value)).join(", ");
}

export function parseReferenceToken(referenceType, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const labeledMatch = raw.match(/^(.*)\(([^()]+)\)\s*$/);
  const candidate = labeledMatch?.[2]?.trim() || raw;
  const entry = resolveReferenceEntry(referenceType, candidate) ?? resolveReferenceEntry(referenceType, raw);
  return String(entry?.id ?? candidate);
}

export function parseReferenceList(referenceType, value) {
  return normalizeCommaList(value).map((entry) => parseReferenceToken(referenceType, entry));
}

export function getActionFieldState(actionType) {
  return ACTION_FIELD_VISIBILITY[actionType] ?? ACTION_FIELD_VISIBILITY.none;
}

export function getMatchFieldState(matchType) {
  return MATCH_FIELD_VISIBILITY[matchType] ?? MATCH_FIELD_VISIBILITY["die-max"];
}

export function getFilterDetailState({ actorType = [], rollType = [] } = {}) {
  const actorTypes = normalizeCommaList(actorType).filter((value) => value !== "any");
  const rollTypes = normalizeCommaList(rollType).filter((value) => value !== "any");
  return {
    scene: true,
    actor: actorTypes.length > 0,
    item: rollTypes.some((value) => ITEM_ROLL_TYPES.has(value))
  };
}

export function getActionSummary(trigger) {
  const actions = Array.isArray(trigger.actions) ? trigger.actions : [];
  if (!actions.length) return localize("Action.None");

  return actions.map((action) => describeAction(action)).join(" + ");
}

// Empty match fields are null after normalization. Number(null) would display them as 0.
export function getDisplayNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function describeMatch(match) {
  if (!match) return "-";
  const base = localize(MATCH_TYPE_CHOICES[match.type] ?? "Match.DieValue");
  const state = getMatchFieldState(match.type);
  const parts = [base];
  const faces = getDisplayNumber(match.faces);
  const value = getDisplayNumber(match.value);
  const threshold = getDisplayNumber(match.threshold);
  if (state.faces && faces > 0) parts.push(`d${faces}`);
  if (state.value && value != null) parts.push(String(value));
  if (state.threshold && threshold != null) parts.push(String(threshold));
  if (state.minCount && Number.isFinite(Number(match.minCount)) && Number(match.minCount) > 1) parts.push(`x${Number(match.minCount)}`);
  if (state.degree && match.degree != null && String(match.degree).trim()) parts.push(String(match.degree).trim());
  if (state.path && match.path != null && String(match.path).trim()) parts.push(String(match.path).trim());
  if (state.expression && match.expression != null && String(match.expression).trim()) parts.push(String(match.expression).trim());
  return parts.join(" | ");
}

export function describeTriggerMatches(trigger) {
  const extraMatches = Array.isArray(trigger?.extraMatches) ? trigger.extraMatches.filter(Boolean) : [];
  if (!extraMatches.length) return describeMatch(trigger?.match);
  return [trigger?.match, ...extraMatches].map((match) => describeMatch(match)).join(` ${localize("Manager.MatchAnd")} `);
}

export function describeFilters(filters) {
  const parts = [];
  const rollTypes = Array.isArray(filters?.rollType) ? filters.rollType : [];
  if (rollTypes.length) parts.push(rollTypes.map((value) => localize(ROLL_TYPE_CHOICES[value] ?? `RollType.${value}`)).join(", "));
  if (filters?.actorType?.length) parts.push(filters.actorType.map((value) => localize(ACTOR_TYPE_CHOICES[value] ?? `ActorType.${value}`)).join(", "));
  if (filters?.visibility?.length) parts.push(filters.visibility.map((value) => localize(FILTER_VISIBILITY_CHOICES[value] ?? `Visibility.${value}`)).join(", "));
  if (filters?.combatState && filters.combatState !== "any") parts.push(localize(COMBAT_STATE_CHOICES[filters.combatState] ?? `CombatState.${filters.combatState}`));
  if (filters?.playerOnly) parts.push(localize("Manager.FilterPlayerOnly"));
  if (filters?.gmOnly) parts.push(localize("Manager.FilterGmOnly"));
  if (filters?.includeScenes?.length) parts.push(`${localize("Manager.FilterScenes")} ${filters.includeScenes.length}`);
  if (filters?.includeActors?.length) parts.push(`${localize("Manager.FilterActors")} ${filters.includeActors.length}`);
  if (filters?.includeItems?.length) parts.push(`${localize("Manager.FilterItems")} ${filters.includeItems.length}`);
  return parts.join(" | ") || "-";
}

export function normalizeAction(action) {
  if (!action || action.type === "none") return null;

  if (action.type === "chat-message") {
    const template = String(action.template || action.message || "").trim();
    if (!template) return null;

    return {
      type: "chat-message",
      template,
      visibility: String(action.visibility ?? "public")
    };
  }

  if (action.type === "roll-table") {
    const listed = normalizeCommaList(Array.isArray(action.tables) ? action.tables.join(",") : action.tables ?? "");
    const tables = listed.length ? listed : normalizeCommaList(action.table ?? "");
    if (!tables.length) return null;

    return {
      type: "roll-table",
      tables,
      visibility: String(action.visibility ?? "gm")
    };
  }

  if (action.type === "macro") {
    const macro = String(action.macro ?? "").trim();
    if (!macro) return null;

    return {
      type: "macro",
      macro
    };
  }

  if (action.type === "journal-link") {
    const journal = String(action.journal ?? "").trim();
    if (!journal) return null;

    return {
      type: "journal-link",
      journal,
      template: String(action.template ?? "").trim(),
      visibility: String(action.visibility ?? "public")
    };
  }

  if (action.type === "gm-note") {
    const template = String(action.template || action.message || "").trim();
    if (!template) return null;

    return {
      type: "gm-note",
      template
    };
  }

  if (action.type === "play-sound") {
    const sound = String(action.sound ?? "").trim();
    if (!sound) return null;

    return {
      type: "play-sound",
      sound,
      volume: normalizeVolume(action.volume),
      visibility: String(action.visibility ?? "public")
    };
  }

  if (action.type === "apply-effect") {
    const status = String(action.status ?? "").trim();
    const effectUuid = String(action.effectUuid ?? "").trim();
    if (!status && !effectUuid) return null;

    return {
      type: "apply-effect",
      status,
      effectUuid,
      rounds: normalizeEffectRounds(action.rounds),
      target: EFFECT_TARGETS.includes(action.target) ? action.target : "actor"
    };
  }

  if (action.type === "change-resource") {
    const path = String(action.path ?? "").trim();
    const value = String(action.value ?? "").trim();
    if (!isSafeResourcePath(path) || !value) return null;

    return {
      type: "change-resource",
      path,
      operation: RESOURCE_OPERATIONS.includes(action.operation) ? action.operation : "add",
      value
    };
  }

  if (action.type === "show-image") {
    const image = String(action.image ?? "").trim();
    if (!image) return null;

    return {
      type: "show-image",
      image,
      caption: String(action.caption ?? "").trim(),
      visibility: String(action.visibility ?? "public")
    };
  }

  if (action.type === "roll-formula") {
    const formula = String(action.formula ?? "").trim();
    if (!formula) return null;

    return {
      type: "roll-formula",
      formula,
      flavor: String(action.flavor ?? "").trim(),
      visibility: String(action.visibility ?? "public")
    };
  }

  return null;
}

export function isValidFormula(formula) {
  if (TEMPLATE_PLACEHOLDER.test(formula)) return true;
  const validate = globalThis.Roll?.validate;
  return typeof validate === "function" ? Boolean(validate.call(globalThis.Roll, formula)) : true;
}

// Problems of one editor action slot (raw form values, volume in percent). The new action types are checked,
// the older ones keep their behavior: an incomplete entry is dropped when the trigger is saved.
export function validateEditorAction(action, index) {
  const slot = index + 1;
  const errors = [];
  const text = (value) => String(value ?? "").trim();
  const add = (key) => errors.push(format(`Validation.${key}`, { slot }));

  switch (action?.type) {
    case "play-sound": {
      if (!text(action.sound)) add("SoundMissing");
      const volume = text(action.volumePercent);
      if (volume && !(Number(volume) >= 0 && Number(volume) <= 100)) add("VolumeRange");
      break;
    }
    case "apply-effect": {
      const status = text(action.status);
      if (!status && !text(action.effectUuid)) add("EffectMissing");
      const hasStatusList = typeof globalThis.CONFIG?.statusEffects?.find === "function";
      if (status && hasStatusList && !findStatusEffect(status)) add("StatusUnknown");
      if (text(action.rounds) && !normalizeEffectRounds(action.rounds)) add("RoundsInvalid");
      break;
    }
    case "change-resource": {
      if (!isSafeResourcePath(action.path)) add("ResourcePath");
      const value = text(action.value);
      if (!value) add("ResourceValueMissing");
      else if (!TEMPLATE_PLACEHOLDER.test(value) && !Number.isFinite(Number(value))) add("ResourceValueInvalid");
      break;
    }
    case "show-image":
      if (!text(action.image)) add("ImageMissing");
      break;
    case "roll-formula": {
      const formula = text(action.formula);
      if (!formula) add("FormulaMissing");
      else if (!isValidFormula(formula)) add("FormulaInvalid");
      break;
    }
    default:
      break;
  }

  return errors;
}

export function validateEditorActions(actions) {
  return (Array.isArray(actions) ? actions : []).flatMap((action, index) => validateEditorAction(action, index));
}

export function getStatusEffectChoices(selected = "") {
  const statuses = Array.from(globalThis.CONFIG?.statusEffects ?? []).filter((status) => status?.id);
  const entries = statuses
    .map((status) => [String(status.id), getStatusEffectLabel(status.id)])
    .sort(([, left], [, right]) => left.localeCompare(right, game.i18n?.lang));
  const choices = { "": localize("Dialog.StatusNone"), ...Object.fromEntries(entries) };
  const current = String(selected ?? "").trim();
  if (current && !choices[current]) choices[current] = current;
  return choices;
}

export function normalizeActionList(actions, fallback = []) {
  const source = Array.isArray(actions) && actions.length ? actions : Array.isArray(fallback) ? fallback : [];
  return source.map((action) => normalizeAction(action)).filter(Boolean);
}

export function normalizeOptionalNumber(value, fallback = null) {
  if (value === "" || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeOptionalText(value) {
  if (value == null) return null;
  return String(value).trim() || null;
}

export function normalizeExactDiceCountByFaces(value) {
  if (!value || typeof value !== "object") return undefined;

  const entries = Object.entries(value)
    .map(([faces, count]) => [Number(faces), Number(count)])
    .filter(([faces, count]) => Number.isFinite(faces) && faces > 0 && Number.isFinite(count) && count > 0)
    .map(([faces, count]) => [String(Math.trunc(faces)), Math.trunc(count)]);

  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function normalizeMatch(match) {
  const type = String(match?.type ?? "die-max");
  const state = getMatchFieldState(type);

  return {
    type,
    faces: state.faces ? normalizeOptionalNumber(match?.faces) : null,
    value: state.value ? normalizeOptionalNumber(match?.value) : null,
    threshold: state.threshold ? normalizeOptionalNumber(match?.threshold) : null,
    minCount: state.minCount ? normalizeOptionalNumber(match?.minCount, 1) : 1,
    degree: state.degree ? normalizeOptionalText(match?.degree) : null,
    path: state.path ? normalizeOptionalText(match?.path) : null,
    expression: state.expression ? normalizeOptionalText(match?.expression) : null,
    enabled: Boolean(match?.enabled)
  };
}

// Additional AND conditions share the match shape. Missing or invalid input yields an empty list.
export function normalizeExtraMatches(extraMatches) {
  if (!Array.isArray(extraMatches)) return [];
  return extraMatches
    .filter((match) => match && typeof match === "object" && !Array.isArray(match))
    .map((match) => normalizeMatch(match));
}

export function buildEditableActions(actions) {
  const editable = normalizeActionList(actions);
  while (editable.length < MAX_ACTION_SLOTS) editable.push({ type: "none", template: "", tables: [], macro: "", journal: "", visibility: "public" });
  return editable.slice(0, MAX_ACTION_SLOTS).map((action) => ({
    type: action.type ?? "none",
    template: String(action.template ?? ""),
    tables: Array.isArray(action.tables) ? action.tables : normalizeCommaList(action.tables ?? ""),
    macro: String(action.macro ?? ""),
    journal: String(action.journal ?? ""),
    visibility: String(action.visibility ?? (action.type === "roll-table" ? "gm" : "public")),
    sound: String(action.sound ?? ""),
    volumePercent: Math.round(normalizeVolume(action.volume) * 100),
    status: String(action.status ?? ""),
    effectUuid: String(action.effectUuid ?? ""),
    rounds: normalizeEffectRounds(action.rounds),
    target: EFFECT_TARGETS.includes(action.target) ? action.target : "actor",
    path: String(action.path ?? ""),
    operation: RESOURCE_OPERATIONS.includes(action.operation) ? action.operation : "add",
    value: String(action.value ?? ""),
    image: String(action.image ?? ""),
    caption: String(action.caption ?? ""),
    formula: String(action.formula ?? ""),
    flavor: String(action.flavor ?? "")
  }));
}

export function normalizeProfile(profile, fallback = {}) {
  const profileId = String(profile?.id ?? fallback.id ?? foundry.utils.randomID());

  return {
    id: profileId,
    name: String(profile?.name ?? fallback.name ?? "").trim() || profileId,
    description: String(profile?.description ?? fallback.description ?? "").trim(),
    systemId: String(profile?.systemId ?? fallback.systemId ?? game.system?.id ?? "generic").trim() || "generic",
    source: String(profile?.source ?? fallback.source ?? "imported"),
    triggers: Array.isArray(profile?.triggers)
      ? profile.triggers.map((trigger) => normalizeTrigger(trigger, { source: `profile:${profileId}` }))
      : []
  };
}

// A trigger runs once per chat message unless it opts out. Older triggers stored the same switch twice
// (oncePerMessage and allowMultipleMatches). Either one asking for repeated runs counts, only oncePerMessage is kept.
export function readOncePerMessage(trigger) {
  return trigger?.oncePerMessage !== false && trigger?.allowMultipleMatches !== true;
}

// The match every combat trigger carries, so that an older module version cannot read it as a die rule.
const COMBAT_MATCH_MARKER = Object.freeze({ type: "combat-event" });

export function normalizeTrigger(trigger, fallback = {}) {
  const combatKind = isCombatTrigger(trigger) || (trigger?.kind == null && isCombatTrigger(fallback));
  const match = combatKind ? COMBAT_MATCH_MARKER : trigger?.match ?? fallback.match ?? { type: "die-max", faces: 20, minCount: 1 };
  const normalizedActions = normalizeActionList(
    trigger?.actions,
    fallback.action ? [fallback.action] : fallback.actions
  );
  const combat = combatKind ? normalizeCombatConfig(trigger?.combat ?? fallback.combat) : null;
  const eventFields = combat ? COMBAT_EVENT_FIELDS[combat.event] : null;
  const executionMode = String(trigger?.executionMode ?? fallback.executionMode ?? "confirm-gm");

  return {
    id: String(trigger?.id ?? foundry.utils.randomID()),
    name: String(trigger?.name ?? fallback.name ?? "").trim() || localize("Manager.Create"),
    description: String(trigger?.description ?? "").trim(),
    category: String(trigger?.category ?? fallback.category ?? "house-rule").trim(),
    icon: trigger?.icon ?? null,
    enabled: trigger?.enabled !== false,
    priority: Number(trigger?.priority ?? fallback.priority ?? 100),
    oncePerMessage: readOncePerMessage(trigger),
    stopLowerPriority: Boolean(trigger?.stopLowerPriority),
    executionMode: combatKind ? getCombatExecutionMode(executionMode) : executionMode,
    visibilityMode: String(trigger?.visibilityMode ?? "inherit"),
    ...(combat ? { kind: "combat", combat } : {}),
    match: normalizeMatch(match),
    extraMatches: combatKind ? [] : normalizeExtraMatches(trigger?.extraMatches ?? fallback.extraMatches),
    filters: {
      rollType: combatKind ? [] : normalizeCommaList(trigger?.filters?.rollType ?? fallback.rollType ?? ""),
      actorType: eventFields && !eventFields.actors ? [] : normalizeCommaList(trigger?.filters?.actorType ?? fallback.actorType ?? ""),
      visibility: combatKind ? [] : normalizeCommaList(trigger?.filters?.visibility ?? fallback.visibility ?? "").filter((value) => value !== "any"),
      combatState: combatKind ? "any" : String(trigger?.filters?.combatState ?? fallback.combatState ?? "any"),
      exactDiceCountByFaces: combatKind ? undefined : normalizeExactDiceCountByFaces(trigger?.filters?.exactDiceCountByFaces ?? fallback.exactDiceCountByFaces),
      includeScenes: normalizeCommaList(trigger?.filters?.includeScenes ?? fallback.includeScenes ?? ""),
      includeActors: eventFields && !eventFields.actors ? [] : normalizeCommaList(trigger?.filters?.includeActors ?? fallback.includeActors ?? ""),
      includeItems: combatKind ? [] : normalizeCommaList(trigger?.filters?.includeItems ?? fallback.includeItems ?? ""),
      playerOnly: combatKind ? false : Boolean(trigger?.filters?.playerOnly ?? fallback.playerOnly),
      gmOnly: combatKind ? false : Boolean(trigger?.filters?.gmOnly ?? fallback.gmOnly),
      // User ids have no editor field (imports and macros set them), but saving a trigger must keep them.
      users: combatKind ? [] : normalizeCommaList(trigger?.filters?.users ?? fallback.users ?? "")
    },
    actions: normalizedActions,
    source: trigger?.source ?? fallback.source ?? "user"
  };
}

export function getAllTriggers() {
  return getTriggerStore().map((trigger) => normalizeTrigger(trigger));
}

export function buildTriggerExportPayload(triggers = getAllTriggers()) {
  return {
    module: MODULE_ID,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    worldId: game.world?.id ?? null,
    worldTitle: game.world?.title ?? game.world?.id ?? null,
    triggers: triggers.map((trigger) => normalizeTrigger(trigger))
  };
}

export function buildProfileExportPayload(profiles = getProfileStore()) {
  return {
    module: MODULE_ID,
    payloadType: "profiles",
    formatVersion: PROFILE_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    worldId: game.world?.id ?? null,
    worldTitle: game.world?.title ?? game.world?.id ?? null,
    profiles: profiles.map((profile) => normalizeProfile(profile))
  };
}

export function parseImportedTriggerPayload(data) {
  const importedTriggers = Array.isArray(data?.triggers)
    ? data.triggers.map((trigger) => normalizeTrigger(trigger)).filter(Boolean)
    : [];
  if (!importedTriggers.length) throw new Error(localize("Import.Invalid"));
  return importedTriggers;
}

export function parseImportedProfilePayload(data) {
  const importedProfiles = Array.isArray(data?.profiles)
    ? data.profiles.map((profile) => normalizeProfile(profile)).filter((profile) => profile.triggers.length > 0)
    : [];
  if (!importedProfiles.length) throw new Error(localize("Import.InvalidProfiles"));
  return importedProfiles;
}

export function mergeImportedTriggers(existingTriggers, importedTriggers) {
  const merged = Array.from(existingTriggers ?? []).map((trigger) => normalizeTrigger(trigger));
  let added = 0;
  let replaced = 0;

  for (const imported of importedTriggers) {
    const index = merged.findIndex((trigger) => trigger.id === imported.id || trigger.name.toLowerCase() === imported.name.toLowerCase());
    if (index >= 0) {
      merged[index] = normalizeTrigger({
        ...merged[index],
        ...imported,
        id: merged[index].id ?? imported.id
      });
      replaced += 1;
    } else {
      merged.push(normalizeTrigger(imported));
      added += 1;
    }
  }

  return {
    triggers: merged,
    added,
    replaced,
    count: importedTriggers.length
  };
}

export function mergeImportedProfiles(existingProfiles, importedProfiles) {
  const merged = Array.from(existingProfiles ?? []).map((profile) => normalizeProfile(profile));
  let added = 0;
  let replaced = 0;

  for (const imported of importedProfiles) {
    const index = merged.findIndex((profile) => profile.id === imported.id || profile.name.toLowerCase() === imported.name.toLowerCase());
    if (index >= 0) {
      merged[index] = normalizeProfile({
        ...merged[index],
        ...imported,
        id: merged[index].id ?? imported.id
      });
      replaced += 1;
    } else {
      merged.push(normalizeProfile(imported));
      added += 1;
    }
  }

  return {
    profiles: merged,
    added,
    replaced,
    count: importedProfiles.length
  };
}

export function exportTriggers() {
  const payload = buildTriggerExportPayload();
  const filename = format("Export.FileName", { worldId: game.world?.id ?? "world" });
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
  countFeature(MODULE_ID, "fileExport");
}

export function exportProfiles() {
  const payload = buildProfileExportPayload();
  const filename = format("Export.ProfileFileName", { worldId: game.world?.id ?? "world" });
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
  countFeature(MODULE_ID, "fileExport");
}

export async function importTriggersFromFile(file) {
  const text = await foundry.utils.readTextFromFile(file);
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new Error(localize("Import.Invalid"));
  }

  const importedTriggers = parseImportedTriggerPayload(data);
  const result = mergeImportedTriggers(getAllTriggers(), importedTriggers);
  await saveTriggerStore(result.triggers);
  ui.notifications?.info(format("Notification.TriggersImported", result));
  return result;
}

export async function importProfilesFromFile(file) {
  const text = await foundry.utils.readTextFromFile(file);
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new Error(localize("Import.InvalidProfiles"));
  }

  const importedProfiles = parseImportedProfilePayload(data);
  const result = mergeImportedProfiles(getProfileStore(), importedProfiles);
  await saveProfileStore(result.profiles);
  ui.notifications?.info(format("Notification.ProfilesImported", result));
  return result;
}

export function cloneProfileTrigger(profile, trigger) {
  return normalizeTrigger({
    ...trigger,
    id: `${profile.id}.${trigger.id}`,
    source: `internal-profile:${profile.id}`
  });
}

export function findTriggerById(triggerId) {
  return getAllTriggers().find((trigger) => trigger.id === triggerId) ?? null;
}

export async function upsertTrigger(trigger) {
  const normalized = normalizeTrigger(trigger);
  const store = getAllTriggers();
  const index = store.findIndex((entry) => entry.id === normalized.id);
  if (index >= 0) store[index] = normalized;
  else store.push(normalized);
  await saveTriggerStore(store);
  return normalized;
}

export async function removeTrigger(triggerId) {
  const nextStore = getAllTriggers().filter((trigger) => trigger.id !== triggerId);
  await saveTriggerStore(nextStore);
}

export function presentTrigger(trigger) {
  const combat = isCombatTrigger(trigger);
  return {
    ...trigger,
    isCombat: combat,
    kindLabel: localize(combat ? "Manager.KindCombat" : "Manager.KindRoll"),
    enabledLabel: trigger.enabled ? localize("Manager.Enabled") : localize("Manager.Disabled"),
    executionLabel: localize(`Execution.${trigger.executionMode === "confirm-gm" ? "ConfirmGm" : trigger.executionMode === "gm-whisper-log" ? "GmWhisperLog" : trigger.executionMode === "chat-button" ? "ChatButton" : trigger.executionMode === "disabled" ? "Disabled" : "Automatic"}`),
    matchLabel: combat ? describeCombat(trigger.combat) : describeTriggerMatches(trigger),
    filtersLabel: describeFilters(trigger.filters),
    actionLabel: getActionSummary(trigger)
  };
}

// "Start of a turn | every 3 rounds" for the trigger card and the gallery.
export function describeCombat(combat) {
  const config = normalizeCombatConfig(combat);
  const parts = [localize(COMBAT_EVENT_LABEL_KEYS[config.event])];
  if (config.round && config.every) parts.push(format("Combat.RoundFromEvery", { round: config.round, every: config.every }));
  else if (config.round) parts.push(format("Combat.OnlyRound", { round: config.round }));
  else if (config.every) parts.push(format("Combat.EveryRounds", { every: config.every }));
  if (config.effect) parts.push(format("Combat.EffectNamed", { effect: config.effect }));
  return parts.join(" | ");
}

// "Show internal presets" off hides the included starter profiles, imported profiles stay visible.
export function getVisibleProfiles(profiles, showInternalPresets = true) {
  const list = Array.isArray(profiles) ? profiles : [];
  return showInternalPresets ? list : list.filter((profile) => profile?.source !== "internal-preset");
}

export function presentProfile(profile) {
  return {
    ...profile,
    sourceLabel: profile.source === "internal-preset"
      ? localize("Manager.ProfileSourceInternal")
      : localize("Manager.ProfileSourceImported")
  };
}

export function getDefaultExecutionMode() {
  try {
    return getRuntimeOptions().defaultExecutionMode || "confirm-gm";
  } catch (_error) {
    return "confirm-gm";
  }
}

