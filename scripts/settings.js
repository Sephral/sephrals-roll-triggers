import { getInternalProfiles } from "./default-presets.js";

export const MODULE_ID = "sephrals-roll-triggers";
export const UI_LANGUAGE_SETTING = "uiLanguage";
export const UI_THEME_SETTING = "uiTheme";
export const UI_THEMES = Object.freeze({
  SIGNATURE: "signature",
  FOUNDRY: "foundry"
});
export const SUPPORTED_UI_LANGUAGES = Object.freeze(["en", "de"]);
const DEFAULT_UI_LANGUAGE = "en";
const MODULE_TRANSLATION_CACHE = new Map();
let MODULE_TRANSLATION_LOAD = null;

export const SETTINGS = {
  UI_LANGUAGE: UI_LANGUAGE_SETTING,
  UI_THEME: UI_THEME_SETTING,
  ENABLED: "enabled",
  DEBUG: "debug",
  DEFAULT_EXECUTION_MODE: "defaultExecutionMode",
  ALLOW_PLAYER_BUTTONS: "allowPlayerButtons",
  ENABLE_IMPORT_EXPORT: "enableImportExport",
  SHOW_INTERNAL_PRESETS: "showInternalPresets",
  STORE_TRIGGERED_IN_CHAT: "storeTriggeredInChat",
  RESPECT_PRIVATE_ROLLS: "respectPrivateRolls",
  MAX_ACTIONS_PER_MESSAGE: "maxActionsPerMessage",
  TRIGGERS: "triggers",
  PROFILES: "profiles"
};

const EXECUTION_MODE_CHOICES = {
  automatic: "SRT.Execution.Automatic",
  "confirm-gm": "SRT.Execution.ConfirmGm",
  "chat-button": "SRT.Execution.ChatButton",
  "gm-whisper-log": "SRT.Execution.GmWhisperLog",
  disabled: "SRT.Execution.Disabled"
};

function localizeChoiceMap(choices) {
  return Object.fromEntries(
    Object.entries(choices).map(([key, value]) => [key, game.i18n.localize(value)])
  );
}

function interpolateTemplate(template, data = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (_match, field) => {
    const replacement = data[field];
    return replacement === undefined || replacement === null ? `{${field}}` : String(replacement);
  });
}

function registerBooleanSetting(key, nameKey, hintKey, defaultValue, scope = "world", config = true) {
  game.settings.register(MODULE_ID, key, {
    name: game.i18n.localize(nameKey),
    hint: game.i18n.localize(hintKey),
    scope,
    config,
    type: Boolean,
    default: defaultValue
  });
}

export function getRegisteredSettingValue(settingKey, fallback) {
  const fullKey = `${MODULE_ID}.${settingKey}`;
  if (!game?.settings?.settings?.has(fullKey)) return fallback;

  try {
    return game.settings.get(MODULE_ID, settingKey);
  } catch (_error) {
    return fallback;
  }
}

export function normalizeTheme(theme) {
  return theme === UI_THEMES.FOUNDRY ? UI_THEMES.FOUNDRY : UI_THEMES.SIGNATURE;
}

export function normalizeUiLanguage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return DEFAULT_UI_LANGUAGE;
  if (SUPPORTED_UI_LANGUAGES.includes(normalized)) return normalized;

  const baseLanguage = normalized.split(/[-_.]/)[0];
  return SUPPORTED_UI_LANGUAGES.includes(baseLanguage) ? baseLanguage : DEFAULT_UI_LANGUAGE;
}

export function getPreferredLanguage() {
  return getRegisteredSettingValue(UI_LANGUAGE_SETTING, "default");
}

export function getModuleLanguage(preferredLanguage = getPreferredLanguage()) {
  if (SUPPORTED_UI_LANGUAGES.includes(preferredLanguage)) return preferredLanguage;
  return normalizeUiLanguage(game.i18n?.lang);
}

async function loadModuleTranslations(language) {
  const normalized = normalizeUiLanguage(language);
  if (MODULE_TRANSLATION_CACHE.has(normalized)) return MODULE_TRANSLATION_CACHE.get(normalized);

  const translationUrl = new URL(`../lang/${normalized}.json`, import.meta.url);
  if (translationUrl.protocol === "file:") {
    const emptyTranslations = {};
    MODULE_TRANSLATION_CACHE.set(normalized, emptyTranslations);
    return emptyTranslations;
  }

  const response = await fetch(translationUrl);
  if (!response.ok) throw new Error(`Failed to load ${normalized} translations (${response.status})`);

  const translations = await response.json();
  MODULE_TRANSLATION_CACHE.set(normalized, translations);
  return translations;
}

