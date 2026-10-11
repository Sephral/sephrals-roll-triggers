import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("override language is only set for an explicit module language", () => {
  assert.equal(__test__.getModuleOverrideLanguage("default"), null);
  assert.equal(__test__.getModuleOverrideLanguage("fr"), null);
  assert.equal(__test__.getModuleOverrideLanguage("en"), "en");
  assert.equal(__test__.getModuleOverrideLanguage("de"), "de");
});

test("follow Foundry uses game.i18n so community translations win over bundled English", () => {
  const bundledEn = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const bundledDe = JSON.parse(readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));
  const french = {
    "SRT.Manager.Title": "Declencheurs de jets de Sephral",
    "SRT.Notification.TriggerSaved": "Declencheur enregistre : {name}"
  };
  const originalI18n = game.i18n;
  const settingKey = `sephrals-roll-triggers.${__test__.UI_LANGUAGE_SETTING}`;

  __test__.MODULE_TRANSLATION_CACHE.set("en", bundledEn);
  __test__.MODULE_TRANSLATION_CACHE.set("de", bundledDe);
  game.settings.settings.set(settingKey, {});
  game.i18n = {
    lang: "fr",
    localize: (key) => french[key] ?? key,
    format: (key, data) => String(french[key] ?? key).replace(/\{(\w+)\}/g, (_match, field) => String(data?.[field] ?? ""))
  };

  try {
    assert.ok(bundledEn["SRT.Manager.Title"]);
    assert.ok(bundledEn["SRT.Notification.TriggerSaved"]);

    game.settings.values.set(settingKey, "default");
    assert.equal(__test__.localize("Manager.Title"), "Declencheurs de jets de Sephral");
    assert.equal(__test__.format("Notification.TriggerSaved", { name: "Nat 20" }), "Declencheur enregistre : Nat 20");
    assert.equal(__test__.localize("Manager.Summary"), "SRT.Manager.Summary");

    game.settings.values.set(settingKey, "en");
    assert.equal(__test__.localize("Manager.Title"), bundledEn["SRT.Manager.Title"]);
    assert.equal(__test__.format("Notification.TriggerSaved", { name: "Nat 20" }), "Trigger saved: Nat 20");

    game.settings.values.set(settingKey, "de");
    assert.equal(__test__.localize("Manager.Summary"), bundledDe["SRT.Manager.Summary"]);
  } finally {
    game.i18n = originalI18n;
    game.settings.values.set(settingKey, "default");
    __test__.MODULE_TRANSLATION_CACHE.clear();
  }
});