import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const de = JSON.parse(readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));

// The fake game reads the English texts, so the words of a rule are the real ones
globalThis.game = {
  i18n: {
    localize: (key) => en[key] ?? key,
    format: (key, data) => String(en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in (data ?? {}) ? String(data[name]) : match)),
    has: (key) => key in en,
    lang: "en"
  },
  user: { isGM: true },
  tables: [{ id: "table-1", name: "Crit Table" }]
};
globalThis.foundry = { utils: { randomID: () => "generated-id", escapeHTML: (value) => String(value) } };
globalThis.CONFIG = { statusEffects: [{ id: "prone", name: "Prone" }] };
globalThis.Roll = { validate: (formula) => /^\d*d\d+$/.test(formula) };

const gallery = await import("../scripts/rule-gallery.js");
const data = await import("../scripts/trigger-data.js");
const { collectMatches } = await import("../scripts/triggers.js");
const { matchCombatTrigger } = await import("../scripts/combat-events.js");

const slotValues = (rule) => Object.fromEntries((rule.slots ?? []).filter((slot) => slot.type === "table").map((slot) => [slot.key, "table-1"]));
const build = (rule, values = slotValues(rule)) => data.normalizeTrigger(gallery.buildRuleTrigger(rule, values));
const rule = (id) => gallery.getRule(id);

test("the catalog has unique ids, known groups and a fitting kind", () => {
  const ids = gallery.GALLERY_RULES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of gallery.GALLERY_RULES) {
    assert.ok(gallery.GALLERY_GROUPS.includes(entry.group), entry.id);
    assert.ok(["automatic", "confirm-gm"].includes(entry.mode), entry.id);
    assert.equal(Boolean(entry.combat), entry.kind === "combat", entry.id);
  }
  assert.ok(gallery.GALLERY_RULES.length >= 35);
  // the groups the task asks for: dnd5e, PF2e, SWADE, Crucible, generic d20, d100
  for (const group of ["dnd5e", "pf2e", "swade", "crucible", "d20", "d100", "combat"]) assert.ok(gallery.GALLERY_RULES.some((entry) => entry.group === group), group);
});

test("every rule becomes a valid trigger with actions, a known match and a source", () => {
  for (const entry of gallery.GALLERY_RULES) {
    const trigger = build(entry);
    assert.ok(trigger.actions.length >= 1, `${entry.id} has actions`);
    assert.equal(trigger.source, `gallery:${entry.id}`);
    assert.equal(trigger.name, en[`SRT.Gallery.Rule.${entry.id}.Title`]);
    assert.equal(trigger.enabled, true);
    assert.equal(trigger.executionMode, entry.mode);
    if (entry.kind === "combat") {
      assert.equal(trigger.kind, "combat");
      assert.equal(trigger.combat.event, entry.combat.event);
    } else {
      assert.ok(data.MATCH_TYPE_CHOICES[trigger.match.type], `${entry.id} match ${trigger.match.type}`);
      for (const extra of trigger.extraMatches) assert.ok(data.MATCH_TYPE_CHOICES[extra.type], entry.id);
    }
    for (const action of trigger.actions) {
      if (action.type === "chat-message" || action.type === "gm-note") assert.ok(action.template.length > 5 && !action.template.startsWith("SRT."), entry.id);
      if (action.type === "roll-table") assert.deepEqual(action.tables, ["table-1"]);
    }
  }
});