export async function ensureModuleTranslationsLoaded() {
  if (!MODULE_TRANSLATION_LOAD) {
    MODULE_TRANSLATION_LOAD = Promise.all(SUPPORTED_UI_LANGUAGES.map((language) => loadModuleTranslations(language)))
      .catch((error) => {
        console.warn(`${MODULE_ID} |`, error);
        return null;
      });
  }

  return MODULE_TRANSLATION_LOAD;
}

function refreshLocalizedUi() {
  for (const app of Object.values(ui?.windows ?? {})) {
    if (app?.options?.id === `${MODULE_ID}-manager`) {
      app.options ??= {};
      app.options.title = localize("Manager.Title");
      app.render(true);
    }
  }
  ui?.controls?.render?.({ reset: true });
}

export function getThemePreference() {
  return normalizeTheme(getRegisteredSettingValue(UI_THEME_SETTING, UI_THEMES.SIGNATURE));
}

export function localize(key) {
  const fullKey = `SRT.${key}`;
  const override = MODULE_TRANSLATION_CACHE.get(getModuleLanguage())?.[fullKey];
  if (override) return override;
  return game.i18n.localize(fullKey);
}

export function format(key, data) {
  const fullKey = `SRT.${key}`;
  const override = MODULE_TRANSLATION_CACHE.get(getModuleLanguage())?.[fullKey];
  if (override) return interpolateTemplate(override, data);
  return game.i18n.format(fullKey, data);
}

export function getExecutionModeChoices() {
  return localizeChoiceMap(EXECUTION_MODE_CHOICES);
}

export function registerManagerMenu(menuType) {
  game.settings.registerMenu(MODULE_ID, "openManager", {
    name: localize("Settings.Menu.Name"),
    label: localize("Settings.Menu.Label"),
    hint: localize("Settings.Menu.Hint"),
    icon: "fa-solid fa-burst",
    type: menuType,
    restricted: true
  });
}

