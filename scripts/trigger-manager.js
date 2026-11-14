import {
  addSettingsGear,
  ensureModuleTranslationsLoaded,
  format,
  getProfileStore,
  getRuntimeOptions,
  getThemePreference,
  localize,
  MODULE_ID,
  saveTriggerStore
} from "./settings.js";
import { openTestBench } from "./roll-test-bench.js";
import { openRuleGallery } from "./gallery-window.js";
import { promptTriggerData } from "./trigger-editor.js";
import { isCombatTrigger } from "./combat-events.js";
import {
  buildProfileExportPayload,
  buildTriggerExportPayload,
  cloneProfileTrigger,
  describeMatch,
  escapeHtml,
  exportProfiles,
  exportTriggers,
  findTriggerById,
  getAllTriggers,
  getVisibleProfiles,
  importProfilesFromFile,
  importTriggersFromFile,
  presentProfile,
  presentTrigger,
  removeTrigger,
  upsertTrigger
} from "./trigger-data.js";
import { countFeature, markUsed } from "./usage.mjs";

// The trigger manager window (ApplicationV2) and the two settings menu buttons. The data helpers are in
// trigger-data.js, the editor in trigger-editor.js, the gallery of ready rules in gallery-window.js.

export { normalizeTrigger } from "./trigger-data.js";

let managerApp = null;
let managerClass = null;

export const MANAGER_TEMPLATE = `modules/${MODULE_ID}/templates/trigger-manager.html`;

function sortByName(left, right) {
  return left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" });
}

