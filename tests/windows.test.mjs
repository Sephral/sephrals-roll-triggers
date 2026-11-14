import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

const settings = new Map([
  ["sephrals-roll-triggers.triggers", []],
  ["sephrals-roll-triggers.profiles", [{ id: "p1", name: "Profile", source: "internal-preset", triggers: [] }]],
  ["sephrals-roll-triggers.showInternalPresets", true],
  ["sephrals-roll-triggers.enableImportExport", true]
]);
const notices = [];

globalThis.game = {
  i18n: { localize: (key) => en[key] ?? key, format: (key, data) => String(en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in (data ?? {}) ? String(data[name]) : match)), has: (key) => key in en, lang: "en" },
  settings: {
    settings: new Map([...settings.keys()].map((key) => [key, {}])),
    get: (module, key) => settings.get(`${module}.${key}`),
    set: async (module, key, value) => { settings.set(`${module}.${key}`, value); }
  },
  system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "5.3.3" },
  world: { id: "w", title: "World" },
  user: { isGM: true },
  tables: [{ id: "table-1", name: "Crit Table" }, { id: "table-2", name: "Fumble Table" }],
  scenes: [], actors: [], items: [], macros: [], journal: []
};
globalThis.ui = { notifications: { info: (text) => notices.push(["info", text]), warn: (text) => notices.push(["warn", text]), error: (text) => notices.push(["error", text]) } };
globalThis.foundry = { utils: { randomID: () => "abc123", escapeHTML: (value) => String(value) } };

const galleryWindow = await import("../scripts/gallery-window.js");
const managerModule = await import("../scripts/trigger-manager.js");
const data = await import("../scripts/trigger-data.js");

test.beforeEach(() => {
  settings.set("sephrals-roll-triggers.triggers", []);
  notices.length = 0;
});

test("the gallery shows the rules of the world's system with plain words, slots and added marks", async () => {
  const context = galleryWindow.buildGalleryContext({});
  const ids = context.groups.flatMap((group) => group.rules.map((rule) => rule.id));
  assert.ok(ids.includes("dnd5eCritTable") && !ids.includes("pf2eCritCheer"));
  assert.equal(context.systemNote, "Shown for this world: Dungeons & Dragons Fifth Edition");
  assert.equal(context.groups[0].label, "Natural 20 and natural 1");

  const table = context.groups.flatMap((group) => group.rules).find((rule) => rule.id === "dnd5eCritTable");
  assert.equal(table.title, "Critical hit table");
  assert.match(table.when, /natural 20/i);
  assert.equal(table.slots[0].isTable, true);
  assert.deepEqual(Object.keys(table.slots[0].choices), ["", "table-1", "table-2"]);
  assert.equal(table.modeLabel, "Automatic");
  assert.equal(table.added, false);

  const low = context.groups.flatMap((group) => group.rules).find((rule) => rule.id === "anyRollLow");
  assert.equal(low.slots[0].value, 6);
  assert.equal(galleryWindow.buildGalleryContext({ values: { anyRollLow: { threshold: 9 } } }).groups.flatMap((group) => group.rules).find((rule) => rule.id === "anyRollLow").when, "A roll totals less than 9.");

  const asking = context.groups.flatMap((group) => group.rules).find((rule) => rule.id === "dnd5eCritInspiration");
  assert.equal(asking.modeLabel, "Ask GM");

  assert.ok(galleryWindow.buildGalleryContext({ showAll: true }).groups.flatMap((group) => group.rules).some((rule) => rule.id === "pf2eCritCheer"));
  assert.equal(galleryWindow.buildGalleryContext({}).groups.flatMap((group) => group.rules).find((rule) => rule.id === "combatEffectEnds").isCombat, true);
});

test("adding a rule stores one trigger, remembers where it came from and asks for a missing table", async () => {
  assert.equal(await galleryWindow.addRuleToWorld("d20Nat20Table", {}), null);
  assert.deepEqual(notices, [["warn", "This rule needs a roll table. Choose one on the card first."]]);
  assert.deepEqual(settings.get("sephrals-roll-triggers.triggers"), []);

  const saved = await galleryWindow.addRuleToWorld("d20Nat20Table", { table: "table-2" });
  const stored = settings.get("sephrals-roll-triggers.triggers");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, saved.id);
  assert.equal(saved.id, "gallery-d20Nat20Table-abc123");
  assert.equal(saved.name, "Natural 20 rolls a table");
  assert.deepEqual(saved.actions[0].tables, ["table-2"]);
  assert.equal(saved.source, "gallery:d20Nat20Table");
  assert.match(saved.description, /A d20 shows 20\./);
  assert.deepEqual(notices.at(-1), ["info", 'Rule "Natural 20 rolls a table" added.']);
  assert.equal(galleryWindow.buildGalleryContext({}).groups.flatMap((group) => group.rules).find((rule) => rule.id === "d20Nat20Table").added, true);

  assert.equal(await galleryWindow.addRuleToWorld("not-a-rule", {}), null);
  const combat = await galleryWindow.addRuleToWorld("combatRoundAnnounce", {});
  assert.equal(combat.kind, "combat");
  assert.equal(settings.get("sephrals-roll-triggers.triggers").length, 2);
});

test("the manager shows roll and combat triggers, sorted by priority, with their kind", () => {
  settings.set("sephrals-roll-triggers.triggers", [
    data.normalizeTrigger({ id: "a", name: "Low", priority: 10, match: { type: "die-max", faces: 20 } }),
    data.normalizeTrigger({ id: "b", name: "Combat", priority: 500, kind: "combat", combat: { event: "turn-start" } })
  ]);
  const context = managerModule.__test__.buildManagerContext();
  assert.deepEqual(context.triggers.map((trigger) => trigger.id), ["b", "a"]);
  assert.equal(context.triggers[0].isCombat, true);
  assert.equal(context.triggers[0].kindLabel, "Combat");
  assert.equal(context.triggers[1].kindLabel, "Roll");
  assert.equal(context.triggerCount, 2);
  assert.equal(context.hasProfiles, true);
  assert.equal(context.worldTitle, "World");
});

test("hidden internal profiles stay hidden, the module keeps one oncePerMessage field on export", () => {
  settings.set("sephrals-roll-triggers.showInternalPresets", false);
  assert.equal(managerModule.__test__.buildManagerContext().hasProfiles, false);
  settings.set("sephrals-roll-triggers.showInternalPresets", true);

  settings.set("sephrals-roll-triggers.triggers", [{ id: "old", name: "Old", allowMultipleMatches: true, match: { type: "die-max", faces: 20 } }]);
  const exported = managerModule.__test__.buildTriggerExportPayload();
  assert.equal(exported.triggers[0].oncePerMessage, false);
  assert.equal("allowMultipleMatches" in exported.triggers[0], false);
});