test("every text exists in English and German and follows the public text rules", () => {
  const needed = [];
  for (const group of gallery.GALLERY_GROUPS) needed.push(`SRT.Gallery.Group.${group}`);
  for (const entry of gallery.GALLERY_RULES) {
    needed.push(`SRT.Gallery.Rule.${entry.id}.Title`, `SRT.Gallery.Rule.${entry.id}.When`, `SRT.Gallery.Rule.${entry.id}.Then`);
    for (const action of entry.actions) {
      if (action.textKey) needed.push(`SRT.Gallery.Rule.${entry.id}.${action.textKey}`);
      if (action.flavorKey) needed.push(`SRT.Gallery.Rule.${entry.id}.${action.flavorKey}`);
    }
    for (const slot of entry.slots ?? []) needed.push(`SRT.${slot.labelKey}`);
  }
  for (const key of needed) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(de[key], `de ${key}`);
  }
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());

  const otherModules = /Better Rolltables|Midi|Dice So Nice|Pin Cushion|Quick Encounters|Token Variant|Item Piles|LMRTFY|Tidy|Monk/i;
  for (const [key, value] of [...Object.entries(en), ...Object.entries(de)]) {
    assert.ok(!/;/.test(value), `semicolon in ${key}`);
    assert.ok(!/ - /.test(value) && !/[–—]/.test(value), `dash in ${key}`);
    assert.ok(!otherModules.test(value), `other module named in ${key}`);
  }
  // placeholders in a template are the ones the actions know
  for (const [key, value] of Object.entries(en)) {
    if (!key.startsWith("SRT.Gallery.Rule.")) continue;
    for (const [, token] of String(value).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      assert.ok(/^(actor\.name|roll\.(total|formula|results)|combat\.round|effect\.name)$/.test(token), `${key} uses ${token}`);
    }
  }
});

test("the rules a world sees follow its game system, others can be shown on request", () => {
  const ids = (options) => gallery.getVisibleGroups(options).flatMap((group) => group.rules.map((entry) => entry.id));
  const dnd = ids({ systemId: "dnd5e" });
  assert.ok(dnd.includes("dnd5eCritTable") && dnd.includes("d20Nat20Cheer") && dnd.includes("d100Doubles") && dnd.includes("combatTurnAnnounce"));
  assert.ok(!dnd.includes("pf2eCritCheer") && !dnd.includes("swadeAce") && !dnd.includes("crucibleTriple"));
  assert.ok(ids({ systemId: "pf2e" }).includes("pf2eNat20HeroPoint"));
  assert.ok(!ids({ systemId: "pf2e" }).includes("dnd5eCritCheer"));
  assert.ok(ids({ systemId: "swade" }).includes("swadeSnakeEyes"));
  assert.ok(ids({ systemId: "crucible" }).includes("crucibleHeroism"));
  const other = ids({ systemId: "coc7" });
  assert.ok(other.includes("d100Critical") && other.includes("anyRollLow") && !other.some((id) => id.startsWith("dnd5e")));
  assert.equal(ids({ systemId: "coc7", showAll: true }).length, gallery.GALLERY_RULES.length);
  assert.deepEqual(gallery.getVisibleGroups({ systemId: "dnd5e" }).map((group) => group.id).slice(0, 2), ["d20", "d100"]);
});

test("the search looks into the title and the plain words", () => {
  const ids = (search) => gallery.getVisibleGroups({ systemId: "dnd5e", search }).flatMap((group) => group.rules.map((entry) => entry.id));
  assert.ok(ids("inspiration").includes("dnd5eCritInspiration"));
  assert.ok(ids("DEATH").includes("dnd5eDeathSaveFail"));
  assert.deepEqual(ids("zzzz nothing"), []);
});

test("the plain words follow the numbers of a rule", () => {
  const low = rule("anyRollLow");
  assert.equal(gallery.getRuleWords(low).when, "A roll totals less than 6.");
  assert.equal(gallery.getRuleWords(low, { threshold: "12" }).when, "A roll totals less than 12.");
  assert.equal(gallery.getRuleWords(low, { threshold: "" }).when, "A roll totals less than 6.");
  assert.equal(gallery.getRuleWords(low, { threshold: "-4" }).when, "A roll totals less than 1.");
  assert.equal(gallery.resolveNumber(rule("combatEveryThird").slots[0], 99), 20);
  assert.equal(gallery.getRuleWords(rule("combatRoundTable"), { round: 7 }).when, "Round 7 starts.");
});

test("a rule that needs a table is not ready until one is chosen", () => {
  const table = rule("d20Nat20Table");
  assert.deepEqual(gallery.getMissingSlots(table, {}).map((slot) => slot.key), ["table"]);
  assert.deepEqual(gallery.getMissingSlots(table, { table: "  " }).map((slot) => slot.key), ["table"]);
  assert.deepEqual(gallery.getMissingSlots(table, { table: "table-1" }), []);
  assert.deepEqual(gallery.getMissingSlots(rule("d20Nat20Cheer"), {}), []);
});

