import { addSettingsGear, ensureModuleTranslationsLoaded, format, getThemePreference, localize, MODULE_ID } from "./settings.js";
import {
  buildRuleTrigger,
  getAddedRuleIds,
  getMissingSlots,
  getRule,
  getRuleTitle,
  getRuleWords,
  getVisibleGroups,
  isCombatRule,
  resolveNumber
} from "./rule-gallery.js";
import { promptTriggerData } from "./trigger-editor.js";
import { getAllTriggers, getReferenceSelectChoices, upsertTrigger } from "./trigger-data.js";
import { countFeature } from "./usage.mjs";

// The window of ready house rules (ApplicationV2). The catalog and the trigger a rule becomes are in rule-gallery.js.

export const GALLERY_TEMPLATE = `modules/${MODULE_ID}/templates/gallery.html`;

let galleryApp = null;
let galleryClass = null;

const MODE_LABEL_KEYS = { automatic: "Execution.Automatic", "confirm-gm": "Execution.ConfirmGm" };

function getSystemId() {
  return String(game.system?.id ?? "");
}

// The text a search looks into: title and plain words, lowercase.
function buildSearchText(rule) {
  const words = getRuleWords(rule);
  return [getRuleTitle(rule), words.when, words.then].join(" ").toLowerCase();
}

// What the gallery template shows for the current state.
export function buildGalleryContext({ values = {}, search = "", showAll = false } = {}) {
  const systemId = getSystemId();
  const added = getAddedRuleIds(getAllTriggers());
  const tableChoices = { "": localize("Gallery.ChooseTable"), ...getReferenceSelectChoices("table") };
  const groups = getVisibleGroups({ systemId, showAll, search: "" }).map((group) => ({
    id: group.id,
    label: localize(`Gallery.Group.${group.id}`),
    rules: group.rules.map((rule) => {
      const own = values[rule.id] ?? {};
      const words = getRuleWords(rule, own);
      return {
        id: rule.id,
        icon: rule.icon,
        title: getRuleTitle(rule),
        isCombat: isCombatRule(rule),
        kindLabel: localize(isCombatRule(rule) ? "Manager.KindCombat" : "Manager.KindRoll"),
        when: words.when,
        then: words.then,
        searchText: buildSearchText(rule),
        added: added.has(rule.id),
        modeLabel: localize(MODE_LABEL_KEYS[rule.mode] ?? "Execution.Automatic"),
        slots: (rule.slots ?? []).map((slot) => slot.type === "table"
          ? { key: slot.key, isTable: true, label: localize(slot.labelKey), choices: tableChoices, value: own[slot.key] ?? "" }
          : { key: slot.key, isTable: false, label: localize(slot.labelKey), min: slot.min ?? 1, max: slot.max ?? 999, value: resolveNumber(slot, own[slot.key]) })
      };
    })
  }));

  return {
    groups,
    search,
    showAll,
    uiTheme: getThemePreference(),
    systemNote: format("Gallery.SystemNote", { system: game.system?.title ?? getSystemId() })
  };
}

// Adds a rule to the world: checks the choices, builds the trigger and stores it. Returns the saved trigger, or null
// when a choice is missing (the message names it).
export async function addRuleToWorld(ruleId, values = {}) {
  const rule = getRule(ruleId);
  if (!rule) return null;
  if (getMissingSlots(rule, values).length) {
    ui.notifications?.warn(localize("Gallery.PickTableFirst"));
    return null;
  }
  const trigger = buildRuleTrigger(rule, values, { id: `gallery-${rule.id}-${foundry.utils.randomID(6)}` });
  const saved = await upsertTrigger(trigger);
  countFeature(MODULE_ID, "galleryAdd");
  if (isCombatRule(rule)) countFeature(MODULE_ID, "combatTriggerCreate");
  ui.notifications?.info(format("Gallery.AddedNotice", { name: saved.name }));
  return saved;
}

