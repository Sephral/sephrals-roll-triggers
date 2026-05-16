import assert from "node:assert/strict";
import test from "node:test";

const registered = [];
const registeredMenus = [];

globalThis.game = {
  i18n: {
    localize(key) {
      return key;
    },
    format(key, data) {
      return `${key}:${JSON.stringify(data)}`;
    }
  },
  settings: {
    settings: new Map(),
    values: new Map(),
    register(moduleId, key, config) {
      registered.push({ moduleId, key, config });
      this.settings.set(`${moduleId}.${key}`, config);
      this.values.set(`${moduleId}.${key}`, config.default);
    },
    registerMenu(moduleId, key, config) {
      registeredMenus.push({ moduleId, key, config });
    },
    get(moduleId, key) {
      return this.values.get(`${moduleId}.${key}`);
    },
    async set(moduleId, key, value) {
      this.values.set(`${moduleId}.${key}`, value);
      return value;
    }
  }
};

const settingsModule = await import("../scripts/settings.js");

test("registerSettings registers theme, runtime, and storage settings", () => {
  registered.length = 0;
  settingsModule.registerSettings();

  assert.ok(registered.some((entry) => entry.key === settingsModule.SETTINGS.UI_LANGUAGE));
  assert.ok(registered.some((entry) => entry.key === settingsModule.SETTINGS.UI_THEME));
  assert.ok(registered.some((entry) => entry.key === settingsModule.SETTINGS.TRIGGERS));
  assert.ok(registered.some((entry) => entry.key === settingsModule.SETTINGS.PROFILES));
  assert.ok(Array.isArray(game.settings.get(settingsModule.MODULE_ID, settingsModule.SETTINGS.PROFILES)));
});

test("registerManagerMenu wires the settings menu metadata", () => {
  registeredMenus.length = 0;
  class DummyMenu {}

  settingsModule.registerManagerMenu(DummyMenu);

  assert.equal(registeredMenus.length, 1);
  assert.equal(registeredMenus[0].moduleId, settingsModule.MODULE_ID);
  assert.equal(registeredMenus[0].config.type, DummyMenu);
});

test("save store helpers normalize non-array input and runtime options read current settings", async () => {
  settingsModule.registerSettings();

  await settingsModule.saveTriggerStore([{ id: "t1" }]);
  await settingsModule.saveProfileStore(null);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.DEBUG}`, true);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.DEFAULT_EXECUTION_MODE}`, "automatic");
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.ALLOW_PLAYER_BUTTONS}`, true);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.ENABLE_IMPORT_EXPORT}`, false);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.SHOW_INTERNAL_PRESETS}`, false);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.STORE_TRIGGERED_IN_CHAT}`, false);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.RESPECT_PRIVATE_ROLLS}`, false);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.MAX_ACTIONS_PER_MESSAGE}`, 4);
  game.settings.values.set(`${settingsModule.MODULE_ID}.${settingsModule.SETTINGS.UI_THEME}`, settingsModule.UI_THEMES.FOUNDRY);

  assert.deepEqual(settingsModule.getTriggerStore(), [{ id: "t1" }]);
  assert.deepEqual(settingsModule.getProfileStore(), []);
  assert.deepEqual(settingsModule.getRuntimeOptions(), {
    uiTheme: settingsModule.UI_THEMES.FOUNDRY,
    debug: true,
    defaultExecutionMode: "automatic",
    allowPlayerButtons: true,
    enableImportExport: false,
    showInternalPresets: false,
    storeTriggeredInChat: false,
    respectPrivateRolls: false,
    maxActionsPerMessage: 4
  });
});

test("registered setting helper falls back when get throws", () => {
  settingsModule.registerSettings();

  game.settings.settings.set(`${settingsModule.MODULE_ID}.broken`, {});
  const originalGet = game.settings.get;
  game.settings.get = () => {
    throw new Error("boom");
  };

  assert.equal(settingsModule.getRegisteredSettingValue("broken", "fallback"), "fallback");

  game.settings.get = originalGet;
});

test("createSettingsFacade reads current runtime settings on every access", async () => {
  settingsModule.registerSettings();

  const facade = settingsModule.createSettingsFacade();

  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.ENABLED, true);
  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.ALLOW_PLAYER_BUTTONS, false);
  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.MAX_ACTIONS_PER_MESSAGE, 2);

  assert.equal(facade.enabled, true);
  assert.equal(facade.allowPlayerButtons, false);
  assert.equal(facade.maxActionsPerMessage, 2);

  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.ENABLED, false);
  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.ALLOW_PLAYER_BUTTONS, true);
  await game.settings.set(settingsModule.MODULE_ID, settingsModule.SETTINGS.MAX_ACTIONS_PER_MESSAGE, 7);

  assert.equal(facade.enabled, false);
  assert.equal(facade.allowPlayerButtons, true);
  assert.equal(facade.maxActionsPerMessage, 7);
});