test("slot values land in the trigger: the table, the threshold, the round", () => {
  assert.deepEqual(build(rule("d20Nat20Table")).actions[0].tables, ["table-1"]);
  assert.equal(gallery.buildRuleTrigger(rule("anyRollLow"), { threshold: 9 }).match.threshold, 9);
  assert.equal(data.normalizeTrigger(gallery.buildRuleTrigger(rule("anyRollLow"), { threshold: 9 })).match.threshold, 9);
  assert.equal(gallery.buildRuleTrigger(rule("dnd5eMaxDamage"), { minCount: 3 }).match.minCount, 3);
  const round = gallery.buildRuleTrigger(rule("combatRoundTable"), { round: 4, table: "table-1" });
  assert.equal(round.combat.round, 4);
  assert.equal(round.actions[0].tables[0], "table-1");
  assert.equal(gallery.buildRuleTrigger(rule("combatEveryThird"), {}).combat.every, 3);
});

test("added rules are remembered through the trigger source", () => {
  const added = gallery.getAddedRuleIds([{ source: "gallery:d20Nat20Cheer" }, { source: "user" }, { source: "gallery:anyDoubles" }, {}]);
  assert.deepEqual([...added].sort(), ["anyDoubles", "d20Nat20Cheer"]);
  assert.equal(gallery.buildRuleTrigger(rule("d20Nat20Cheer")).source, "gallery:d20Nat20Cheer");
});

// ---- The rules do what their words say ---------------------------------------------------------------------------

const roll = (dice, extra = {}) => ({
  diceResults: dice.map(([faces, value]) => ({ faces, value })),
  total: extra.total ?? dice.reduce((sum, [, value]) => sum + value, 0),
  rollType: "any",
  visibility: "public",
  actorType: "pc",
  isCombat: false,
  user: { isGM: false },
  flags: {},
  ...extra
});

const fires = (id, event) => collectMatches([build(rule(id))], event).length === 1;

test("d20 and d100 rules match the dice they describe", () => {
  assert.ok(fires("d20Nat20Cheer", roll([[20, 20]])));
  assert.ok(!fires("d20Nat20Cheer", roll([[20, 19]])));
  assert.ok(fires("d20Nat1Table", roll([[20, 1]])));
  assert.ok(!fires("d20Nat1Table", roll([[20, 20]])));
  assert.ok(fires("d100Critical", roll([[100, 1]])));
  assert.ok(fires("d100Fumble", roll([[100, 100]])));
  assert.ok(fires("d100Doubles", roll([[100, 44]], { rollType: "skill" })));
  assert.ok(!fires("d100Doubles", roll([[100, 45]], { rollType: "skill" })));
  assert.ok(!fires("d100Doubles", roll([[100, 11], [100, 22]], { total: 33 })));
  assert.ok(fires("d100Low", roll([[100, 5]])));
  assert.ok(!fires("d100Low", roll([[100, 6]])));
  assert.ok(fires("anyRollLow", roll([[20, 3]])));
  assert.ok(!fires("anyRollLow", roll([[20, 6]])));
  assert.ok(fires("anyRollHigh", roll([[20, 20]], { total: 31 })));
  assert.ok(fires("anyDoubles", roll([[6, 4], [6, 4]])));
  assert.ok(!fires("anyDoubles", roll([[6, 4]])));
});