// The class is built on first use: foundry.applications.api only exists in the browser, the unit tests load this file in Node.
export function getGalleryClass() {
  if (galleryClass) return galleryClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  galleryClass = class SRTRuleGallery extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-gallery`,
      classes: ["srt-window", "srt-gallery-window"],
      window: { icon: "fa-solid fa-wand-magic-sparkles", resizable: true, contentClasses: ["standard-form"] },
      position: { width: 860, height: 740 },
      actions: { addRule: SRTRuleGallery.#onAdd, addRuleAndEdit: SRTRuleGallery.#onAddAndEdit }
    };

    static PARTS = {
      main: { template: GALLERY_TEMPLATE, scrollable: [".srt-gallery-body"] }
    };

    // The choices of the cards (table, numbers), kept while the window renders again.
    values = {};
    search = "";
    showAll = false;

    get title() {
      return localize("Gallery.Title");
    }

    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      addSettingsGear(frame);
      return frame;
    }

    async _prepareContext(options) {
      return { ...(await super._prepareContext(options)), ...buildGalleryContext({ values: this.values, search: this.search, showAll: this.showAll }) };
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const element = this.element;
      const theme = getThemePreference();
      element.dataset.uiTheme = theme;
      element.classList.toggle("is-theme-foundry", theme === "foundry");
      element.classList.toggle("is-theme-signature", theme !== "foundry");
      this.#applyFilter();
    }

    _attachPartListeners(partId, element, options) {
      super._attachPartListeners(partId, element, options);
      element.querySelector("[data-srt-gallery-search]")?.addEventListener("input", (event) => {
        this.search = event.currentTarget.value;
        this.#applyFilter();
      });
      element.querySelector("[data-srt-gallery-all]")?.addEventListener("change", (event) => {
        this.showAll = event.currentTarget.checked;
        void this.render();
      });
      for (const input of element.querySelectorAll("[data-srt-slot]")) {
        input.addEventListener("change", (event) => this.#onSlotChange(event));
        if (input.type === "number") input.addEventListener("input", (event) => this.#onSlotChange(event));
      }
    }

    // Cards that do not match the search are hidden, empty groups with them. No new render, so the typing goes on.
    #applyFilter() {
      const needle = this.search.trim().toLowerCase();
      let visible = 0;
      for (const card of this.element.querySelectorAll(".srt-gallery-card")) {
        const hit = !needle || String(card.dataset.srtSearch ?? "").includes(needle);
        card.hidden = !hit;
        if (hit) visible += 1;
      }
      for (const group of this.element.querySelectorAll("[data-srt-gallery-group]")) {
        group.hidden = !group.querySelector(".srt-gallery-card:not([hidden])");
      }
      const none = this.element.querySelector("[data-srt-gallery-none]");
      if (none) none.hidden = visible > 0 || !this.element.querySelector(".srt-gallery-card");
    }

    readValues(card) {
      const values = {};
      for (const input of card.querySelectorAll("[data-srt-slot]")) values[input.dataset.srtSlot] = input.value;
      return values;
    }

    // The words of the card follow the numbers.
    #onSlotChange(event) {
      const card = event.currentTarget.closest(".srt-gallery-card");
      const rule = getRule(card?.dataset.ruleId);
      if (!rule) return;
      const values = this.readValues(card);
      this.values[rule.id] = values;
      const words = getRuleWords(rule, values);
      const when = card.querySelector("[data-srt-when]");
      const then = card.querySelector("[data-srt-then]");
      if (when) when.textContent = words.when;
      if (then) then.textContent = words.then;
    }

    static async #onAdd(event, target) {
      const card = target.closest(".srt-gallery-card");
      const saved = await addRuleToWorld(target.dataset.ruleId, this.readValues(card));
      if (!saved) return;
      await refreshManager();
      this.render();
    }

    // Adds the rule and opens the editor on the new trigger. Closing the editor keeps the rule as it was added.
    static async #onAddAndEdit(event, target) {
      const card = target.closest(".srt-gallery-card");
      const saved = await addRuleToWorld(target.dataset.ruleId, this.readValues(card));
      if (!saved) return;
      this.render();
      const updated = await promptTriggerData(saved, false);
      if (updated) {
        await upsertTrigger({ ...updated, id: saved.id });
        countFeature(MODULE_ID, "triggerEdit");
        ui.notifications?.info(format("Notification.TriggerSaved", { name: updated.name }));
      }
      await refreshManager();
    }

    async close(options = {}) {
      if (galleryApp === this) galleryApp = null;
      return super.close(options);
    }
  };

  return galleryClass;
}

async function refreshManager() {
  const { refreshTriggerManager } = await import("./trigger-manager.js");
  refreshTriggerManager();
}

export async function openRuleGallery() {
  if (!game.user?.isGM) return null;
  await ensureModuleTranslationsLoaded();
  if (!galleryApp) {
    const Gallery = getGalleryClass();
    // Opens beside the manager, not on top of it
    const manager = foundry.applications.instances.get(`${MODULE_ID}-manager`);
    const position = manager?.rendered ? { left: (manager.position?.left ?? 0) + 60, top: (manager.position?.top ?? 0) + 40 } : {};
    galleryApp = new Gallery({ position });
  }
  countFeature(MODULE_ID, "galleryOpen");
  await galleryApp.render({ force: true });
  return galleryApp;
}

export const __test__ = {
  buildSearchText,
  getGalleryClass,
  resetGallery() {
    galleryApp = null;
    galleryClass = null;
  }
};