// What the manager template shows: the triggers by priority, the visible profiles and the counts.
export function buildManagerContext() {
  const runtime = getRuntimeOptions();
  const triggers = getAllTriggers()
    .map((trigger) => presentTrigger(trigger))
    .sort((left, right) => Number(right.priority) - Number(left.priority) || sortByName(left, right));
  const profiles = getVisibleProfiles(getProfileStore(), runtime.showInternalPresets)
    .map((profile) => presentProfile(profile))
    .sort(sortByName);

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

// The class is built on first use: foundry.applications.api only exists in the browser, the unit tests load this file in Node.
export function getManagerClass() {
  if (managerClass) return managerClass;
  const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

  managerClass = class SRTTriggerManager extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-manager`,
      classes: ["srt-window", "srt-manager-window"],
      window: { icon: "fa-solid fa-burst", resizable: true, contentClasses: ["standard-form"] },
      position: { width: 1080, height: 760 },
      actions: {
        createTrigger: SRTTriggerManager.#onCreate,
        openGallery: SRTTriggerManager.#onOpenGallery,
        openTestBench: SRTTriggerManager.#onOpenTestBench,
        exportTriggers: () => exportTriggers(),
        exportProfiles: () => exportProfiles(),
        importTriggers: SRTTriggerManager.#onPickFile,
        importProfiles: SRTTriggerManager.#onPickFile,
        editTrigger: SRTTriggerManager.#onEdit,
        duplicateTrigger: SRTTriggerManager.#onDuplicate,
        deleteTrigger: SRTTriggerManager.#onDelete,
        toggleTrigger: SRTTriggerManager.#onToggle,
        importProfile: SRTTriggerManager.#onImportProfile
      }
    };

    static PARTS = {
      main: { template: MANAGER_TEMPLATE, scrollable: [""] }
    };

    get title() {
      return localize("Manager.Title");
    }

    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      addSettingsGear(frame);
      return frame;
    }

    async _prepareContext(options) {
      return { ...(await super._prepareContext(options)), ...buildManagerContext() };
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const theme = getThemePreference();
      this.element.dataset.uiTheme = theme;
      this.element.classList.toggle("is-theme-foundry", theme === "foundry");
      this.element.classList.toggle("is-theme-signature", theme !== "foundry");
    }

    _attachPartListeners(partId, element, options) {
      super._attachPartListeners(partId, element, options);
      for (const input of element.querySelectorAll("input[data-srt-import]")) {
        input.addEventListener("change", (event) => void this.#onImportFile(event));
      }
    }

    async close(options = {}) {
      if (managerApp === this) managerApp = null;
      return super.close(options);
    }

    static async #onCreate() {
      const trigger = await promptTriggerData();
      if (!trigger) return;
      const saved = await upsertTrigger(trigger);
      countFeature(MODULE_ID, "triggerCreate");
      if (isCombatTrigger(saved)) countFeature(MODULE_ID, "combatTriggerCreate");
      ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
      this.render();
    }

    static #onOpenGallery() {
      return openRuleGallery();
    }

    static #onOpenTestBench() {
      return openTriggerTestBench();
    }

    // The file inputs are hidden, the buttons only open their file picker.
    static #onPickFile(event, target) {
      const kind = target.dataset.action === "importProfiles" ? "profiles" : "triggers";
      this.element.querySelector(`input[data-srt-import="${kind}"]`)?.click();
    }

    static async #onEdit(event, target) {
      const existing = findTriggerById(target.dataset.triggerId);
      if (!existing) return;
      const updated = await promptTriggerData(existing, false);
      if (!updated) return;
      const saved = await upsertTrigger({ ...updated, id: existing.id });
      countFeature(MODULE_ID, "triggerEdit");
      ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
      this.render();
    }

    static async #onDuplicate(event, target) {
      const existing = findTriggerById(target.dataset.triggerId);
      if (!existing) return;
      const duplicated = await promptTriggerData(existing, true);
      if (!duplicated) return;
      const saved = await upsertTrigger(duplicated);
      countFeature(MODULE_ID, "triggerCreate");
      ui.notifications?.info(format("Notification.TriggerSaved", { name: saved.name }));
      this.render();
    }

    static async #onDelete(event, target) {
      const existing = findTriggerById(target.dataset.triggerId);
      if (!existing) return;
      const confirmed = await DialogV2.confirm({
        window: { title: localize("Dialog.DeleteTitle") },
        content: `<p>${escapeHtml(format("Dialog.DeleteContent", { name: existing.name }))}</p>`,
        rejectClose: false
      });
      if (!confirmed) return;
      await removeTrigger(existing.id);
      ui.notifications?.info(format("Notification.TriggerDeleted", { name: existing.name }));
      this.render();
    }

    static async #onToggle(event, target) {
      const existing = findTriggerById(target.dataset.triggerId);
      if (!existing) return;
      const saved = await upsertTrigger({ ...existing, enabled: !existing.enabled });
      ui.notifications?.info(format("Notification.TriggerToggled", { name: saved.name }));
      this.render();
    }

    static async #onImportProfile(event, target) {
      const profile = getProfileStore().find((entry) => entry?.id === target.dataset.profileId);
      if (!profile) return;

      const currentById = new Map(getAllTriggers().map((trigger) => [trigger.id, trigger]));
      for (const profileTrigger of profile.triggers ?? []) {
        const imported = cloneProfileTrigger(profile, profileTrigger);
        currentById.set(imported.id, imported);
      }

      await saveTriggerStore([...currentById.values()]);
      countFeature(MODULE_ID, "profileImport");
      ui.notifications?.info(format("Notification.ProfileImported", { name: profile.name }));
      this.render();
    }

    async #onImportFile(event) {
      const input = event.currentTarget;
      const file = input?.files?.[0];
      if (!file) return;
      const profiles = input.dataset.srtImport === "profiles";

      try {
        if (profiles) await importProfilesFromFile(file);
        else await importTriggersFromFile(file);
        countFeature(MODULE_ID, "fileImport");
        this.render();
      } catch (error) {
        ui.notifications?.error(error?.message ?? localize(profiles ? "Import.InvalidProfiles" : "Import.Invalid"));
      } finally {
        input.value = "";
      }
    }
  };

  return managerClass;
}

// Only GMs manage triggers (world settings). Players get nothing, also through the module API.
export async function openTriggerManager() {
  if (!game.user?.isGM) return null;
  markUsed(MODULE_ID);
  await ensureModuleTranslationsLoaded();

  if (!managerApp) {
    const viewportWidth = globalThis.window?.innerWidth ?? 1600;
    const viewportHeight = globalThis.window?.innerHeight ?? 900;
    const width = Math.min(1080, Math.max(viewportWidth - 80, 720));
    const height = Math.min(760, Math.max(viewportHeight - 80, 520));
    const Manager = getManagerClass();
    managerApp = new Manager({
      position: {
        width,
        height,
        left: Math.max(Math.round((viewportWidth - width) / 2), 20),
        top: Math.max(Math.round((viewportHeight - height) / 2), 20)
      }
    });
  }
  await managerApp.render({ force: true });
  return managerApp;
}

// The bench names conditions with the same wording as the trigger cards.
export function openTriggerTestBench() {
  countFeature(MODULE_ID, "testBench");
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

// Refreshes the manager after the triggers changed somewhere else (the gallery, another GM).
export function refreshTriggerManager() {
  if (managerApp?.rendered) void managerApp.render();
}

let settingsMenuClass = null;
let selfTestMenuClass = null;

// The settings menu button opens the manager instead of a window of its own. registerMenu needs an ApplicationV2
// (or FormApplication) class, which is why this is a stub: its render opens the real window.
export function getSettingsMenuClass() {
  if (settingsMenuClass) return settingsMenuClass;
  settingsMenuClass = class SRTSettingsMenu extends foundry.applications.api.ApplicationV2 {
    render() {
      void openTriggerManager();
      return this;
    }
  };
  return settingsMenuClass;
}

// The menu button which runs the self-test instead of opening a window.
export function getSelfTestMenuClass() {
  if (selfTestMenuClass) return selfTestMenuClass;
  selfTestMenuClass = class SRTSelfTestMenu extends foundry.applications.api.ApplicationV2 {
    render() {
      if (game.user?.isGM) void import("./selftest.js").then(({ runSelfTest }) => runSelfTest());
      return this;
    }
  };
  return selfTestMenuClass;
}

export const __test__ = {
  buildManagerContext,
  buildProfileExportPayload,
  buildTriggerExportPayload,
  getManagerClass,
  resetManagerApp() {
    managerApp = null;
    managerClass = null;
    settingsMenuClass = null;
    selfTestMenuClass = null;
  }
};
