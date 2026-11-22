import { addSettingsGear, ensureModuleTranslationsLoaded, getThemePreference, localize, MODULE_ID } from "./settings.js";
import {
  buildEditorContext,
  buildExtraMatchDescriptor,
  buildTriggerFromEditorResult,
  EDITOR_TABS,
  getBlankTrigger,
  readTriggerForm,
  validateEditorForm
} from "./editor-model.js";
import { COMBAT_EVENT_FIELDS, COMBAT_EXECUTION_MODES } from "./combat-events.js";
import {
  DEFAULT_EXTRA_MATCH,
  getActionFieldState,
  getFilterDetailState,
  getItemSelectChoices,
  getMatchFieldState,
  getSelectedFilterValues,
  normalizeTrigger
} from "./trigger-data.js";

// The trigger editor window (ApplicationV2). It asks for a trigger and resolves with the values of the form, or null
// when it is closed. The data side lives in editor-model.js, the templates in templates/editor/.

export const EDITOR_TEMPLATE_DIR = `modules/${MODULE_ID}/templates/editor`;
export const EDITOR_PARTIALS = ["match-field", "extra-match", "action-slot", "multi-select"].map((name) => `${EDITOR_TEMPLATE_DIR}/${name}.html`);

const TAB_ICONS = { general: "fa-solid fa-file-lines", match: "fa-solid fa-dice-d20", filters: "fa-solid fa-filter", actions: "fa-solid fa-bolt" };
const TAB_LABEL_KEYS = { general: "Dialog.TabGeneral", match: "Dialog.TabMatch", filters: "Dialog.TabFilters", actions: "Dialog.TabActions" };

// ---- Field state (what the form shows for the current choices) --------------------------------------------------

export function applyMatchFieldState(root, matchType) {
  const state = getMatchFieldState(matchType);
  for (const section of root.querySelectorAll("[data-srt-match-field]")) {
    section.hidden = !state[section.dataset.srtMatchField];
  }
}

export function applyExtraMatchFieldState(condition, matchType) {
  const state = getMatchFieldState(matchType);
  for (const section of condition.querySelectorAll("[data-srt-extra-match-field]")) {
    section.hidden = !state[section.dataset.srtExtraMatchField];
  }
}

export function applyActionFieldState(actionContainer, actionType) {
  const state = getActionFieldState(actionType);
  for (const section of actionContainer.querySelectorAll("[data-srt-action-field]")) {
    section.hidden = !state[section.dataset.srtActionField];
  }
}

export function applyFilterDetailState(root) {
  const read = (name) => getSelectedFilterValues(Array.from(root.querySelector(`[name="${name}"]`)?.selectedOptions ?? []).map((option) => option.value));
  const state = getFilterDetailState({ actorType: read("triggerActorTypes"), rollType: read("triggerRollTypes") });
  for (const section of root.querySelectorAll("[data-srt-filter-detail]")) {
    section.hidden = !state[section.dataset.srtFilterDetail];
  }
}

// Roll triggers and combat triggers share one editor. Sections marked with data-srt-kind-section belong to one kind,
// data-srt-combat-field marks what only some combat events use. Hidden ones carry data-srt-kind-hidden.
export function applyKindState(root) {
  const kind = root.querySelector('[name="triggerKind"]')?.value === "combat" ? "combat" : "roll";
  const event = root.querySelector('[name="triggerCombatEvent"]')?.value;
  const fields = COMBAT_EVENT_FIELDS[event] ?? COMBAT_EVENT_FIELDS["turn-start"];

  const setHidden = (element, hidden) => {
    if (hidden) element.setAttribute("data-srt-kind-hidden", "");
    else element.removeAttribute("data-srt-kind-hidden");
  };
  for (const element of root.querySelectorAll("[data-srt-kind-section]")) {
    setHidden(element, element.dataset.srtKindSection !== kind);
  }
  for (const element of root.querySelectorAll("[data-srt-combat-field]")) {
    const hidden = kind === "combat" && !fields[element.dataset.srtCombatField];
    if (element.dataset.srtKindSection) {
      setHidden(element, element.dataset.srtKindSection !== kind || hidden);
    } else {
      setHidden(element, hidden);
    }
  }

  // A combat trigger has no chat message to put a button on.
  const execution = root.querySelector('[name="triggerExecutionMode"]');
  if (execution) {
    for (const option of execution.options ?? []) {
      const blocked = kind === "combat" && !COMBAT_EXECUTION_MODES.includes(option.value);
      option.hidden = blocked;
      option.disabled = blocked;
    }
    if (kind === "combat" && !COMBAT_EXECUTION_MODES.includes(execution.value)) execution.value = "confirm-gm";
  }

  const label = root.querySelector("[data-srt-tab-label=match]");
  if (label) label.textContent = localize(kind === "combat" ? "Dialog.TabEvent" : "Dialog.TabMatch");
  return kind;
}

