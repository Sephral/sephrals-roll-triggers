import { GenericRollAdapter } from "./adapters/generic-adapter.js";
import { debugTrace, registerDebug } from "./debug.js";
import { registerDebugMenu, saveDebugFile } from "./debug-file.mjs";
import { RollTriggerService } from "./roll-trigger-service.js";
import { getInternalProfiles } from "./default-presets.js";
import { openTriggerManager, openTriggerTestBench, SRTSelfTestMenu, SRTSettingsMenu, toggleTriggerManager } from "./trigger-manager.js";
import { noticeNewVersions, runSelfTest } from "./selftest.js";
import {
  createSettingsFacade,
  ensureModuleTranslationsLoaded,
  localize,
  MODULE_ID,
  getProfileStore,
  registerManagerMenu,
  registerSelfTestMenu,
  registerSettings,
  SETTINGS
} from "./settings.js";
import { registerUsage } from "./usage.mjs";

let service = null;
const DEFAULT_SCENE_CONTROL = "tokens";
const TRIGGER_MANAGER_CONTROL = "rollTriggers";

function hydrateRenderedChatMessages() {
  if (!service) return;

  for (const element of document.querySelectorAll(".message[data-message-id], li.message[data-message-id], li.chat-message[data-message-id]")) {
    const messageId = element.dataset.messageId;
    if (!messageId) continue;

    const message = game.messages?.get?.(messageId) ?? null;
    if (!message) continue;

    service.renderChatMessage(message, element);
  }
}

function scheduleChatHydration() {
  for (const delay of [0, 50, 150]) {
    globalThis.setTimeout?.(() => {
      hydrateRenderedChatMessages();
    }, delay);
  }
}

async function ensureProfileStoreInitialized() {
  const current = getProfileStore();
  if (current.length > 0) return;
  await game.settings.set(MODULE_ID, SETTINGS.PROFILES, getInternalProfiles());
}

Hooks.once("init", () => {
  registerSettings();
  registerManagerMenu(SRTSettingsMenu);
  registerSelfTestMenu(SRTSelfTestMenu);
  registerDebugMenu(MODULE_ID, { name: localize("Debug.Title"), label: localize("Debug.Save"), hint: localize("Debug.Hint") });
  registerDebug(() => service);
  registerUsage(MODULE_ID, {
    features: ["triggerFired", "chatButtonRun", "triggerCreate", "triggerEdit", "profileImport", "fileImport", "fileExport", "testBench"],
    settings: [SETTINGS.UI_THEME, SETTINGS.DEFAULT_EXECUTION_MODE, SETTINGS.ALLOW_PLAYER_BUTTONS]
  });
});

Hooks.once("ready", async () => {
  await ensureModuleTranslationsLoaded();
  await ensureProfileStoreInitialized();
  service = new RollTriggerService({
    adapter: new GenericRollAdapter(),
    settings: createSettingsFacade(),
    trace: debugTrace
  });

  scheduleChatHydration();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openManager: openTriggerManager,
      toggleManager: toggleTriggerManager,
      openTestBench: openTriggerTestBench,
      runSelfTest,
      // One file for all of Sephral's modules, without a message id about their latest picture
      saveDebugFile: (messageId) => saveDebugFile(messageId ?? null, { moduleId: MODULE_ID })
    };
  }
  noticeNewVersions();
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  controls[TRIGGER_MANAGER_CONTROL] = {
    name: TRIGGER_MANAGER_CONTROL,
    title: localize("Controls.Title"),
    icon: "fa-solid fa-burst",
    visible: true,
    order: Object.keys(controls).length,
    activeTool: "toggle",
    onChange: (_event, active) => {
      if (active) toggleTriggerManagerFromSceneControl();
    },
    tools: {
      toggle: {
        name: "toggle",
        title: localize("Controls.Toggle"),
        icon: "fa-solid fa-burst",
        order: 0,
        button: true,
        visible: true,
        onChange: (_event, active) => {
          if (active) toggleTriggerManagerFromSceneControl();
        }
      }
    }
  };
});

Hooks.on("canvasReady", () => {
  installSceneControlClickFallback();
});

Hooks.on("renderSceneControls", () => {
  installSceneControlClickFallback();
});

function installSceneControlClickFallback() {
  const button = document.querySelector(`[data-control='${TRIGGER_MANAGER_CONTROL}']`);
  if (!button || button.dataset.srtClickFallbackInstalled === "true") return;

  button.dataset.srtClickFallbackInstalled = "true";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleTriggerManagerFromSceneControl();
  });
}

function toggleTriggerManagerFromSceneControl() {
  const result = toggleTriggerManager();
  scheduleSceneControlRestore();
  return result;
}

function scheduleSceneControlRestore() {
  if (typeof ui?.controls?.activate !== "function") return;
  if (!ui.controls.controls?.[DEFAULT_SCENE_CONTROL]) return;

  window.setTimeout(() => {
    if (ui.controls.control?.name === DEFAULT_SCENE_CONTROL) return;
    ui.controls.activate({ control: DEFAULT_SCENE_CONTROL });
  }, 25);
}

function getFoundryGeneration() {
  const releaseGeneration = Number(game.release?.generation ?? NaN);
  if (Number.isFinite(releaseGeneration)) return releaseGeneration;

  const versionGeneration = Number.parseInt(String(game.version ?? "").split(".")[0] ?? "", 10);
  return Number.isFinite(versionGeneration) ? versionGeneration : 0;
}

Hooks.on("createChatMessage", async (message) => {
  if (!service) return;
  if (await service.handleDeferredRequestMessage(message)) return;
  await service.processChatMessage(message);
});

// Ready Set Roll and MidiQOL post a card first and add its rolls by an update.
Hooks.on("updateChatMessage", async (message, changed) => {
  if (!service || !service.adapter?.rollsChanged?.(changed)) return;
  await service.processChatMessage(message);
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!service) return;
  service.renderChatMessage(message, html);
});

// dnd5e 6 fills its roll cards after the core hook and drops what was added there, so the buttons follow its hook too.
Hooks.on("dnd5e.renderChatMessage", (message, html) => {
  if (!service) return;
  service.renderChatMessage(message, html);
});

Hooks.on("renderChatLog", () => {
  scheduleChatHydration();
});

export const __test__ = {
  DEFAULT_SCENE_CONTROL,
  TRIGGER_MANAGER_CONTROL,
  getFoundryGeneration,
  installSceneControlClickFallback,
  toggleTriggerManagerFromSceneControl,
  scheduleSceneControlRestore
};