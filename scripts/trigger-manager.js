import {
  ensureModuleTranslationsLoaded,
  format,
  getExecutionModeChoices,
  getProfileStore,
  getRuntimeOptions,
  getThemePreference,
  getTriggerStore,
  localize,
  MODULE_ID,
  saveProfileStore,
  saveTriggerStore
} from "./settings.js";
import {
  ACTION_LABEL_KEYS,
  ACTION_VISIBILITY_LABEL_KEYS,
  DEFAULT_SOUND_VOLUME,
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
import { openTestBench } from "./roll-test-bench.js";

let managerApp = null;
const EXPORT_FORMAT_VERSION = 1;
const PROFILE_EXPORT_FORMAT_VERSION = 1;
const MAX_ACTION_SLOTS = 3;
const TRIGGER_DIALOG_DEFAULT_WIDTH = 560;
const TRIGGER_DIALOG_DEFAULT_HEIGHT = 560;
const TRIGGER_DIALOG_MIN_WIDTH = 440;
const TRIGGER_DIALOG_MIN_HEIGHT = 420;

const MATCH_TYPE_CHOICES = {
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

const ACTION_TYPE_CHOICES = {
  none: "Action.None",
  ...ACTION_LABEL_KEYS
};

const EFFECT_TARGET_CHOICES = {
  actor: "EffectTarget.Actor",
  targets: "EffectTarget.Targets"
};

const RESOURCE_OPERATION_CHOICES = {
  add: "ResourceOperation.Add",
  subtract: "ResourceOperation.Subtract",
  set: "ResourceOperation.Set"
};

const ACTION_VISIBILITY_CHOICES = { ...ACTION_VISIBILITY_LABEL_KEYS };

const ACTOR_TYPE_CHOICES = {
  any: "ActorType.Any",
  pc: "ActorType.Pc",
  npc: "ActorType.Npc",
  vehicle: "ActorType.Vehicle"
};

const COMBAT_STATE_CHOICES = {
  any: "CombatState.Any",
  "in-combat": "CombatState.InCombat",
  "out-of-combat": "CombatState.OutOfCombat"
};

const ACTION_FIELD_VISIBILITY = {
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

const TEMPLATE_PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}/;

const MATCH_FIELD_VISIBILITY = {
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
  "custom-js": { faces: false, value: false, threshold: false, minCount: false, degree: false, path: false, expression: true }
};

// Shared input definitions for the primary match and every additional AND condition.
const MATCH_INPUT_FIELDS = [
  { field: "faces", inputName: "triggerFaces", input: "number", labelKey: "Dialog.TriggerFaces", hintKey: "DialogHint.TriggerFaces" },
  { field: "value", inputName: "triggerValue", input: "number", labelKey: "Dialog.TriggerValue", hintKey: "DialogHint.TriggerValue" },
  { field: "threshold", inputName: "triggerThreshold", input: "number", labelKey: "Dialog.TriggerThreshold", hintKey: "DialogHint.TriggerThreshold" },
  { field: "minCount", inputName: "triggerMinCount", input: "number", labelKey: "Dialog.TriggerMinCount", hintKey: "DialogHint.TriggerMinCount", fallback: 1 },
  { field: "degree", inputName: "triggerDegree", input: "text", labelKey: "Dialog.TriggerDegree", hintKey: "DialogHint.TriggerDegree" },
  { field: "path", inputName: "triggerPath", input: "text", labelKey: "Dialog.TriggerPath", hintKey: "DialogHint.TriggerPath" },
  { field: "expression", inputName: "triggerExpression", input: "textarea", labelKey: "Dialog.TriggerExpression", hintKey: "DialogHint.TriggerExpression" }
];

const DEFAULT_EXTRA_MATCH = Object.freeze({ type: "die-value", faces: null, value: null, threshold: null, minCount: 1, degree: null, path: null, expression: null });

const TRIGGER_DIALOG_TABS = ["general", "match", "filters", "actions"];
const ITEM_ROLL_TYPES = new Set(["attack", "check", "save", "damage", "healing", "skill"]);

function localizeChoiceMap(choices) {
  return Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, localize(value)]));
}

function getDialogTooltip(hintKey) {
  return escapeHtml(localize(hintKey));
}

function renderDialogLabel(labelKey, hintKey) {
  const label = escapeHtml(localize(labelKey));
  const tooltip = getDialogTooltip(hintKey);
  return `<label title="${tooltip}" aria-label="${tooltip}">${label}</label>`;
}

function renderDialogLegend(labelKey, hintKey, suffix = "") {
  const label = `${escapeHtml(localize(labelKey))}${suffix ? ` ${escapeHtml(suffix)}` : ""}`;
  const tooltip = getDialogTooltip(hintKey);
  return `<legend title="${tooltip}" aria-label="${tooltip}">${label}</legend>`;
}

function normalizeCommaList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry ?? "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function getCollectionEntries(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}

function getReferenceCollection(referenceType) {
  if (referenceType === "scene") return game.scenes;
  if (referenceType === "actor") return game.actors;
  if (referenceType === "item") return game.items;
  if (referenceType === "table") return game.tables ?? game.rollTables;
  if (referenceType === "macro") return game.macros;
  if (referenceType === "journal") return game.journal ?? game.journalEntries;
  return null;
}

function getReferenceChoices(referenceType) {
  const collection = getReferenceCollection(referenceType);
  const values = new Set();

  for (const entry of getCollectionEntries(collection)) {
    if (entry?.id) values.add(String(entry.id));
    if (entry?.name) values.add(String(entry.name));
    if (entry?.uuid) values.add(String(entry.uuid));
  }

  return [...values];
}