export function registerSettings() {
  game.settings.register(MODULE_ID, UI_LANGUAGE_SETTING, {
    scope: "client",
    config: true,
    type: String,
    default: "default",
    name: game.i18n.localize("SRT.Settings.Language.Name"),
    hint: game.i18n.localize("SRT.Settings.Language.Hint"),
    choices: {
      default: game.i18n.localize("SRT.Language.Default"),
      de: game.i18n.localize("SRT.Language.De"),
      en: game.i18n.localize("SRT.Language.En")
    },
    onChange: () => {
      void ensureModuleTranslationsLoaded().then(() => refreshLocalizedUi());
    }
  });

  game.settings.register(MODULE_ID, UI_THEME_SETTING, {
    scope: "client",
    config: true,
    type: String,
    default: UI_THEMES.SIGNATURE,
    name: game.i18n.localize("SRT.Settings.Theme.Name"),
    hint: game.i18n.localize("SRT.Settings.Theme.Hint"),
    choices: {
      [UI_THEMES.SIGNATURE]: game.i18n.localize("SRT.Theme.Signature"),
      [UI_THEMES.FOUNDRY]: game.i18n.localize("SRT.Theme.Foundry")
    }
  });

  registerBooleanSetting(SETTINGS.ENABLED, "SRT.Settings.Enabled.Name", "SRT.Settings.Enabled.Hint", true);
  registerBooleanSetting(SETTINGS.DEBUG, "SRT.Settings.Debug.Name", "SRT.Settings.Debug.Hint", false, "client");
  registerBooleanSetting(SETTINGS.ALLOW_PLAYER_BUTTONS, "SRT.Settings.AllowPlayerButtons.Name", "SRT.Settings.AllowPlayerButtons.Hint", false);
  registerBooleanSetting(SETTINGS.ENABLE_IMPORT_EXPORT, "SRT.Settings.EnableImportExport.Name", "SRT.Settings.EnableImportExport.Hint", true);
  registerBooleanSetting(SETTINGS.SHOW_INTERNAL_PRESETS, "SRT.Settings.ShowInternalPresets.Name", "SRT.Settings.ShowInternalPresets.Hint", true, "client");
  registerBooleanSetting(SETTINGS.STORE_TRIGGERED_IN_CHAT, "SRT.Settings.StoreTriggeredInChat.Name", "SRT.Settings.StoreTriggeredInChat.Hint", true);
  registerBooleanSetting(SETTINGS.RESPECT_PRIVATE_ROLLS, "SRT.Settings.RespectPrivateRolls.Name", "SRT.Settings.RespectPrivateRolls.Hint", true);

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_EXECUTION_MODE, {
    name: game.i18n.localize("SRT.Settings.DefaultExecutionMode.Name"),
    hint: game.i18n.localize("SRT.Settings.DefaultExecutionMode.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: localizeChoiceMap(EXECUTION_MODE_CHOICES),
    default: "confirm-gm"
  });

  game.settings.register(MODULE_ID, SETTINGS.MAX_ACTIONS_PER_MESSAGE, {
    name: game.i18n.localize("SRT.Settings.MaxActionsPerMessage.Name"),
    hint: game.i18n.localize("SRT.Settings.MaxActionsPerMessage.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 50, step: 1 },
    default: 10
  });

  game.settings.register(MODULE_ID, SETTINGS.TRIGGERS, {
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.PROFILES, {
    scope: "world",
    config: false,
    type: Object,
    default: getInternalProfiles()
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function isModuleEnabled() {
  return Boolean(getSetting(SETTINGS.ENABLED));
}

export function isDebugEnabled() {
  return Boolean(getSetting(SETTINGS.DEBUG));
}

export function getTriggerStore() {
  return Array.isArray(getSetting(SETTINGS.TRIGGERS)) ? getSetting(SETTINGS.TRIGGERS) : [];
}

export function getProfileStore() {
  return Array.isArray(getSetting(SETTINGS.PROFILES)) ? getSetting(SETTINGS.PROFILES) : [];
}

export async function saveTriggerStore(triggers) {
  return game.settings.set(MODULE_ID, SETTINGS.TRIGGERS, Array.isArray(triggers) ? triggers : []);
}

export async function saveProfileStore(profiles) {
  return game.settings.set(MODULE_ID, SETTINGS.PROFILES, Array.isArray(profiles) ? profiles : []);
}

export function getRuntimeOptions() {
  return {
    uiTheme: getThemePreference(),
    debug: isDebugEnabled(),
    defaultExecutionMode: String(getSetting(SETTINGS.DEFAULT_EXECUTION_MODE) ?? "confirm-gm"),
    allowPlayerButtons: Boolean(getSetting(SETTINGS.ALLOW_PLAYER_BUTTONS)),
    enableImportExport: Boolean(getSetting(SETTINGS.ENABLE_IMPORT_EXPORT)),
    showInternalPresets: Boolean(getSetting(SETTINGS.SHOW_INTERNAL_PRESETS)),
    storeTriggeredInChat: Boolean(getSetting(SETTINGS.STORE_TRIGGERED_IN_CHAT)),
    respectPrivateRolls: Boolean(getSetting(SETTINGS.RESPECT_PRIVATE_ROLLS)),
    maxActionsPerMessage: Number(getSetting(SETTINGS.MAX_ACTIONS_PER_MESSAGE) ?? 10)
  };
}

export function createSettingsFacade() {
  return {
    moduleId: MODULE_ID,
    get enabled() {
      return isModuleEnabled();
    },
    get debug() {
      return isDebugEnabled();
    },
    get defaultExecutionMode() {
      return getRuntimeOptions().defaultExecutionMode;
    },
    get allowPlayerButtons() {
      return getRuntimeOptions().allowPlayerButtons;
    },
    get storeTriggeredInChat() {
      return getRuntimeOptions().storeTriggeredInChat;
    },
    get respectPrivateRolls() {
      return getRuntimeOptions().respectPrivateRolls;
    },
    get maxActionsPerMessage() {
      return getRuntimeOptions().maxActionsPerMessage;
    },
    getTriggers() {
      return getTriggerStore();
    },
    getProfiles() {
      return getProfileStore();
    }
  };
}

export const __test__ = {
  UI_LANGUAGE_SETTING,
  UI_THEME_SETTING,
  UI_THEMES,
  SUPPORTED_UI_LANGUAGES,
  getRegisteredSettingValue,
  normalizeUiLanguage,
  getModuleLanguage,
  normalizeTheme,
  getThemePreference,
  localize,
  format,
  createSettingsFacade
};