import {
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

let managerApp = null;
const EXPORT_FORMAT_VERSION = 1;
const PROFILE_EXPORT_FORMAT_VERSION = 1;
const MAX_ACTION_SLOTS = 3;
const TRIGGER_DIALOG_MIN_WIDTH = 420;
const TRIGGER_DIALOG_MIN_HEIGHT = 300;

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

const ROLL_TYPE_CHOICES = {
  any: "RollType.Any",
  attack: "RollType.Attack",
  check: "RollType.Check",
  save: "RollType.Save",
  damage: "RollType.Damage",
  healing: "RollType.Healing",
  skill: "RollType.Skill",
  initiative: "RollType.Initiative",
  utility: "RollType.Utility",
  other: "RollType.Other"
};

const ACTION_TYPE_CHOICES = {
  none: "Action.None",
  "chat-message": "Action.ChatMessage",
  "roll-table": "Action.RollTable",
  macro: "Action.Macro",
  "journal-link": "Action.JournalLink",
  "gm-note": "Action.GmNote"
};

const ACTION_VISIBILITY_CHOICES = {
  public: "Visibility.Public",
  gm: "Visibility.Gm",
  player: "Visibility.Player"
};

const FILTER_VISIBILITY_CHOICES = {
  any: "Visibility.Any",
  public: "Visibility.Public",
  "gm-private": "Visibility.Gm",
  blind: "Visibility.Blind",
  self: "Visibility.Self"
};

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
  "gm-note": { visibility: false, template: true, tables: false, macro: false, journal: false }
};

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
  return String(value ?? "")
    .split(",")
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