function getReferenceSelectChoices(referenceType, selectedValues = []) {
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

function getSelectedReferenceValue(values) {
  return normalizeCommaList(values)[0] ?? "";
}

function getSelectedFilterValue(values, defaultValue = "any") {
  return normalizeCommaList(values)[0] ?? defaultValue;
}

function getSelectedFilterValues(values, defaultValues = []) {
  const selectedValues = normalizeCommaList(values);
  return selectedValues.length ? selectedValues : normalizeCommaList(defaultValues);
}

function getSelectChoices(choices, selectedValues = []) {
  const resolved = { ...choices };

  for (const value of normalizeCommaList(selectedValues)) {
    if (!value || resolved[value]) continue;
    resolved[value] = value;
  }

  return resolved;
}

function getDialogSelectValues(dialogHtml, selector, defaultValues = []) {
  return getSelectedFilterValues(dialogHtml.find(selector).val(), defaultValues);
}

function getMultiSelectSummaryLabel(select) {
  if (!select) return "";
  const selectedOptions = Array.from(select.selectedOptions ?? [])
    .map((option) => String(option.textContent ?? "").trim())
    .filter(Boolean);
  if (selectedOptions.length) return selectedOptions.join(", ");
  return String(select.dataset?.srtEmptyLabel ?? "").trim();
}

function updateMultiSelectSummary(root, selectName) {
  const summary = root.querySelector?.(`[data-srt-multiselect-summary="${selectName}"]`) ?? null;
  const select = root.querySelector?.(`select[name="${selectName}"]`) ?? null;
  if (!summary || !select) return;
  summary.textContent = getMultiSelectSummaryLabel(select);
}

function updateAllMultiSelectSummaries(root) {
  for (const summary of root.querySelectorAll?.("[data-srt-multiselect-summary]") ?? []) {
    const selectName = summary.dataset?.srtMultiselectSummary;
    if (!selectName) continue;
    updateMultiSelectSummary(root, selectName);
  }
}

function resolveReferenceEntry(referenceType, value) {
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

function formatReferenceValue(referenceType, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const entry = resolveReferenceEntry(referenceType, raw);
  if (!entry?.name || !entry?.id) return raw;
  return `${entry.name} (${entry.id})`;
}

function formatReferenceList(referenceType, values) {
  return normalizeCommaList(values).map((value) => formatReferenceValue(referenceType, value)).join(", ");
}

function parseReferenceToken(referenceType, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const labeledMatch = raw.match(/^(.*)\(([^()]+)\)\s*$/);
  const candidate = labeledMatch?.[2]?.trim() || raw;
  const entry = resolveReferenceEntry(referenceType, candidate) ?? resolveReferenceEntry(referenceType, raw);
  return String(entry?.id ?? candidate);
}

function parseReferenceList(referenceType, value) {
  return normalizeCommaList(value).map((entry) => parseReferenceToken(referenceType, entry));
}

function buildDatalistOptions(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function getActionFieldState(actionType) {
  return ACTION_FIELD_VISIBILITY[actionType] ?? ACTION_FIELD_VISIBILITY.none;
}

function getMatchFieldState(matchType) {
  return MATCH_FIELD_VISIBILITY[matchType] ?? MATCH_FIELD_VISIBILITY["die-max"];
}

function resolveDialogRoot(dialogHtml) {
  if (!dialogHtml) return null;
  if (dialogHtml instanceof HTMLElement) return dialogHtml;
  if (dialogHtml[0] instanceof HTMLElement) return dialogHtml[0];
  if (dialogHtml.element?.[0] instanceof HTMLElement) return dialogHtml.element[0];
  if (dialogHtml.form instanceof HTMLElement) return dialogHtml.form.closest(".dialog") ?? dialogHtml.form;
  return null;
}

function applyActionFieldState(actionContainer, actionType) {
  const state = getActionFieldState(actionType);
  for (const section of actionContainer.querySelectorAll("[data-srt-action-field]")) {
    const field = section.dataset.srtActionField;
    section.hidden = !state[field];
  }
}

function applyMatchFieldState(root, matchType) {
  const state = getMatchFieldState(matchType);
  for (const section of root.querySelectorAll("[data-srt-match-field]")) {
    const field = section.dataset.srtMatchField;
    section.hidden = !state[field];
  }
}

function applyExtraMatchFieldState(condition, matchType) {
  const state = getMatchFieldState(matchType);
  for (const section of condition.querySelectorAll("[data-srt-extra-match-field]")) {
    const field = section.dataset.srtExtraMatchField;
    section.hidden = !state[field];
  }
}

function renderMatchFieldGroups(match, { extra = false } = {}) {
  return MATCH_INPUT_FIELDS.map((definition) => {
    const fieldAttribute = extra
      ? `data-srt-extra-match-field="${definition.field}"`
      : `data-srt-match-field="${definition.field}"`;
    const inputAttribute = extra
      ? `data-srt-extra-match-input="${definition.field}"`
      : `name="${definition.inputName}"`;
    const value = escapeHtml(match?.[definition.field] ?? definition.fallback ?? "");
    const label = renderDialogLabel(definition.labelKey, definition.hintKey);

    if (definition.input === "textarea") {
      return `
          <div class="form-group srt-dialog-field--stacked srt-trigger-dialog__expression-field" ${fieldAttribute}>
            ${label}
            <textarea ${inputAttribute} rows="${extra ? 3 : 5}" spellcheck="false">${value}</textarea>
          </div>`;
    }

    return `
          <div class="form-group" ${fieldAttribute}>
            ${label}
            <input type="${definition.input}" ${inputAttribute} value="${value}">
          </div>`;
  }).join("");
}

function renderExtraMatchCondition(match, index) {
  const legendTooltip = getDialogTooltip("DialogHint.TriggerExtraMatch");
  const removeTooltip = getDialogTooltip("DialogHint.TriggerExtraMatchRemove");
  const type = String(match?.type ?? DEFAULT_EXTRA_MATCH.type);

  return `
        <fieldset class="srt-extra-match" data-srt-extra-match>
          <legend title="${legendTooltip}">${escapeHtml(localize("Dialog.TriggerExtraMatch"))} <span data-srt-extra-match-number>${Number(index) + 1}</span></legend>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerMatchType", "DialogHint.TriggerMatchType")}
            <select data-srt-extra-match-input="type">${buildSelectOptions(localizeChoiceMap(MATCH_TYPE_CHOICES), type)}</select>
          </div>
          ${renderMatchFieldGroups(match, { extra: true })}
          <div class="srt-extra-match__actions">
            <button type="button" class="srt-inline-action is-danger" data-srt-extra-match-remove title="${removeTooltip}">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
              <span class="srt-inline-action__label">${escapeHtml(localize("Dialog.TriggerExtraMatchRemove"))}</span>
            </button>
          </div>
        </fieldset>`;
}

function renderExtraMatchSection(extraMatches = []) {
  const addTooltip = getDialogTooltip("DialogHint.TriggerExtraMatchAdd");

  return `
          <div class="srt-extra-matches" data-srt-extra-matches>
            <div class="srt-extra-matches__list" data-srt-extra-match-list>
              ${extraMatches.map((match, index) => renderExtraMatchCondition(match, index)).join("")}
            </div>
            <div class="srt-extra-matches__toolbar">
              <button type="button" class="srt-inline-action" data-srt-extra-match-add title="${addTooltip}">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                <span class="srt-inline-action__label">${escapeHtml(localize("Dialog.TriggerExtraMatchAdd"))}</span>
              </button>
            </div>
          </div>`;
}

function renumberExtraMatchConditions(list) {
  Array.from(list?.querySelectorAll?.("[data-srt-extra-match]") ?? []).forEach((condition, index) => {
    const number = condition.querySelector?.("[data-srt-extra-match-number]");
    if (number) number.textContent = String(index + 1);
  });
}

function wireExtraMatchCondition(condition, list) {
  const select = condition.querySelector?.('[data-srt-extra-match-input="type"]') ?? null;
  if (select) {
    const updateState = () => applyExtraMatchFieldState(condition, select.value);
    select.addEventListener("change", updateState);
    updateState();
  }

  condition.querySelector?.("[data-srt-extra-match-remove]")?.addEventListener("click", (event) => {
    event?.preventDefault?.();
    condition.remove();
    renumberExtraMatchConditions(list);
  });
}

function configureExtraMatchConditions(root) {
  const section = root.querySelector?.("[data-srt-extra-matches]") ?? null;
  const list = section?.querySelector?.("[data-srt-extra-match-list]") ?? null;
  if (!section || !list) return;

  for (const condition of list.querySelectorAll?.("[data-srt-extra-match]") ?? []) wireExtraMatchCondition(condition, list);

  section.querySelector?.("[data-srt-extra-match-add]")?.addEventListener("click", (event) => {
    event?.preventDefault?.();
    const index = list.querySelectorAll("[data-srt-extra-match]").length;
    list.insertAdjacentHTML("beforeend", renderExtraMatchCondition(DEFAULT_EXTRA_MATCH, index));
    const condition = list.lastElementChild;
    if (!condition) return;
    wireExtraMatchCondition(condition, list);
    condition.querySelector?.('[data-srt-extra-match-input="type"]')?.focus?.();
  });
}

function readExtraMatchCondition(condition) {
  const read = (field) => String(condition.querySelector?.(`[data-srt-extra-match-input="${field}"]`)?.value ?? "").trim();

  return {
    type: read("type") || DEFAULT_EXTRA_MATCH.type,
    faces: read("faces"),
    value: read("value"),
    threshold: read("threshold"),
    minCount: read("minCount") || "1",
    degree: read("degree"),
    path: read("path"),
    expression: read("expression")
  };
}

function readExtraMatchesFromDialog(dialogHtml) {
  const root = resolveDialogRoot(dialogHtml);
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll("[data-srt-extra-match]")).map((condition) => readExtraMatchCondition(condition));
}

function getFilterDetailState({ actorType = [], rollType = [] } = {}) {
  const actorTypes = normalizeCommaList(actorType).filter((value) => value !== "any");
  const rollTypes = normalizeCommaList(rollType).filter((value) => value !== "any");
  return {
    scene: true,
    actor: actorTypes.length > 0,
    item: rollTypes.some((value) => ITEM_ROLL_TYPES.has(value))
  };
}

function applyFilterDetailState(root) {
  const rollType = getSelectedFilterValues(root.querySelector?.('select[name="triggerRollTypes"]')?.value ?? []);
  const actorType = getSelectedFilterValues(root.querySelector?.('select[name="triggerActorTypes"]')?.value ?? []);
  const state = getFilterDetailState({ actorType, rollType });

  for (const section of root.querySelectorAll("[data-srt-filter-detail]")) {
    const detail = section.dataset.srtFilterDetail;
    section.hidden = !state[detail];
  }
}

function ensureTriggerDialogResizeHandle(root) {
  const wrapper = getTriggerDialogWrapper(root);
  if (!wrapper || wrapper.querySelector?.(".window-resizable-handle, .srt-dialog-resize-handle")) return;

  const handle = document.createElement("div");
  handle.className = "srt-dialog-resize-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.innerHTML = '<i class="fas fa-up-right-and-down-left-from-center"></i>';
  wrapper.appendChild(handle);

  handle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const rect = wrapper.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;

    const onMouseMove = (moveEvent) => {
      const size = calculateTriggerDialogResize({
        startWidth,
        startHeight,
        startX,
        startY,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY
      });
      wrapper.style.width = `${size.width}px`;
      wrapper.style.height = `${size.height}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function calculateTriggerDialogResize({ startWidth, startHeight, startX, startY, currentX, currentY }) {
  return {
    width: Math.max(TRIGGER_DIALOG_MIN_WIDTH, Math.round(Number(startWidth) + Number(currentX) - Number(startX))),
    height: Math.max(TRIGGER_DIALOG_MIN_HEIGHT, Math.round(Number(startHeight) + Number(currentY) - Number(startY)))
  };
}

function getTriggerDialogWrapper(root) {
  return root?.closest?.(".dialog, .app, .window-app") ?? null;
}

function ensureTriggerDialogSize(root) {
  const wrapper = getTriggerDialogWrapper(root);
  if (!wrapper) return;

  const rect = typeof wrapper.getBoundingClientRect === "function"
    ? wrapper.getBoundingClientRect()
    : { width: 0, height: 0 };

  wrapper.style.minWidth = `${TRIGGER_DIALOG_MIN_WIDTH}px`;
  wrapper.style.minHeight = `${TRIGGER_DIALOG_MIN_HEIGHT}px`;

  const width = Math.max(Math.round(Number(rect.width) || 0), TRIGGER_DIALOG_DEFAULT_WIDTH, TRIGGER_DIALOG_MIN_WIDTH);
  const height = Math.max(Math.round(Number(rect.height) || 0), TRIGGER_DIALOG_DEFAULT_HEIGHT, TRIGGER_DIALOG_MIN_HEIGHT);

  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
}

function resizeTriggerDialogToContent(root) {
  const wrapper = getTriggerDialogWrapper(root);
  const content = wrapper?.querySelector?.(".window-content") ?? null;
  if (!wrapper || !content) return;

  if (wrapper.dataset?.srtAutoHeight) delete wrapper.dataset.srtAutoHeight;
  content.style.height = "auto";
}

function setTriggerDialogTab(root, tabId) {
  const activeTab = TRIGGER_DIALOG_TABS.includes(tabId) ? tabId : TRIGGER_DIALOG_TABS[0];
  const theme = getTriggerDialogWrapper(root)?.dataset?.uiTheme
    ?? root?.dataset?.uiTheme
    ?? getThemePreference();

  for (const button of root.querySelectorAll("[data-srt-dialog-tab]")) {
    const isActive = button.dataset.srtDialogTab === activeTab;
    button.classList?.toggle?.("active", isActive);
    if (typeof button.setAttribute === "function") button.setAttribute("aria-selected", isActive ? "true" : "false");
    if ("tabIndex" in button) button.tabIndex = isActive ? 0 : -1;

    if (button.style) {
      if (theme === "foundry") {
        button.style.backgroundColor = isActive ? "rgba(255, 255, 255, 0.04)" : "transparent";
        button.style.backgroundImage = "none";
        button.style.borderTopColor = isActive ? "rgba(214, 156, 109, 0.18)" : "transparent";
        button.style.borderRightColor = isActive ? "rgba(214, 156, 109, 0.18)" : "transparent";
        button.style.borderLeftColor = isActive ? "rgba(214, 156, 109, 0.18)" : "transparent";
        button.style.borderBottomColor = "transparent";
      } else {
        button.style.backgroundColor = "";
        button.style.backgroundImage = "";
        button.style.borderTopColor = "";
        button.style.borderRightColor = "";
        button.style.borderLeftColor = "";
        button.style.borderBottomColor = "";
      }
    }
  }

  for (const panel of root.querySelectorAll("[data-srt-dialog-panel]")) {
    const isActive = panel.dataset.srtDialogPanel === activeTab;
    panel.hidden = !isActive;
    panel.classList?.toggle?.("active", isActive);
    panel.classList?.toggle?.("is-active", isActive);
  }
}

function configureTriggerDialog(dialogHtml) {
  const root = resolveDialogRoot(dialogHtml);
  if (!root) return;

  for (const button of root.querySelectorAll("[data-srt-dialog-tab]")) {
    if (typeof button?.addEventListener !== "function") continue;
    button.addEventListener("click", (event) => {
      event?.preventDefault?.();
      setTriggerDialogTab(root, button.dataset.srtDialogTab);
    });
  }

  const initialTab = typeof root.querySelector === "function"
    ? root.querySelector("[data-srt-dialog-tab]")?.dataset?.srtDialogTab
    : null;
  setTriggerDialogTab(root, initialTab ?? TRIGGER_DIALOG_TABS[0]);

  const matchTypeSelect = typeof root.querySelector === "function"
    ? root.querySelector('select[name="triggerMatchType"]')
    : null;
  if (matchTypeSelect) {
    const updateMatchState = () => {
      applyMatchFieldState(root, matchTypeSelect.value);
    };
    matchTypeSelect.addEventListener("change", updateMatchState);
    updateMatchState();
  }
  configureExtraMatchConditions(root);

  for (const filterSelect of root.querySelectorAll('select[name="triggerRollTypes"], select[name="triggerActorTypes"]')) {
    filterSelect.addEventListener("change", () => {
      applyFilterDetailState(root);
      updateMultiSelectSummary(root, filterSelect.name);
    });
  }
  for (const multiSelect of root.querySelectorAll('select[multiple]')) {
    multiSelect.addEventListener("change", () => updateMultiSelectSummary(root, multiSelect.name));
  }
  applyFilterDetailState(root);
  updateAllMultiSelectSummaries(root);

  for (const actionContainer of root.querySelectorAll("[data-srt-action-config]")) {
    const select = actionContainer.querySelector("[data-srt-action-type]");
    if (!select) continue;

    const updateState = () => {
      applyActionFieldState(actionContainer, select.value);
    };
    select.addEventListener("change", updateState);
    updateState();
  }
  configureFilePickerButtons(root);

  ensureTriggerDialogSize(root);
  resizeTriggerDialogToContent(root);
  ensureTriggerDialogResizeHandle(root);
}

function applyManagerTheme(element, theme = getThemePreference()) {
  if (!element) return;

  const resolvedTheme = theme === "foundry" ? "foundry" : "signature";
  element.classList?.add?.("srt-window");
  element.dataset.uiTheme = resolvedTheme;
  element.classList.toggle("is-theme-foundry", resolvedTheme === "foundry");
  element.classList.toggle("is-theme-signature", resolvedTheme !== "foundry");

  const root = element.querySelector(".srt-app");
  if (root) root.dataset.uiTheme = resolvedTheme;
}

function applyDialogTheme(dialogHtml, theme = getThemePreference()) {
  const root = resolveDialogRoot(dialogHtml);
  const wrapper = root?.closest?.(".dialog, .app, .window-app")
    ?? dialogHtml?.closest?.(".dialog, .app, .window-app")?.[0]
    ?? dialogHtml?.parents?.(".dialog, .app, .window-app")?.[0]
    ?? null;

  if (wrapper) {
    wrapper.classList?.add?.("srt-window");
    applyManagerTheme(wrapper, theme);
    return;
  }

  applyManagerTheme(root, theme);
}

function getActionSummary(trigger) {
  const actions = Array.isArray(trigger.actions) ? trigger.actions : [];
  if (!actions.length) return localize("Action.None");

  return actions.map((action) => describeAction(action)).join(" + ");
}

// Empty match fields are null after normalization. Number(null) would display them as 0.
function getDisplayNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function describeMatch(match) {
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

function describeTriggerMatches(trigger) {
  const extraMatches = Array.isArray(trigger?.extraMatches) ? trigger.extraMatches.filter(Boolean) : [];
  if (!extraMatches.length) return describeMatch(trigger?.match);
  return [trigger?.match, ...extraMatches].map((match) => describeMatch(match)).join(` ${localize("Manager.MatchAnd")} `);
}

function describeFilters(filters) {
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

function normalizeAction(action) {
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

function isValidFormula(formula) {
  if (TEMPLATE_PLACEHOLDER.test(formula)) return true;
  const validate = globalThis.Roll?.validate;
  return typeof validate === "function" ? Boolean(validate.call(globalThis.Roll, formula)) : true;
}

// Problems of one editor action slot (raw form values, volume in percent). The new action types are checked,
// the older ones keep their behavior: an incomplete entry is dropped when the trigger is saved.
function validateEditorAction(action, index) {
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

function validateEditorActions(actions) {
  return (Array.isArray(actions) ? actions : []).flatMap((action, index) => validateEditorAction(action, index));
}

function getStatusEffectChoices(selected = "") {
  const statuses = Array.from(globalThis.CONFIG?.statusEffects ?? []).filter((status) => status?.id);
  const entries = statuses
    .map((status) => [String(status.id), getStatusEffectLabel(status.id)])
    .sort(([, left], [, right]) => left.localeCompare(right, game.i18n?.lang));
  const choices = { "": localize("Dialog.StatusNone"), ...Object.fromEntries(entries) };
  const current = String(selected ?? "").trim();
  if (current && !choices[current]) choices[current] = current;
  return choices;
}

function renderActionInputField({ field, name, value, labelKey, hintKey, type = "text", attributes = "" }) {
  return `
              <div class="form-group" data-srt-action-field="${field}">
                ${renderDialogLabel(labelKey, hintKey)}
                <input type="${type}" name="${name}" value="${escapeHtml(value ?? "")}"${attributes ? ` ${attributes}` : ""}>
              </div>`;
}

function renderActionSelectField({ field, name, choices, selected, labelKey, hintKey }) {
  return `
              <div class="form-group" data-srt-action-field="${field}">
                ${renderDialogLabel(labelKey, hintKey)}
                <select name="${name}">${buildSelectOptions(choices, selected)}</select>
              </div>`;
}

function renderActionFileField({ field, name, value, labelKey, hintKey, pickerType }) {
  const browse = escapeHtml(localize("Dialog.BrowseFiles"));
  return `
              <div class="form-group" data-srt-action-field="${field}">
                ${renderDialogLabel(labelKey, hintKey)}
                <div class="form-fields srt-file-field">
                  <input type="text" name="${name}" value="${escapeHtml(value ?? "")}">
                  <button type="button" class="srt-file-picker" data-srt-file-picker="${pickerType}" data-srt-file-target="${name}" title="${browse}" aria-label="${browse}">
                    <i class="fa-solid fa-file-import" aria-hidden="true"></i>
                  </button>
                </div>
              </div>`;
}

// Editor fields of the sound, effect, resource, image and formula actions for one action slot.
function renderExtendedActionFields(action, index) {
  return [
    renderActionFileField({ field: "sound", name: `triggerSound${index}`, value: action.sound, labelKey: "Dialog.TriggerSound", hintKey: "DialogHint.TriggerSound", pickerType: "audio" }),
    renderActionInputField({ field: "volume", name: `triggerSoundVolume${index}`, value: action.volumePercent, type: "number", attributes: "min=\"0\" max=\"100\" step=\"5\"", labelKey: "Dialog.TriggerSoundVolume", hintKey: "DialogHint.TriggerSoundVolume" }),
    renderActionSelectField({ field: "status", name: `triggerEffectStatus${index}`, choices: getStatusEffectChoices(action.status), selected: action.status, labelKey: "Dialog.TriggerEffectStatus", hintKey: "DialogHint.TriggerEffectStatus" }),
    renderActionInputField({ field: "effectUuid", name: `triggerEffectUuid${index}`, value: action.effectUuid, labelKey: "Dialog.TriggerEffectUuid", hintKey: "DialogHint.TriggerEffectUuid" }),
    renderActionInputField({ field: "rounds", name: `triggerEffectRounds${index}`, value: action.rounds ?? "", type: "number", attributes: "min=\"1\" step=\"1\"", labelKey: "Dialog.TriggerEffectRounds", hintKey: "DialogHint.TriggerEffectRounds" }),
    renderActionSelectField({ field: "effectTarget", name: `triggerEffectTarget${index}`, choices: localizeChoiceMap(EFFECT_TARGET_CHOICES), selected: action.target, labelKey: "Dialog.TriggerEffectTarget", hintKey: "DialogHint.TriggerEffectTarget" }),
    renderActionInputField({ field: "resourcePath", name: `triggerResourcePath${index}`, value: action.path, labelKey: "Dialog.TriggerResourcePath", hintKey: "DialogHint.TriggerResourcePath", attributes: "spellcheck=\"false\"" }),
    renderActionSelectField({ field: "resourceOperation", name: `triggerResourceOperation${index}`, choices: localizeChoiceMap(RESOURCE_OPERATION_CHOICES), selected: action.operation, labelKey: "Dialog.TriggerResourceOperation", hintKey: "DialogHint.TriggerResourceOperation" }),
    renderActionInputField({ field: "resourceValue", name: `triggerResourceValue${index}`, value: action.value, labelKey: "Dialog.TriggerResourceValue", hintKey: "DialogHint.TriggerResourceValue" }),
    renderActionFileField({ field: "image", name: `triggerImage${index}`, value: action.image, labelKey: "Dialog.TriggerImage", hintKey: "DialogHint.TriggerImage", pickerType: "imagevideo" }),
    renderActionInputField({ field: "caption", name: `triggerImageCaption${index}`, value: action.caption, labelKey: "Dialog.TriggerImageCaption", hintKey: "DialogHint.TriggerImageCaption" }),
    renderActionInputField({ field: "formula", name: `triggerRollFormula${index}`, value: action.formula, labelKey: "Dialog.TriggerRollFormula", hintKey: "DialogHint.TriggerRollFormula", attributes: "spellcheck=\"false\"" }),
    renderActionInputField({ field: "flavor", name: `triggerRollFlavor${index}`, value: action.flavor, labelKey: "Dialog.TriggerRollFlavor", hintKey: "DialogHint.TriggerRollFlavor" })
  ].join("");
}

function readExtendedActionFields(dialogHtml, index) {
  const read = (selector) => String(dialogHtml.find(selector).val() ?? "");
  const volumePercent = read(`input[name="triggerSoundVolume${index}"]`).trim();

  return {
    sound: read(`input[name="triggerSound${index}"]`),
    volumePercent,
    volume: volumePercent === "" ? DEFAULT_SOUND_VOLUME : Number(volumePercent) / 100,
    status: read(`select[name="triggerEffectStatus${index}"]`),
    effectUuid: read(`input[name="triggerEffectUuid${index}"]`),
    rounds: read(`input[name="triggerEffectRounds${index}"]`),
    target: read(`select[name="triggerEffectTarget${index}"]`) || "actor",
    path: read(`input[name="triggerResourcePath${index}"]`),
    operation: read(`select[name="triggerResourceOperation${index}"]`) || "add",
    value: read(`input[name="triggerResourceValue${index}"]`),
    image: read(`input[name="triggerImage${index}"]`),
    caption: read(`input[name="triggerImageCaption${index}"]`),
    formula: read(`input[name="triggerRollFormula${index}"]`),
    flavor: read(`input[name="triggerRollFlavor${index}"]`)
  };
}

function openFilePickerFor(input, type) {
  const FilePickerClass = globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
  if (!input || !FilePickerClass) return null;

  const picker = new FilePickerClass({
    type,
    current: input.value,
    callback: (path) => {
      input.value = path;
      input.dispatchEvent?.(new Event("change", { bubbles: true }));
    }
  });
  picker.render({ force: true });
  return picker;
}

function configureFilePickerButtons(root) {
  for (const button of root.querySelectorAll?.("[data-srt-file-picker]") ?? []) {
    button.addEventListener("click", (event) => {
      event?.preventDefault?.();
      const input = root.querySelector?.(`[name="${button.dataset.srtFileTarget}"]`) ?? null;
      openFilePickerFor(input, button.dataset.srtFilePicker);
    });
  }
}

function normalizeActionList(actions, fallback = []) {
  const source = Array.isArray(actions) && actions.length ? actions : Array.isArray(fallback) ? fallback : [];
  return source.map((action) => normalizeAction(action)).filter(Boolean);
}

function normalizeOptionalNumber(value, fallback = null) {
  if (value === "" || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOptionalText(value) {
  if (value == null) return null;
  return String(value).trim() || null;
}

function normalizeExactDiceCountByFaces(value) {
  if (!value || typeof value !== "object") return undefined;

  const entries = Object.entries(value)
    .map(([faces, count]) => [Number(faces), Number(count)])
    .filter(([faces, count]) => Number.isFinite(faces) && faces > 0 && Number.isFinite(count) && count > 0)
    .map(([faces, count]) => [String(Math.trunc(faces)), Math.trunc(count)]);

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeMatch(match) {
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
function normalizeExtraMatches(extraMatches) {
  if (!Array.isArray(extraMatches)) return [];
  return extraMatches
    .filter((match) => match && typeof match === "object" && !Array.isArray(match))
    .map((match) => normalizeMatch(match));
}

function buildEditableActions(actions) {
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

function normalizeProfile(profile, fallback = {}) {
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

function normalizeTrigger(trigger, fallback = {}) {
  const match = trigger?.match ?? fallback.match ?? { type: "die-max", faces: 20, minCount: 1 };
  const normalizedActions = normalizeActionList(
    trigger?.actions,
    fallback.action ? [fallback.action] : fallback.actions
  );

  return {
    id: String(trigger?.id ?? foundry.utils.randomID()),
    name: String(trigger?.name ?? fallback.name ?? "").trim() || localize("Manager.Create"),
    description: String(trigger?.description ?? "").trim(),
    category: String(trigger?.category ?? fallback.category ?? "house-rule").trim(),
    icon: trigger?.icon ?? null,
    enabled: trigger?.enabled !== false,
    priority: Number(trigger?.priority ?? fallback.priority ?? 100),
    oncePerMessage: trigger?.oncePerMessage !== false,
    allowMultipleMatches: Boolean(trigger?.allowMultipleMatches),
    stopLowerPriority: Boolean(trigger?.stopLowerPriority),
    executionMode: String(trigger?.executionMode ?? fallback.executionMode ?? "confirm-gm"),
    visibilityMode: String(trigger?.visibilityMode ?? "inherit"),
    match: normalizeMatch(match),
    extraMatches: normalizeExtraMatches(trigger?.extraMatches ?? fallback.extraMatches),
    filters: {
      rollType: normalizeCommaList(trigger?.filters?.rollType ?? fallback.rollType ?? ""),
      actorType: normalizeCommaList(trigger?.filters?.actorType ?? fallback.actorType ?? ""),
      visibility: normalizeCommaList(trigger?.filters?.visibility ?? fallback.visibility ?? "").filter((value) => value !== "any"),
      combatState: String(trigger?.filters?.combatState ?? fallback.combatState ?? "any"),
      exactDiceCountByFaces: normalizeExactDiceCountByFaces(trigger?.filters?.exactDiceCountByFaces ?? fallback.exactDiceCountByFaces),
      includeScenes: normalizeCommaList(trigger?.filters?.includeScenes ?? fallback.includeScenes ?? ""),
      includeActors: normalizeCommaList(trigger?.filters?.includeActors ?? fallback.includeActors ?? ""),
      includeItems: normalizeCommaList(trigger?.filters?.includeItems ?? fallback.includeItems ?? ""),
      playerOnly: Boolean(trigger?.filters?.playerOnly ?? fallback.playerOnly),
      gmOnly: Boolean(trigger?.filters?.gmOnly ?? fallback.gmOnly),
      // User ids have no editor field (imports and macros set them), but saving a trigger must keep them.
      users: normalizeCommaList(trigger?.filters?.users ?? fallback.users ?? "")
    },
    actions: normalizedActions,
    source: trigger?.source ?? fallback.source ?? "user"
  };
}

function getAllTriggers() {
  return getTriggerStore().map((trigger) => normalizeTrigger(trigger));
}

function buildTriggerExportPayload(triggers = getAllTriggers()) {
  return {
    module: MODULE_ID,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    worldId: game.world?.id ?? null,
    worldTitle: game.world?.title ?? game.world?.id ?? null,
    triggers: triggers.map((trigger) => normalizeTrigger(trigger))
  };
}

function buildProfileExportPayload(profiles = getProfileStore()) {
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

function parseImportedTriggerPayload(data) {
  const importedTriggers = Array.isArray(data?.triggers)
    ? data.triggers.map((trigger) => normalizeTrigger(trigger)).filter(Boolean)
    : [];
  if (!importedTriggers.length) throw new Error(localize("Import.Invalid"));
  return importedTriggers;
}

function parseImportedProfilePayload(data) {
  const importedProfiles = Array.isArray(data?.profiles)
    ? data.profiles.map((profile) => normalizeProfile(profile)).filter((profile) => profile.triggers.length > 0)
    : [];
  if (!importedProfiles.length) throw new Error(localize("Import.InvalidProfiles"));
  return importedProfiles;
}

function mergeImportedTriggers(existingTriggers, importedTriggers) {
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

function mergeImportedProfiles(existingProfiles, importedProfiles) {
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

function exportTriggers() {
  const payload = buildTriggerExportPayload();
  const filename = format("Export.FileName", { worldId: game.world?.id ?? "world" });
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
}

function exportProfiles() {
  const payload = buildProfileExportPayload();
  const filename = format("Export.ProfileFileName", { worldId: game.world?.id ?? "world" });
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
}

async function importTriggersFromFile(file) {
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

async function importProfilesFromFile(file) {
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

function cloneProfileTrigger(profile, trigger) {
  return normalizeTrigger({
    ...trigger,
    id: `${profile.id}.${trigger.id}`,
    source: `internal-profile:${profile.id}`
  });
}

function findTriggerById(triggerId) {
  return getAllTriggers().find((trigger) => trigger.id === triggerId) ?? null;
}

async function upsertTrigger(trigger) {
  const normalized = normalizeTrigger(trigger);
  const store = getAllTriggers();
  const index = store.findIndex((entry) => entry.id === normalized.id);
  if (index >= 0) store[index] = normalized;
  else store.push(normalized);
  await saveTriggerStore(store);
  return normalized;
}

async function removeTrigger(triggerId) {
  const nextStore = getAllTriggers().filter((trigger) => trigger.id !== triggerId);
  await saveTriggerStore(nextStore);
}

function presentTrigger(trigger) {
  return {
    ...trigger,
    enabledLabel: trigger.enabled ? localize("Manager.Enabled") : localize("Manager.Disabled"),
    executionLabel: localize(`Execution.${trigger.executionMode === "confirm-gm" ? "ConfirmGm" : trigger.executionMode === "gm-whisper-log" ? "GmWhisperLog" : trigger.executionMode === "chat-button" ? "ChatButton" : trigger.executionMode === "disabled" ? "Disabled" : "Automatic"}`),
    matchLabel: describeTriggerMatches(trigger),
    filtersLabel: describeFilters(trigger.filters),
    actionLabel: getActionSummary(trigger)
  };
}

// "Show internal presets" off hides the included starter profiles, imported profiles stay visible.
function getVisibleProfiles(profiles, showInternalPresets = true) {
  const list = Array.isArray(profiles) ? profiles : [];
  return showInternalPresets ? list : list.filter((profile) => profile?.source !== "internal-preset");
}

function presentProfile(profile) {
  return {
    ...profile,
    sourceLabel: profile.source === "internal-preset"
      ? localize("Manager.ProfileSourceInternal")
      : localize("Manager.ProfileSourceImported")
  };
}

function buildSelectOptions(choices, selected) {
  const selectedValues = new Set(normalizeCommaList(selected));
  return Object.entries(choices)
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${selectedValues.has(value) ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

// New triggers start with the execution mode chosen in the module settings.
function getDefaultExecutionMode() {
  try {
    return getRuntimeOptions().defaultExecutionMode || "confirm-gm";
  } catch (_error) {
    return "confirm-gm";
  }
}

async function promptTriggerData(trigger = null, duplicate = false) {
  const current = normalizeTrigger(trigger ?? {}, {
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

  const editableActions = buildEditableActions(current.actions);
  const title = duplicate
    ? localize("Dialog.TriggerDuplicateTitle")
    : trigger
      ? localize("Dialog.TriggerEditTitle")
      : localize("Dialog.TriggerCreateTitle");
  const result = await Dialog.prompt({
    title,
    width: 760,
    height: 620,
    resizable: true,
    content: `
      <form class="standard-form srt-trigger-dialog">
        <nav class="sheet-tabs tabs top-tabs srt-trigger-dialog__tabs" role="tablist" aria-label="${escapeHtml(localize("Dialog.TabsLabel"))}" aria-roledescription="${escapeHtml(localize("Dialog.TabsRoleDescription"))}" data-application-part="tabs">
          <a class="active srt-trigger-dialog__tab" data-action="tab" data-group="sheet" data-tab="general" data-srt-dialog-tab="general" role="tab" aria-selected="true">
            <i class="fa-solid fa-file-lines srt-trigger-dialog__tab-icon" aria-hidden="true" inert></i>
            <span class="srt-trigger-dialog__tab-label">${escapeHtml(localize("Dialog.TabGeneral"))}</span>
          </a>
          <a class="srt-trigger-dialog__tab" data-action="tab" data-group="sheet" data-tab="match" data-srt-dialog-tab="match" role="tab" aria-selected="false">
            <i class="fa-solid fa-dice-d20 srt-trigger-dialog__tab-icon" aria-hidden="true" inert></i>
            <span class="srt-trigger-dialog__tab-label">${escapeHtml(localize("Dialog.TabMatch"))}</span>
          </a>
          <a class="srt-trigger-dialog__tab" data-action="tab" data-group="sheet" data-tab="filters" data-srt-dialog-tab="filters" role="tab" aria-selected="false">
            <i class="fa-solid fa-filter srt-trigger-dialog__tab-icon" aria-hidden="true" inert></i>
            <span class="srt-trigger-dialog__tab-label">${escapeHtml(localize("Dialog.TabFilters"))}</span>
          </a>
          <a class="srt-trigger-dialog__tab" data-action="tab" data-group="sheet" data-tab="actions" data-srt-dialog-tab="actions" role="tab" aria-selected="false">
            <i class="fa-solid fa-bolt srt-trigger-dialog__tab-icon" aria-hidden="true" inert></i>
            <span class="srt-trigger-dialog__tab-label">${escapeHtml(localize("Dialog.TabActions"))}</span>
          </a>
        </nav>
        <section class="tab active srt-trigger-dialog__panel srt-trigger-dialog__panel--general" data-tab="general" data-group="sheet" data-srt-dialog-panel="general">
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerName", "DialogHint.TriggerName")}
            <input type="text" name="triggerName" value="${escapeHtml(duplicate ? format("Dialog.DuplicateName", { name: current.name }) : current.name)}" autofocus>
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerDescription", "DialogHint.TriggerDescription")}
            <input type="text" name="triggerDescription" value="${escapeHtml(current.description)}">
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerCategory", "DialogHint.TriggerCategory")}
            <input type="text" name="triggerCategory" value="${escapeHtml(current.category)}">
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerPriority", "DialogHint.TriggerPriority")}
            <input type="number" name="triggerPriority" value="${Number(current.priority)}">
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerExecutionMode", "DialogHint.TriggerExecutionMode")}
            <select name="triggerExecutionMode">${buildSelectOptions(getExecutionModeChoices(), current.executionMode)}</select>
          </div>
        </section>
        <section class="tab srt-trigger-dialog__panel srt-trigger-dialog__panel--match" data-tab="match" data-group="sheet" data-srt-dialog-panel="match" hidden>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerMatchType", "DialogHint.TriggerMatchType")}
            <select name="triggerMatchType">${buildSelectOptions(localizeChoiceMap(MATCH_TYPE_CHOICES), current.match.type)}</select>
          </div>
          ${renderMatchFieldGroups(current.match)}
          ${renderExtraMatchSection(current.extraMatches)}
        </section>
        <section class="tab srt-trigger-dialog__panel srt-trigger-dialog__panel--filters" data-tab="filters" data-group="sheet" data-srt-dialog-panel="filters" hidden>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerRollTypes", "DialogHint.TriggerRollTypes")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerRollTypes">${escapeHtml(localize("RollType.Any"))}</div>
            <select name="triggerRollTypes" multiple size="5">${buildSelectOptions(getSelectChoices(localizeChoiceMap(ROLL_TYPE_CHOICES), current.filters.rollType ?? []), getSelectedFilterValues(current.filters.rollType, ["any"]))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerActorTypes", "DialogHint.TriggerActorTypes")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerActorTypes">${escapeHtml(localize("ActorType.Any"))}</div>
            <select name="triggerActorTypes" multiple size="4">${buildSelectOptions(getSelectChoices(localizeChoiceMap(ACTOR_TYPE_CHOICES), current.filters.actorType ?? []), getSelectedFilterValues(current.filters.actorType, ["any"]))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerVisibilityFilter", "DialogHint.TriggerVisibilityFilter")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerVisibilityFilter">${escapeHtml(localize("Visibility.Any"))}</div>
            <select name="triggerVisibilityFilter" multiple size="5">${buildSelectOptions(getSelectChoices(localizeChoiceMap(FILTER_VISIBILITY_CHOICES), current.filters.visibility ?? []), getSelectedFilterValues(current.filters.visibility, ["any"]))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerCombatState", "DialogHint.TriggerCombatState")}
            <select name="triggerCombatState">${buildSelectOptions(localizeChoiceMap(COMBAT_STATE_CHOICES), current.filters.combatState ?? "any")}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="scene">
            ${renderDialogLabel("Dialog.TriggerIncludeScenes", "DialogHint.TriggerIncludeScenes")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerIncludeScenes" data-srt-empty-label="-">-</div>
            <select name="triggerIncludeScenes" multiple size="4">${buildSelectOptions(getReferenceSelectChoices("scene", current.filters.includeScenes ?? []), current.filters.includeScenes ?? [])}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="actor">
            ${renderDialogLabel("Dialog.TriggerIncludeActors", "DialogHint.TriggerIncludeActors")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerIncludeActors" data-srt-empty-label="-">-</div>
            <select name="triggerIncludeActors" multiple size="4">${buildSelectOptions(getReferenceSelectChoices("actor", current.filters.includeActors ?? []), current.filters.includeActors ?? [])}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="item">
            ${renderDialogLabel("Dialog.TriggerIncludeItems", "DialogHint.TriggerIncludeItems")}
            <div class="srt-multiselect-summary" data-srt-multiselect-summary="triggerIncludeItems" data-srt-empty-label="-">-</div>
            <select name="triggerIncludeItems" multiple size="4">${buildSelectOptions(getReferenceSelectChoices("item", current.filters.includeItems ?? []), current.filters.includeItems ?? [])}</select>
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerPlayerOnly", "DialogHint.TriggerPlayerOnly")}
            <div class="form-fields">
              <input type="checkbox" name="triggerPlayerOnly" ${current.filters.playerOnly ? "checked" : ""}>
            </div>
          </div>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerGmOnly", "DialogHint.TriggerGmOnly")}
            <div class="form-fields">
              <input type="checkbox" name="triggerGmOnly" ${current.filters.gmOnly ? "checked" : ""}>
            </div>
          </div>
        </section>
        <section class="tab srt-trigger-dialog__panel srt-trigger-dialog__panel--actions" data-tab="actions" data-group="sheet" data-srt-dialog-panel="actions" hidden>
          ${editableActions.map((action, index) => `
            <fieldset data-srt-action-config>
              ${renderDialogLegend("Dialog.TriggerActionType", "DialogHint.TriggerActionType", String(index + 1))}
              <div class="form-group">
                ${renderDialogLabel("Dialog.TriggerActionType", "DialogHint.TriggerActionType")}
                <select name="triggerActionType${index}" data-srt-action-type>${buildSelectOptions(localizeChoiceMap(ACTION_TYPE_CHOICES), action.type ?? "none")}</select>
              </div>
              <div class="form-group" data-srt-action-field="visibility">
                ${renderDialogLabel("Dialog.TriggerActionVisibility", "DialogHint.TriggerActionVisibility")}
                <select name="triggerActionVisibility${index}">${buildSelectOptions(localizeChoiceMap(ACTION_VISIBILITY_CHOICES), action.visibility ?? (action.type === "roll-table" ? "gm" : "public"))}</select>
              </div>
              <div class="form-group" data-srt-action-field="template">
                ${renderDialogLabel("Dialog.TriggerChatTemplate", "DialogHint.TriggerChatTemplate")}
                <input type="text" name="triggerChatTemplate${index}" value="${escapeHtml(action.template ?? "")}">
              </div>
              <div class="form-group" data-srt-action-field="tables">
                ${renderDialogLabel("Dialog.TriggerTables", "DialogHint.TriggerTables")}
                <select name="triggerTables${index}">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("table", action.tables ?? []) }, getSelectedReferenceValue(action.tables))}</select>
              </div>
              <div class="form-group" data-srt-action-field="macro">
                ${renderDialogLabel("Dialog.TriggerMacro", "DialogHint.TriggerMacro")}
                <select name="triggerMacro${index}">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("macro", action.macro ?? "") }, getSelectedReferenceValue(action.macro))}</select>
              </div>
              <div class="form-group" data-srt-action-field="journal">
                ${renderDialogLabel("Dialog.TriggerJournal", "DialogHint.TriggerJournal")}
                <select name="triggerJournal${index}">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("journal", action.journal ?? "") }, getSelectedReferenceValue(action.journal))}</select>
              </div>
              ${renderExtendedActionFields(action, index)}
            </fieldset>
          `).join("")}
        </section>
      </form>
    `,
    label: localize("Dialog.TriggerSubmit"),
    // Closing the editor is a cancel, not an error.
    rejectClose: false,
    render: (dialogHtml) => {
      applyDialogTheme(dialogHtml);
      configureTriggerDialog(dialogHtml);
      guardTriggerDialogSubmit(dialogHtml);
    },
    callback: (dialogHtml) => readTriggerDialog(dialogHtml)
  });

  const name = String(result?.name ?? "").trim();
  if (!name) return null;

  const actions = normalizeActionList(result.actions);

  return normalizeTrigger({
    ...current,
    id: duplicate ? foundry.utils.randomID() : current.id,
    name,
    description: result.description,
    category: result.category,
    priority: result.priority,
    executionMode: result.executionMode,
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
    filters: {
      rollType: normalizeCommaList(result.rollTypes).filter((value) => value !== "any"),
      actorType: normalizeCommaList(result.actorTypes).filter((value) => value !== "any"),
      visibility: normalizeCommaList(result.visibilityFilter).filter((value) => value !== "any"),
      combatState: result.combatState,
      includeScenes: normalizeCommaList(result.includeScenes),
      includeActors: normalizeCommaList(result.includeActors),
      includeItems: normalizeCommaList(result.includeItems),
      playerOnly: Boolean(result.playerOnly),
      gmOnly: Boolean(result.gmOnly),
      users: current.filters.users
    },
    actions,
    source: "user"
  });
}

// Reads the editor form. Invalid sound, effect, resource, image or formula actions throw: the V1 dialog then shows
// the message as an error notification and stays open, so nothing typed is lost.
function readTriggerDialog(dialogHtml) {
  const rawActions = Array.from({ length: MAX_ACTION_SLOTS }, (_value, index) => ({
    type: dialogHtml.find(`select[name="triggerActionType${index}"]`).val()?.trim() ?? "none",
    visibility: dialogHtml.find(`select[name="triggerActionVisibility${index}"]`).val()?.trim() ?? "public",
    template: dialogHtml.find(`input[name="triggerChatTemplate${index}"]`).val() ?? "",
    tables: dialogHtml.find(`select[name="triggerTables${index}"]`).val() ?? "",
    macro: dialogHtml.find(`select[name="triggerMacro${index}"]`).val() ?? "",
    journal: dialogHtml.find(`select[name="triggerJournal${index}"]`).val() ?? "",
    ...readExtendedActionFields(dialogHtml, index)
  }));

  const errors = validateEditorActions(rawActions);
  if (errors.length) throw new Error(errors.join(" "));

  return {
    name: dialogHtml.find('input[name="triggerName"]').val()?.trim() ?? "",
    description: dialogHtml.find('input[name="triggerDescription"]').val()?.trim() ?? "",
    category: dialogHtml.find('input[name="triggerCategory"]').val()?.trim() ?? "house-rule",
    priority: Number(dialogHtml.find('input[name="triggerPriority"]').val() ?? 100),
    executionMode: dialogHtml.find('select[name="triggerExecutionMode"]').val()?.trim() ?? "confirm-gm",
    matchType: dialogHtml.find('select[name="triggerMatchType"]').val()?.trim() ?? "die-max",
    faces: dialogHtml.find('input[name="triggerFaces"]').val()?.trim() ?? "",
    value: dialogHtml.find('input[name="triggerValue"]').val()?.trim() ?? "",
    threshold: dialogHtml.find('input[name="triggerThreshold"]').val()?.trim() ?? "",
    minCount: dialogHtml.find('input[name="triggerMinCount"]').val()?.trim() ?? "1",
    degree: dialogHtml.find('input[name="triggerDegree"]').val()?.trim() ?? "",
    path: dialogHtml.find('input[name="triggerPath"]').val()?.trim() ?? "",
    expression: dialogHtml.find('textarea[name="triggerExpression"]').val()?.trim() ?? "",
    extraMatches: readExtraMatchesFromDialog(dialogHtml),
    rollTypes: getDialogSelectValues(dialogHtml, 'select[name="triggerRollTypes"]', ["any"]),
    actorTypes: getDialogSelectValues(dialogHtml, 'select[name="triggerActorTypes"]', ["any"]),
    visibilityFilter: getDialogSelectValues(dialogHtml, 'select[name="triggerVisibilityFilter"]', ["any"]),
    combatState: dialogHtml.find('select[name="triggerCombatState"]').val()?.trim() ?? "any",
    includeScenes: getDialogSelectValues(dialogHtml, 'select[name="triggerIncludeScenes"]'),
    includeActors: getDialogSelectValues(dialogHtml, 'select[name="triggerIncludeActors"]'),
    includeItems: getDialogSelectValues(dialogHtml, 'select[name="triggerIncludeItems"]'),
    playerOnly: Boolean(dialogHtml.find('input[name="triggerPlayerOnly"]').prop("checked")),
    gmOnly: Boolean(dialogHtml.find('input[name="triggerGmOnly"]').prop("checked")),
    actions: rawActions
  };
}

// The V1 dialog only stays open when its callback throws, and then logs the error as uncaught. The editor checks the
// form first, before the dialog's own button and Enter handlers run: invalid input shows the message and the dialog
// stays open. readTriggerDialog still throws as a fallback.
function guardTriggerDialogSubmit(dialogHtml, notify = (message) => globalThis.ui?.notifications?.error?.(message)) {
  const root = resolveDialogRoot(dialogHtml);
  const app = root?.closest?.(".app, .window-app, .dialog") ?? root;
  if (!app?.addEventListener) return false;

  const blockInvalid = (event) => {
    try {
      readTriggerDialog(dialogHtml);
      return;
    } catch (error) {
      notify(error?.message ?? String(error));
    }
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  app.addEventListener("click", (event) => {
    if (event.target?.closest?.(".dialog-button")) blockInvalid(event);
  }, true);
  app.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target?.tagName === "TEXTAREA") return;
    blockInvalid(event);
  });
  return true;
}

// Only GMs manage triggers (world settings). Players get nothing, also through the module API.
export async function openTriggerManager() {
  if (!game.user?.isGM) return null;
  await ensureModuleTranslationsLoaded();
  if (!managerApp) managerApp = new SRTTriggerManager();
  managerApp.options ??= {};
  managerApp.options.title = localize("Manager.Title");
  await Promise.resolve(managerApp.render(true));

  const viewportWidth = globalThis.window?.innerWidth ?? 1600;
  const viewportHeight = globalThis.window?.innerHeight ?? 900;
  const width = Math.min(1080, Math.max(viewportWidth - 80, 720));
  const height = Math.min(760, Math.max(viewportHeight - 80, 520));
  if (managerApp?.element?.[0] || managerApp?.rendered) {
    managerApp.setPosition({
      width,
      height,
      left: Math.max(Math.round((viewportWidth - width) / 2), 20),
      top: Math.max(Math.round((viewportHeight - height) / 2), 20)
    });
  }

  return managerApp;
}

// The bench names conditions with the same wording as the trigger cards.
export function openTriggerTestBench() {
  return openTestBench({ describeCondition: describeMatch });
}

export async function toggleTriggerManager() {
  if (managerApp) {
    const app = managerApp;
    managerApp = null;
    return Promise.resolve(app.close({ force: true }));
  }

  return await openTriggerManager();
}

export class SRTSettingsMenu extends FormApplication {
  render(force, options) {
    void openTriggerManager();
    return this;
  }

  async _updateObject() {}
}

function getManagerTemplateStrings() {
  return {
    eyebrow: localize("Manager.Eyebrow"),
    title: localize("Manager.Title"),
    summary: localize("Manager.Summary"),
    worldLabel: localize("Manager.WorldLabel"),
    triggerCount: localize("Manager.TriggerCount"),
    profileCount: localize("Manager.ProfileCount"),
    triggerPanelTitle: localize("Manager.TriggerPanelTitle"),
    triggerPanelHint: localize("Manager.TriggerPanelHint"),
    export: localize("Manager.Export"),
    import: localize("Manager.Import"),
    create: localize("Manager.Create"),
    testBench: localize("Manager.TestBench"),
    execution: localize("Manager.Execution"),
    priority: localize("Manager.Priority"),
    match: localize("Manager.Match"),
    filters: localize("Manager.Filters"),
    actionLabel: localize("Manager.ActionLabel"),
    edit: localize("Manager.Edit"),
    duplicate: localize("Manager.Duplicate"),
    toggle: localize("Manager.Toggle"),
    delete: localize("Manager.Delete"),
    emptyTitle: localize("Manager.EmptyTitle"),
    empty: localize("Manager.Empty"),
    profilePanelTitle: localize("Manager.ProfilePanelTitle"),
    profilePanelHint: localize("Manager.ProfilePanelHint"),
    exportProfiles: localize("Manager.ExportProfiles"),
    importProfiles: localize("Manager.ImportProfiles"),
    systemLabel: localize("Manager.SystemLabel"),
    importProfile: localize("Manager.ImportProfile"),
    emptyProfilesTitle: localize("Manager.EmptyProfilesTitle"),
    emptyProfiles: localize("Manager.EmptyProfiles")
  };
}

export class SRTTriggerManager extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-manager`,
      title: localize("Manager.Title"),
      template: `modules/${MODULE_ID}/templates/trigger-manager.html`,
      classes: ["standard-form"],
      width: 1080,
      height: 760,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: false
    });
  }

  async close(options = {}) {
    if (managerApp === this) managerApp = null;
    return super.close(options);
  }

  getData() {
    const runtime = getRuntimeOptions();
    const triggers = getAllTriggers()
      .map((trigger) => presentTrigger(trigger))
      .sort((left, right) => Number(right.priority) - Number(left.priority) || left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }));
    const profiles = getVisibleProfiles(getProfileStore(), runtime.showInternalPresets)
      .map((profile) => presentProfile(profile))
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }));

    return {
      strings: getManagerTemplateStrings(),
      hasTriggers: triggers.length > 0,
      hasProfiles: profiles.length > 0,
      triggers,
      profiles,
      triggerCount: triggers.length,
      profileCount: profiles.length,
      enableImportExport: runtime.enableImportExport,
      uiTheme: runtime.uiTheme,
      worldTitle: game.world?.title ?? game.world?.id ?? "-"
    };
  }

  async _render(force, options) {
    await super._render(force, options);
    applyManagerTheme(this.element?.[0]);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    applyManagerTheme(this.element?.[0], root.dataset.uiTheme ?? getThemePreference());

    root.querySelector('[data-action="create-trigger"]')?.addEventListener("click", () => {
      void this.#onCreate();
    });

    root.querySelector('[data-action="open-test-bench"]')?.addEventListener("click", () => {
      void openTriggerTestBench();
    });

    root.querySelector('[data-action="export-triggers"]')?.addEventListener("click", () => {
      exportTriggers();
    });

    root.querySelector('[data-action="import-triggers"]')?.addEventListener("click", () => {
      root.querySelector('[data-action="import-file"]')?.click();
    });

    root.querySelector('[data-action="import-file"]')?.addEventListener("change", (event) => {
      void this.#onImport(event);
    });

    root.querySelector('[data-action="export-profiles"]')?.addEventListener("click", () => {
      exportProfiles();
    });

    root.querySelector('[data-action="import-profiles"]')?.addEventListener("click", () => {
      root.querySelector('[data-action="import-profiles-file"]')?.click();
    });

    root.querySelector('[data-action="import-profiles-file"]')?.addEventListener("change", (event) => {
      void this.#onImportProfiles(event);
    });

    for (const button of root.querySelectorAll('[data-action="edit-trigger"]')) {
      button.addEventListener("click", () => {
        void this.#onEdit(button.dataset.triggerId);
      });
    }

    for (const button of root.querySelectorAll('[data-action="duplicate-trigger"]')) {
      button.addEventListener("click", () => {
        void this.#onDuplicate(button.dataset.triggerId);
      });
    }

    for (const button of root.querySelectorAll('[data-action="delete-trigger"]')) {
      button.addEventListener("click", () => {
        void this.#onDelete(button.dataset.triggerId);
      });
    }

    for (const button of root.querySelectorAll('[data-action="toggle-trigger"]')) {
      button.addEventListener("click", () => {
        void this.#onToggle(button.dataset.triggerId);
      });
    }

    for (const button of root.querySelectorAll('[data-action="import-profile"]')) {
      button.addEventListener("click", () => {
        void this.#onImportProfile(button.dataset.profileId);
      });
    }
  }

  async #onCreate() {
    const trigger = await promptTriggerData();
    if (!trigger) return;
    const saved = await upsertTrigger(trigger);
    ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
    this.render(true);
  }

  async #onEdit(triggerId) {
    const existing = findTriggerById(triggerId);
    if (!existing) return;
    const updated = await promptTriggerData(existing, false);
    if (!updated) return;
    const saved = await upsertTrigger({ ...updated, id: existing.id });
    ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
    this.render(true);
  }

  async #onDuplicate(triggerId) {
    const existing = findTriggerById(triggerId);
    if (!existing) return;
    const duplicated = await promptTriggerData(existing, true);
    if (!duplicated) return;
    const saved = await upsertTrigger(duplicated);
    ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
    this.render(true);
  }

  async #onDelete(triggerId) {
    const existing = findTriggerById(triggerId);
    if (!existing) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: localize("Dialog.DeleteTitle") },
      content: `<p>${escapeHtml(format("Dialog.DeleteContent", { name: existing.name }))}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    await removeTrigger(triggerId);
    ui.notifications?.info(format("Notification.TriggerDeleted", { name: existing.name }));
    this.render(true);
  }

  async #onToggle(triggerId) {
    const existing = findTriggerById(triggerId);
    if (!existing) return;
    const saved = await upsertTrigger({ ...existing, enabled: !existing.enabled });
    ui.notifications?.info(format("Notification.TriggerToggled", { name: saved.name }));
    this.render(true);
  }

  async #onImportProfile(profileId) {
    const profile = getProfileStore().find((entry) => entry?.id === profileId);
    if (!profile) return;

    const currentById = new Map(getAllTriggers().map((trigger) => [trigger.id, trigger]));
    for (const profileTrigger of profile.triggers ?? []) {
      const imported = cloneProfileTrigger(profile, profileTrigger);
      currentById.set(imported.id, imported);
    }

    await saveTriggerStore([...currentById.values()]);
    ui.notifications?.info(format("Notification.ProfileImported", { name: profile.name }));
    this.render(true);
  }

  async #onImport(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      await importTriggersFromFile(file);
      this.render(true);
    } catch (error) {
      ui.notifications?.error(error?.message ?? localize("Import.Invalid"));
    } finally {
      input.value = "";
    }
  }

  async #onImportProfiles(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      await importProfilesFromFile(file);
      this.render(true);
    } catch (error) {
      ui.notifications?.error(error?.message ?? localize("Import.InvalidProfiles"));
    } finally {
      input.value = "";
    }
  }

  async _updateObject() {}
}

export const __test__ = {
  EXPORT_FORMAT_VERSION,
  PROFILE_EXPORT_FORMAT_VERSION,
  MAX_ACTION_SLOTS,
  TRIGGER_DIALOG_MIN_WIDTH,
  TRIGGER_DIALOG_MIN_HEIGHT,
  MATCH_TYPE_CHOICES,
  ROLL_TYPE_CHOICES,
  ACTION_TYPE_CHOICES,
  ACTION_VISIBILITY_CHOICES,
  FILTER_VISIBILITY_CHOICES,
  ACTOR_TYPE_CHOICES,
  COMBAT_STATE_CHOICES,
  ACTION_FIELD_VISIBILITY,
  EFFECT_TARGET_CHOICES,
  RESOURCE_OPERATION_CHOICES,
  validateEditorAction,
  validateEditorActions,
  getStatusEffectChoices,
  renderExtendedActionFields,
  readExtendedActionFields,
  readTriggerDialog,
  guardTriggerDialogSubmit,
  configureFilePickerButtons,
  openFilePickerFor,
  getActionSummary,
  MATCH_FIELD_VISIBILITY,
  MATCH_INPUT_FIELDS,
  DEFAULT_EXTRA_MATCH,
  ITEM_ROLL_TYPES,
  normalizeCommaList,
  getCollectionEntries,
  getReferenceCollection,
  getDialogTooltip,
  renderDialogLabel,
  getSelectedFilterValue,
  getSelectedFilterValues,
  getSelectChoices,
  getMultiSelectSummaryLabel,
  updateMultiSelectSummary,
  updateAllMultiSelectSummaries,
  normalizeAction,
  normalizeActionList,
  normalizeMatch,
  normalizeExtraMatches,
  normalizeExactDiceCountByFaces,
  buildEditableActions,
  normalizeTrigger,
  normalizeProfile,
  buildDatalistOptions,
  getReferenceChoices,
  getReferenceSelectChoices,
  getSelectedReferenceValue,
  resolveReferenceEntry,
  formatReferenceValue,
  formatReferenceList,
  parseReferenceToken,
  parseReferenceList,
  getDialogSelectValues,
  buildSelectOptions,
  getMatchFieldState,
  getFilterDetailState,
  getActionFieldState,
  resolveDialogRoot,
  applyMatchFieldState,
  applyExtraMatchFieldState,
  renderMatchFieldGroups,
  renderExtraMatchCondition,
  renderExtraMatchSection,
  configureExtraMatchConditions,
  readExtraMatchCondition,
  readExtraMatchesFromDialog,
  applyFilterDetailState,
  ensureTriggerDialogResizeHandle,
  calculateTriggerDialogResize,
  applyActionFieldState,
  getTriggerDialogWrapper,
  ensureTriggerDialogSize,
  resizeTriggerDialogToContent,
  setTriggerDialogTab,
  configureTriggerDialog,
  describeMatch,
  describeTriggerMatches,
  describeFilters,
  buildTriggerExportPayload,
  buildProfileExportPayload,
  parseImportedTriggerPayload,
  parseImportedProfilePayload,
  mergeImportedTriggers,
  mergeImportedProfiles,
  cloneProfileTrigger,
  getAllTriggers,
  findTriggerById,
  presentTrigger,
  presentProfile,
  getVisibleProfiles,
  getManagerTemplateStrings,
  promptTriggerData,
  getDefaultExecutionMode,
  applyManagerTheme,
  resetManagerApp() {
    managerApp = null;
  }
};