test("dnd5e rules separate attacks, damage, initiative and death saves", () => {
  assert.ok(fires("dnd5eCritCheer", roll([[20, 20]], { rollType: "attack" })));
  assert.ok(!fires("dnd5eCritCheer", roll([[20, 20]], { rollType: "check" })));
  assert.ok(fires("dnd5eFumbleProne", roll([[20, 1]], { rollType: "attack" })));
  assert.ok(fires("dnd5eInitiative20", roll([[20, 20]], { rollType: "initiative" })));
  assert.ok(fires("dnd5eMaxDamage", roll([[8, 8], [8, 8]], { rollType: "damage" })));
  assert.ok(!fires("dnd5eMaxDamage", roll([[8, 8], [8, 3]], { rollType: "damage" })));
  assert.ok(!fires("dnd5eMaxDamage", roll([[8, 8], [8, 8]], { rollType: "attack" })));

  // death saves: dnd5e 5 flags the roll type on the message flags, dnd5e 6 on the message system data
  const fiveFail = roll([[20, 4]], { rollType: "save", flags: { dnd5e: { roll: { type: "death" } } } });
  const sixFail = roll([[20, 4]], { rollType: "save", rawMessage: { system: { type: "death" } } });
  const plainSave = roll([[20, 4]], { rollType: "save", flags: { dnd5e: { roll: { type: "save" } } } });
  const passed = roll([[20, 12]], { rollType: "save", flags: { dnd5e: { roll: { type: "death" } } } });
  assert.ok(fires("dnd5eDeathSaveFail", fiveFail));
  assert.ok(fires("dnd5eDeathSaveFail", sixFail));
  assert.ok(!fires("dnd5eDeathSaveFail", plainSave));
  assert.ok(!fires("dnd5eDeathSaveFail", passed));
  assert.ok(fires("dnd5eDeathSaveNat20", roll([[20, 20]], { rollType: "save", flags: { dnd5e: { roll: { type: "death" } } } })));
  assert.ok(!fires("dnd5eDeathSaveNat20", roll([[20, 20]], { rollType: "save" })));
});

test("pf2e, swade and crucible rules match their roll data", () => {
  assert.ok(fires("pf2eCritCheer", roll([[20, 17]], { successDegree: "critical-success" })));
  assert.ok(fires("pf2eCritFailureNote", roll([[20, 3]], { successDegree: "critical-failure" })));
  assert.ok(!fires("pf2eCritFailureNote", roll([[20, 3]], { successDegree: "failure" })));
  assert.ok(fires("pf2eNat20HeroPoint", roll([[20, 20]])));
  assert.ok(fires("swadeSnakeEyes", roll([[6, 1], [8, 1]])));
  assert.ok(!fires("swadeSnakeEyes", roll([[6, 1], [8, 2]])));
  assert.ok(fires("swadeAce", roll([[6, 6], [8, 2]])));
  assert.ok(fires("crucibleTriple", roll([[8, 5], [8, 5], [8, 5]])));
  assert.ok(!fires("crucibleTriple", roll([[8, 5], [8, 5], [8, 6]])));
  assert.ok(fires("crucibleTripleOnes", roll([[8, 1], [8, 1], [8, 1]])));
});

test("resource rules change the right paths and ask the GM first", () => {
  const resource = (id) => build(rule(id)).actions.find((action) => action.type === "change-resource");
  assert.equal(resource("dnd5eCritInspiration").path, "system.attributes.inspiration");
  assert.equal(resource("pf2eNat20HeroPoint").path, "system.resources.heroPoints.value");
  assert.equal(resource("swadeAceBenny").path, "system.bennies.value");
  assert.equal(resource("crucibleHeroism").path, "system.resources.heroism.value");
  for (const id of ["dnd5eCritInspiration", "pf2eNat20HeroPoint", "swadeAceBenny", "crucibleHeroism", "dnd5eFumbleProne"]) assert.equal(build(rule(id)).executionMode, "confirm-gm", id);
  assert.equal(build(rule("dnd5eFumbleProne")).actions[0].status, "prone");
});

test("combat rules match their events", () => {
  const event = (overrides) => ({ combatEvent: "turn-start", round: 1, actorType: "npc", visibility: "public", isCombat: true, ...overrides });
  const match = (id, overrides) => Boolean(matchCombatTrigger(build(rule(id)), event(overrides)));
  assert.ok(match("combatTurnAnnounce", {}));
  assert.ok(match("combatNpcTurnNote", {}));
  assert.ok(!match("combatNpcTurnNote", { actorType: "pc" }));
  assert.ok(match("combatRoundAnnounce", { combatEvent: "round-start" }));
  assert.ok(match("combatEveryThird", { combatEvent: "round-start", round: 6 }));
  assert.ok(!match("combatEveryThird", { combatEvent: "round-start", round: 4 }));
  assert.ok(match("combatRoundTable", { combatEvent: "round-start", round: 5 }));
  assert.ok(!match("combatRoundTable", { combatEvent: "round-start", round: 6 }));
  assert.ok(match("combatStartCall", { combatEvent: "combat-start" }));
  assert.ok(match("combatEndNote", { combatEvent: "combat-end" }));
  assert.ok(match("combatEffectEnds", { combatEvent: "effect-end", effectName: "Bless" }));
});