export function getMultiSelectSummaryLabel(select) {
  if (!select) return "";
  const selected = Array.from(select.selectedOptions ?? [])
    .map((option) => String(option.textContent ?? "").trim())
    .filter(Boolean);
  if (selected.length) return selected.join(", ");
  return String(select.dataset?.srtEmptyLabel ?? "").trim();
}

export function updateMultiSelectSummary(root, selectName) {
  const summary = root.querySelector?.(`[data-srt-multiselect-summary="${selectName}"]`) ?? null;
  const select = root.querySelector?.(`select[name="${selectName}"]`) ?? null;
  if (!summary || !select) return;
  summary.textContent = getMultiSelectSummaryLabel(select);
}

export function updateAllMultiSelectSummaries(root) {
  for (const summary of root.querySelectorAll?.("[data-srt-multiselect-summary]") ?? []) {
    const selectName = summary.dataset?.srtMultiselectSummary;
    if (selectName) updateMultiSelectSummary(root, selectName);
  }
}

// The item list follows the chosen actors. Picked items stay picked.
export function rebuildItemChoices(root) {
  const actorSelect = root.querySelector('[name="triggerIncludeActors"]');
  const itemSelect = root.querySelector('[name="triggerIncludeItems"]');
  if (!actorSelect || !itemSelect) return;
  const actorIds = Array.from(actorSelect.selectedOptions ?? []).map((option) => option.value);
  const selected = Array.from(itemSelect.selectedOptions ?? []).map((option) => option.value);
  const choices = getItemSelectChoices(actorIds, selected);
  const doc = itemSelect.ownerDocument;
  itemSelect.replaceChildren(...Object.entries(choices).map(([value, label]) => {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected.includes(value);
    return option;
  }));
  updateMultiSelectSummary(root, itemSelect.name);
}

export function renumberExtraMatchConditions(list) {
  Array.from(list?.querySelectorAll?.("[data-srt-extra-match]") ?? []).forEach((condition, index) => {
    const number = condition.querySelector?.("[data-srt-extra-match-number]");
    if (number) number.textContent = String(index + 1);
  });
}