function getSelectChoices(choices, selectedValues = []) {
  const resolved = { ...choices };

  for (const value of normalizeCommaList(selectedValues)) {
    if (!value || resolved[value]) continue;
    resolved[value] = value;
  }

  return resolved;
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

function getFilterDetailState({ actorType = "any", rollType = "any" } = {}) {
  return {
    scene: true,
    actor: actorType !== "any",
    item: ITEM_ROLL_TYPES.has(rollType)
  };
}

function applyFilterDetailState(root) {
  const rollType = root.querySelector?.('select[name="triggerRollTypes"]')?.value ?? "any";
  const actorType = root.querySelector?.('select[name="triggerActorTypes"]')?.value ?? "any";
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

function resizeTriggerDialogToContent(root) {
  const wrapper = getTriggerDialogWrapper(root);
  const content = wrapper?.querySelector?.(".window-content") ?? null;
  if (!wrapper || !content) return;

  if (wrapper.dataset?.srtAutoHeight) delete wrapper.dataset.srtAutoHeight;
  content.style.height = "auto";
}

function setTriggerDialogTab(root, tabId) {
  const activeTab = TRIGGER_DIALOG_TABS.includes(tabId) ? tabId : TRIGGER_DIALOG_TABS[0];

  for (const button of root.querySelectorAll("[data-srt-dialog-tab]")) {
    const isActive = button.dataset.srtDialogTab === activeTab;
    button.classList?.toggle?.("active", isActive);
    if (typeof button.setAttribute === "function") button.setAttribute("aria-selected", isActive ? "true" : "false");
    if ("tabIndex" in button) button.tabIndex = isActive ? 0 : -1;
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

  for (const filterSelect of root.querySelectorAll('select[name="triggerRollTypes"], select[name="triggerActorTypes"]')) {
    filterSelect.addEventListener("change", () => applyFilterDetailState(root));
  }
  applyFilterDetailState(root);

  for (const actionContainer of root.querySelectorAll("[data-srt-action-config]")) {
    const select = actionContainer.querySelector("[data-srt-action-type]");
    if (!select) continue;

    const updateState = () => {
      applyActionFieldState(actionContainer, select.value);
    };
    select.addEventListener("change", updateState);
    updateState();
  }

  resizeTriggerDialogToContent(root);
  ensureTriggerDialogResizeHandle(root);
}

function applyManagerTheme(element, theme = getThemePreference()) {
  if (!element) return;

  const resolvedTheme = theme === "foundry" ? "foundry" : "signature";
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

  return actions.map((action) => {
    const typeLabel = action.type === "chat-message"
      ? localize("Action.ChatMessage")
      : action.type === "roll-table"
        ? localize("Action.RollTable")
        : action.type === "macro"
          ? localize("Action.Macro")
          : action.type === "journal-link"
            ? localize("Action.JournalLink")
            : action.type === "gm-note"
              ? localize("Action.GmNote")
              : action.type;
    const visibilityLabel = localize(ACTION_VISIBILITY_CHOICES[action.visibility] ?? "Visibility.Public");
    if (["macro", "gm-note"].includes(action.type)) return typeLabel;
    return `${typeLabel} (${visibilityLabel})`;
  }).join(" + ");
}

function describeMatch(match) {
  if (!match) return "-";
  const base = localize(MATCH_TYPE_CHOICES[match.type] ?? "Match.DieValue");
  const state = getMatchFieldState(match.type);
  const parts = [base];
  if (state.faces && Number.isFinite(Number(match.faces))) parts.push(`d${Number(match.faces)}`);
  if (state.value && Number.isFinite(Number(match.value))) parts.push(String(Number(match.value)));
  if (state.threshold && Number.isFinite(Number(match.threshold))) parts.push(String(Number(match.threshold)));
  if (state.minCount && Number.isFinite(Number(match.minCount)) && Number(match.minCount) > 1) parts.push(`x${Number(match.minCount)}`);
  if (state.degree && match.degree != null && String(match.degree).trim()) parts.push(String(match.degree).trim());
  if (state.path && match.path != null && String(match.path).trim()) parts.push(String(match.path).trim());
  if (state.expression && match.expression != null && String(match.expression).trim()) parts.push(String(match.expression).trim());
  return parts.join(" | ");
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
    const template = String(action.template ?? action.message ?? "").trim();
    if (!template) return null;

    return {
      type: "chat-message",
      template,
      visibility: String(action.visibility ?? "public")
    };
  }

  if (action.type === "roll-table") {
    const tables = normalizeCommaList(Array.isArray(action.tables) ? action.tables.join(",") : action.tables ?? action.table ?? "");
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
    const template = String(action.template ?? action.message ?? "").trim();
    if (!template) return null;

    return {
      type: "gm-note",
      template
    };
  }

  return null;
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

function buildEditableActions(actions) {
  const editable = normalizeActionList(actions);
  while (editable.length < MAX_ACTION_SLOTS) editable.push({ type: "none", template: "", tables: [], macro: "", journal: "", visibility: "public" });
  return editable.slice(0, MAX_ACTION_SLOTS).map((action) => ({
    type: action.type ?? "none",
    template: String(action.template ?? ""),
    tables: Array.isArray(action.tables) ? action.tables : normalizeCommaList(action.tables ?? ""),
    macro: String(action.macro ?? ""),
    journal: String(action.journal ?? ""),
    visibility: String(action.visibility ?? (action.type === "roll-table" ? "gm" : "public"))
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
    filters: {
      rollType: normalizeCommaList(trigger?.filters?.rollType ?? fallback.rollType ?? ""),
      actorType: normalizeCommaList(trigger?.filters?.actorType ?? fallback.actorType ?? ""),
      visibility: normalizeCommaList(trigger?.filters?.visibility ?? fallback.visibility ?? "").filter((value) => value !== "any"),
      combatState: String(trigger?.filters?.combatState ?? fallback.combatState ?? "any"),
      includeScenes: normalizeCommaList(trigger?.filters?.includeScenes ?? fallback.includeScenes ?? ""),
      includeActors: normalizeCommaList(trigger?.filters?.includeActors ?? fallback.includeActors ?? ""),
      includeItems: normalizeCommaList(trigger?.filters?.includeItems ?? fallback.includeItems ?? ""),
      playerOnly: Boolean(trigger?.filters?.playerOnly ?? fallback.playerOnly),
      gmOnly: Boolean(trigger?.filters?.gmOnly ?? fallback.gmOnly)
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
    matchLabel: describeMatch(trigger.match),
    filtersLabel: describeFilters(trigger.filters),
    actionLabel: getActionSummary(trigger)
  };
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
  return Object.entries(choices).map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

async function promptTriggerData(trigger = null, duplicate = false) {
  const current = normalizeTrigger(trigger ?? {}, {
    name: "",
    category: "house-rule",
    executionMode: "confirm-gm",
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
    width: 1280,
    height: 1188,
    resizable: true,
    content: `
      <form class="standard-form">
        <nav class="sheet-tabs tabs top-tabs" role="tablist" aria-label="${escapeHtml(localize("Dialog.TabsLabel"))}" aria-roledescription="${escapeHtml(localize("Dialog.TabsRoleDescription"))}" data-application-part="tabs">
          <a class="active" data-action="tab" data-group="sheet" data-tab="general" data-srt-dialog-tab="general" role="tab" aria-selected="true">
            <i class="fa-solid fa-file-lines" aria-hidden="true" inert></i>
            <span>${escapeHtml(localize("Dialog.TabGeneral"))}</span>
          </a>
          <a data-action="tab" data-group="sheet" data-tab="match" data-srt-dialog-tab="match" role="tab" aria-selected="false">
            <i class="fa-solid fa-dice-d20" aria-hidden="true" inert></i>
            <span>${escapeHtml(localize("Dialog.TabMatch"))}</span>
          </a>
          <a data-action="tab" data-group="sheet" data-tab="filters" data-srt-dialog-tab="filters" role="tab" aria-selected="false">
            <i class="fa-solid fa-filter" aria-hidden="true" inert></i>
            <span>${escapeHtml(localize("Dialog.TabFilters"))}</span>
          </a>
          <a data-action="tab" data-group="sheet" data-tab="actions" data-srt-dialog-tab="actions" role="tab" aria-selected="false">
            <i class="fa-solid fa-bolt" aria-hidden="true" inert></i>
            <span>${escapeHtml(localize("Dialog.TabActions"))}</span>
          </a>
        </nav>
        <section class="tab active" data-tab="general" data-group="sheet" data-srt-dialog-panel="general">
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
        <section class="tab" data-tab="match" data-group="sheet" data-srt-dialog-panel="match" hidden>
          <div class="form-group">
            ${renderDialogLabel("Dialog.TriggerMatchType", "DialogHint.TriggerMatchType")}
            <select name="triggerMatchType">${buildSelectOptions(localizeChoiceMap(MATCH_TYPE_CHOICES), current.match.type)}</select>
          </div>
          <div class="form-group" data-srt-match-field="faces">
            ${renderDialogLabel("Dialog.TriggerFaces", "DialogHint.TriggerFaces")}
            <input type="number" name="triggerFaces" value="${current.match.faces ?? ""}">
          </div>
          <div class="form-group" data-srt-match-field="value">
            ${renderDialogLabel("Dialog.TriggerValue", "DialogHint.TriggerValue")}
            <input type="number" name="triggerValue" value="${current.match.value ?? ""}">
          </div>
          <div class="form-group" data-srt-match-field="threshold">
            ${renderDialogLabel("Dialog.TriggerThreshold", "DialogHint.TriggerThreshold")}
            <input type="number" name="triggerThreshold" value="${current.match.threshold ?? ""}">
          </div>
          <div class="form-group" data-srt-match-field="minCount">
            ${renderDialogLabel("Dialog.TriggerMinCount", "DialogHint.TriggerMinCount")}
            <input type="number" name="triggerMinCount" value="${current.match.minCount ?? 1}">
          </div>
          <div class="form-group" data-srt-match-field="degree">
            ${renderDialogLabel("Dialog.TriggerDegree", "DialogHint.TriggerDegree")}
            <input type="text" name="triggerDegree" value="${escapeHtml(current.match.degree ?? "")}">
          </div>
          <div class="form-group" data-srt-match-field="path">
            ${renderDialogLabel("Dialog.TriggerPath", "DialogHint.TriggerPath")}
            <input type="text" name="triggerPath" value="${escapeHtml(current.match.path ?? "")}">
          </div>
          <div class="form-group" data-srt-match-field="expression">
            ${renderDialogLabel("Dialog.TriggerExpression", "DialogHint.TriggerExpression")}
            <input type="text" name="triggerExpression" value="${escapeHtml(current.match.expression ?? "")}">
          </div>
        </section>
        <section class="tab" data-tab="filters" data-group="sheet" data-srt-dialog-panel="filters" hidden>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerRollTypes", "DialogHint.TriggerRollTypes")}
            <select name="triggerRollTypes">${buildSelectOptions(getSelectChoices(localizeChoiceMap(ROLL_TYPE_CHOICES), current.filters.rollType ?? []), getSelectedFilterValue(current.filters.rollType, "any"))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerActorTypes", "DialogHint.TriggerActorTypes")}
            <select name="triggerActorTypes">${buildSelectOptions(getSelectChoices(localizeChoiceMap(ACTOR_TYPE_CHOICES), current.filters.actorType ?? []), getSelectedFilterValue(current.filters.actorType, "any"))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerVisibilityFilter", "DialogHint.TriggerVisibilityFilter")}
            <select name="triggerVisibilityFilter">${buildSelectOptions(getSelectChoices(localizeChoiceMap(FILTER_VISIBILITY_CHOICES), current.filters.visibility ?? []), getSelectedFilterValue(current.filters.visibility, "any"))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked">
            ${renderDialogLabel("Dialog.TriggerCombatState", "DialogHint.TriggerCombatState")}
            <select name="triggerCombatState">${buildSelectOptions(localizeChoiceMap(COMBAT_STATE_CHOICES), current.filters.combatState ?? "any")}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="scene">
            ${renderDialogLabel("Dialog.TriggerIncludeScenes", "DialogHint.TriggerIncludeScenes")}
            <select name="triggerIncludeScenes">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("scene", current.filters.includeScenes ?? []) }, getSelectedReferenceValue(current.filters.includeScenes))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="actor">
            ${renderDialogLabel("Dialog.TriggerIncludeActors", "DialogHint.TriggerIncludeActors")}
            <select name="triggerIncludeActors">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("actor", current.filters.includeActors ?? []) }, getSelectedReferenceValue(current.filters.includeActors))}</select>
          </div>
          <div class="form-group srt-dialog-field--stacked" data-srt-filter-detail="item">
            ${renderDialogLabel("Dialog.TriggerIncludeItems", "DialogHint.TriggerIncludeItems")}
            <select name="triggerIncludeItems">${buildSelectOptions({ "": "None", ...getReferenceSelectChoices("item", current.filters.includeItems ?? []) }, getSelectedReferenceValue(current.filters.includeItems))}</select>
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
        <section class="tab" data-tab="actions" data-group="sheet" data-srt-dialog-panel="actions" hidden>
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
            </fieldset>
          `).join("")}
        </section>
      </form>
    `,
    label: localize("Dialog.TriggerSubmit"),
    render: (dialogHtml) => {
      configureTriggerDialog(dialogHtml);
    },
    callback: (dialogHtml) => ({
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
      expression: dialogHtml.find('input[name="triggerExpression"]').val()?.trim() ?? "",
      rollTypes: dialogHtml.find('select[name="triggerRollTypes"]').val()?.trim() ?? "any",
      actorTypes: dialogHtml.find('select[name="triggerActorTypes"]').val()?.trim() ?? "any",
      visibilityFilter: dialogHtml.find('select[name="triggerVisibilityFilter"]').val()?.trim() ?? "any",
      combatState: dialogHtml.find('select[name="triggerCombatState"]').val()?.trim() ?? "any",
      includeScenes: dialogHtml.find('select[name="triggerIncludeScenes"]').val()?.trim() ?? "",
      includeActors: dialogHtml.find('select[name="triggerIncludeActors"]').val()?.trim() ?? "",
      includeItems: dialogHtml.find('select[name="triggerIncludeItems"]').val()?.trim() ?? "",
      playerOnly: Boolean(dialogHtml.find('input[name="triggerPlayerOnly"]').prop("checked")),
      gmOnly: Boolean(dialogHtml.find('input[name="triggerGmOnly"]').prop("checked")),
      actions: Array.from({ length: MAX_ACTION_SLOTS }, (_value, index) => ({
        type: dialogHtml.find(`select[name="triggerActionType${index}"]`).val()?.trim() ?? "none",
        visibility: dialogHtml.find(`select[name="triggerActionVisibility${index}"]`).val()?.trim() ?? "public",
        template: dialogHtml.find(`input[name="triggerChatTemplate${index}"]`).val() ?? "",
        tables: dialogHtml.find(`select[name="triggerTables${index}"]`).val() ?? "",
        macro: dialogHtml.find(`select[name="triggerMacro${index}"]`).val() ?? "",
        journal: dialogHtml.find(`select[name="triggerJournal${index}"]`).val() ?? ""
      }))
    })
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
    filters: {
      rollType: result.rollTypes && result.rollTypes !== "any" ? [result.rollTypes] : [],
      actorType: result.actorTypes && result.actorTypes !== "any" ? [result.actorTypes] : [],
      visibility: result.visibilityFilter && result.visibilityFilter !== "any" ? [result.visibilityFilter] : [],
      combatState: result.combatState,
      includeScenes: result.includeScenes ? [result.includeScenes] : [],
      includeActors: result.includeActors ? [result.includeActors] : [],
      includeItems: result.includeItems ? [result.includeItems] : [],
      playerOnly: Boolean(result.playerOnly),
      gmOnly: Boolean(result.gmOnly)
    },
    actions,
    source: "user"
  });
}

export function openTriggerManager() {
  if (!managerApp) managerApp = new SRTTriggerManager();
  managerApp.render(true);

  const viewportWidth = globalThis.window?.innerWidth ?? 1600;
  const viewportHeight = globalThis.window?.innerHeight ?? 900;
  const width = Math.min(1080, Math.max(viewportWidth - 80, 720));
  const height = Math.min(760, Math.max(viewportHeight - 80, 520));
  managerApp.setPosition({
    width,
    height,
    left: Math.max(Math.round((viewportWidth - width) / 2), 20),
    top: Math.max(Math.round((viewportHeight - height) / 2), 20)
  });

  return managerApp;
}

export function toggleTriggerManager() {
  if (managerApp) {
    const app = managerApp;
    return app.close({ force: true });
  }

  return openTriggerManager();
}

export class SRTSettingsMenu extends FormApplication {
  render(force, options) {
    openTriggerManager();
    return this;
  }

  async _updateObject() {}
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
    const result = await super.close(options);
    if (managerApp === this) managerApp = null;
    return result;
  }

  getData() {
    const triggers = getAllTriggers()
      .map((trigger) => presentTrigger(trigger))
      .sort((left, right) => Number(right.priority) - Number(left.priority) || left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }));
    const profiles = getProfileStore()
      .map((profile) => presentProfile(profile))
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }));
    const runtime = getRuntimeOptions();

    return {
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
    const confirmed = await Dialog.confirm({
      title: localize("Dialog.DeleteTitle"),
      content: `<p>${escapeHtml(format("Dialog.DeleteContent", { name: existing.name }))}</p>`
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
  MATCH_FIELD_VISIBILITY,
  ITEM_ROLL_TYPES,
  normalizeCommaList,
  getCollectionEntries,
  getReferenceCollection,
  getDialogTooltip,
  renderDialogLabel,
  getSelectedFilterValue,
  getSelectChoices,
  normalizeAction,
  normalizeActionList,
  normalizeMatch,
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
  getMatchFieldState,
  getFilterDetailState,
  getActionFieldState,
  resolveDialogRoot,
  applyMatchFieldState,
  applyFilterDetailState,
  ensureTriggerDialogResizeHandle,
  calculateTriggerDialogResize,
  applyActionFieldState,
  getTriggerDialogWrapper,
  resizeTriggerDialogToContent,
  setTriggerDialogTab,
  configureTriggerDialog,
  describeMatch,
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
  applyManagerTheme
};