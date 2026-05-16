import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  i18n: {
    localize(key) {
      return key;
    }
  },
  settings: {
    settings: new Map(),
    get(moduleId, settingKey) {
      return this.values.get(`${moduleId}.${settingKey}`);
    },
    values: new Map()
  }
};

const { __test__ } = await import("../scripts/settings.js");

test("normalizeTheme falls back to signature", () => {
  assert.equal(__test__.normalizeTheme("foundry"), __test__.UI_THEMES.FOUNDRY);
  assert.equal(__test__.normalizeTheme("other"), __test__.UI_THEMES.SIGNATURE);
});

test("getThemePreference reads registered ui theme setting", () => {
  game.settings.settings.set(`sephrals-roll-triggers.${__test__.UI_THEME_SETTING}`, {});
  game.settings.values.set(`sephrals-roll-triggers.${__test__.UI_THEME_SETTING}`, __test__.UI_THEMES.FOUNDRY);

  assert.equal(__test__.getThemePreference(), __test__.UI_THEMES.FOUNDRY);
});

test("module language follows explicit setting or Foundry language", () => {
  game.settings.settings.set(`sephrals-roll-triggers.${__test__.UI_LANGUAGE_SETTING}`, {});

  game.settings.values.set(`sephrals-roll-triggers.${__test__.UI_LANGUAGE_SETTING}`, "de");
  assert.equal(__test__.getModuleLanguage(), "de");

  game.settings.values.set(`sephrals-roll-triggers.${__test__.UI_LANGUAGE_SETTING}`, "default");
  game.i18n.lang = "de-DE";
  assert.equal(__test__.getModuleLanguage(), "de");
  game.i18n.lang = "fr";
  assert.equal(__test__.getModuleLanguage(), "en");
});

test("normalizeUiLanguage accepts supported bases and falls back to English", () => {
  assert.equal(__test__.normalizeUiLanguage("de-DE"), "de");
  assert.equal(__test__.normalizeUiLanguage("en_US"), "en");
  assert.equal(__test__.normalizeUiLanguage("fr"), "en");
});