export function openFilePickerFor(input, type) {
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

// Applies every field state of the form, after each render.
export function refreshEditorState(root) {
  const matchType = root.querySelector('[name="triggerMatchType"]');
  if (matchType) applyMatchFieldState(root, matchType.value);
  for (const condition of root.querySelectorAll("[data-srt-extra-match]")) {
    applyExtraMatchFieldState(condition, condition.querySelector('[data-srt-extra-match-input="type"]')?.value);
  }
  applyFilterDetailState(root);
  updateAllMultiSelectSummaries(root);
  for (const container of root.querySelectorAll("[data-srt-action-config]")) {
    applyActionFieldState(container, container.querySelector("[data-srt-action-type]")?.value);
  }
  return applyKindState(root);
}

// ---- The window ---------------------------------------------------------------------------------------------------

let editorClass = null;

// The class is built on first use: foundry.applications.api only exists in the browser, the unit tests load this file in Node.
export function getEditorClass() {
  if (editorClass) return editorClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  editorClass = class SRTTriggerEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-trigger-editor`,
      tag: "form",
      classes: ["srt-window", "srt-editor-window", "srt-trigger-dialog"],
      window: { icon: "fa-solid fa-burst", resizable: true, contentClasses: ["standard-form"] },
      position: { width: 760, height: 640 },
      form: { handler: SRTTriggerEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
      actions: { addExtraMatch: SRTTriggerEditor.#onAddExtraMatch, removeExtraMatch: SRTTriggerEditor.#onRemoveExtraMatch, pickFile: SRTTriggerEditor.#onPickFile }
    };

    static PARTS = {
      tabs: { template: `${EDITOR_TEMPLATE_DIR}/tabs.html` },
      general: { template: `${EDITOR_TEMPLATE_DIR}/general.html` },
      match: { template: `${EDITOR_TEMPLATE_DIR}/match.html`, templates: EDITOR_PARTIALS },
      filters: { template: `${EDITOR_TEMPLATE_DIR}/filters.html`, templates: EDITOR_PARTIALS, scrollable: [""] },
      actions: { template: `${EDITOR_TEMPLATE_DIR}/actions.html`, templates: EDITOR_PARTIALS, scrollable: [""] },
      footer: { template: `${EDITOR_TEMPLATE_DIR}/footer.html` }
    };

    static TABS = {
      sheet: { tabs: EDITOR_TABS.map((id) => ({ id, icon: TAB_ICONS[id] })), initial: "general" }
    };

    constructor({ current, duplicate = false, title, resolve, id } = {}) {
      super(id ? { id } : {});
      this.current = current;
      this.duplicate = duplicate;
      this.windowTitle = title;
      this.resolveResult = resolve;
      this.submitted = null;
    }

    get title() {
      return this.windowTitle ?? localize("Dialog.TriggerCreateTitle");
    }

    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      addSettingsGear(frame);
      return frame;
    }

    _prepareTabs(group) {
      const tabs = super._prepareTabs(group);
      for (const tab of Object.values(tabs)) tab.label = localize(TAB_LABEL_KEYS[tab.id] ?? tab.id);
      return tabs;
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      return { ...context, ...buildEditorContext(this.current, { duplicate: this.duplicate }), tabLabel: localize("Dialog.TabsLabel") };
    }

    _onFirstRender(context, options) {
      super._onFirstRender?.(context, options);
      this.element.addEventListener("change", (event) => this.#onChange(event));
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const element = this.element;
      const theme = getThemePreference();
      element.dataset.uiTheme = theme;
      element.classList.toggle("is-theme-foundry", theme === "foundry");
      element.classList.toggle("is-theme-signature", theme !== "foundry");
      refreshEditorState(element);
    }

    #onChange(event) {
      const target = event.target;
      const root = this.element;
      const name = target?.getAttribute?.("name") ?? "";

      if (name === "triggerKind" || name === "triggerCombatEvent") applyKindState(root);
      else if (name === "triggerMatchType") applyMatchFieldState(root, target.value);
      else if (target?.matches?.('[data-srt-extra-match-input="type"]')) applyExtraMatchFieldState(target.closest("[data-srt-extra-match]"), target.value);
      else if (target?.matches?.("[data-srt-action-type]")) applyActionFieldState(target.closest("[data-srt-action-config]"), target.value);

      if (name === "triggerRollTypes" || name === "triggerActorTypes") applyFilterDetailState(root);
      if (target?.tagName === "SELECT" && target.multiple) updateMultiSelectSummary(root, name);
      if (name === "triggerIncludeActors") rebuildItemChoices(root);
    }

    // A form that is invalid shows its problems and stays open, nothing typed is lost.
    static async #onSubmit() {
      const result = readTriggerForm(this.element);
      const errors = validateEditorForm(result);
      if (errors.length) throw new Error(errors.join(" "));
      this.submitted = result;
      await this.close();
    }

    static async #onAddExtraMatch() {
      const list = this.element.querySelector("[data-srt-extra-match-list]");
      if (!list) return;
      const index = list.querySelectorAll("[data-srt-extra-match]").length;
      const html = await foundry.applications.handlebars.renderTemplate(`${EDITOR_TEMPLATE_DIR}/extra-match.html`, buildExtraMatchDescriptor(DEFAULT_EXTRA_MATCH, index));
      list.insertAdjacentHTML("beforeend", html);
      const condition = list.lastElementChild;
      if (!condition) return;
      applyExtraMatchFieldState(condition, DEFAULT_EXTRA_MATCH.type);
      condition.querySelector('[data-srt-extra-match-input="type"]')?.focus?.();
    }

    static #onRemoveExtraMatch(event, target) {
      const condition = target.closest("[data-srt-extra-match]");
      const list = condition?.parentElement;
      condition?.remove();
      renumberExtraMatchConditions(list);
    }

    static #onPickFile(event, target) {
      const input = this.element.querySelector(`[name="${target.dataset.target}"]`);
      openFilePickerFor(input, target.dataset.picker);
    }

    _onClose(options) {
      super._onClose?.(options);
      const resolve = this.resolveResult;
      this.resolveResult = null;
      resolve?.(this.submitted);
    }
  };

  return editorClass;
}

// Opens the editor for a trigger (null for a new one) and resolves with the form values, or null when it is closed.
export async function openTriggerEditor({ trigger = null, duplicate = false } = {}) {
  await ensureModuleTranslationsLoaded();
  const current = trigger ? normalizeTrigger(trigger) : getBlankTrigger();
  const title = duplicate
    ? localize("Dialog.TriggerDuplicateTitle")
    : trigger
      ? localize("Dialog.TriggerEditTitle")
      : localize("Dialog.TriggerCreateTitle");
  const Editor = getEditorClass();
  return new Promise((resolve) => {
    const id = `${MODULE_ID}-trigger-editor-${trigger && !duplicate ? String(current.id).replace(/[^\w-]/g, "-") : "new"}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront?.();
      resolve(null);
      return;
    }
    new Editor({ current, duplicate, title, resolve, id }).render({ force: true });
  });
}

// The whole editing flow: opens the editor and returns the trigger it makes, or null.
export async function promptTriggerData(trigger = null, duplicate = false) {
  const result = await openTriggerEditor({ trigger, duplicate });
  if (!result) return null;
  const current = trigger ? normalizeTrigger(trigger) : getBlankTrigger();
  return buildTriggerFromEditorResult(current, result, { duplicate });
}

export const __test__ = {
  TAB_ICONS,
  TAB_LABEL_KEYS,
  getEditorClass,
  resetEditorClass() {
    editorClass = null;
  }
};
