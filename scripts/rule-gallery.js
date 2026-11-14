import { format, localize } from "./settings.js";

// The gallery of ready house rules. This file is the catalog and the pure helpers: which rules fit a game system,
// the plain words of a rule, and the trigger a rule becomes. The window is gallery-window.js.
//
// A rule is stored as data. Its texts (title, "when" and "then" sentences, chat templates) live in the language
// files under SRT.Gallery.Rule.<id>.<Key>. Slots are the few choices a rule needs before it can work: a roll table
// to draw from, or a number such as the threshold of a roll.

export const GALLERY_GROUPS = Object.freeze(["d20", "d100", "any", "dnd5e", "pf2e", "swade", "crucible", "combat"]);

export const GALLERY_SOURCE_PREFIX = "gallery:";

const say = (text, visibility = "public") => ({ type: "chat-message", visibility, textKey: "Text", ...(text ?? {}) });
const note = () => ({ type: "gm-note", textKey: "Text" });
const table = (visibility = "gm") => ({ type: "roll-table", visibility, slot: "table" });
const resource = (path, value = "1") => ({ type: "change-resource", path, operation: "add", value });
const tableSlot = (action) => ({ key: "table", type: "table", labelKey: "Gallery.Slot.Table", action });
const numberSlot = (key, path, labelKey, defaultValue, min = 1, max = 999) => ({ key, type: "number", path, labelKey, default: defaultValue, min, max });

const DND5E_DEATH_SAVE = {
  type: "custom-js",
  expression: "[event.flags?.dnd5e?.roll?.type, event.rawMessage?.system?.type].includes(\"death\")"
};

export const GALLERY_RULES = Object.freeze([
  // Any roll of any game system
  { id: "anyRollLow", group: "any", icon: "fa-arrow-trend-down", mode: "automatic", match: { type: "total-below", threshold: 6 }, actions: [note()], slots: [numberSlot("threshold", "match.threshold", "Gallery.Slot.TotalBelow", 6)] },
  { id: "anyRollHigh", group: "any", icon: "fa-arrow-trend-up", mode: "automatic", match: { type: "total-above", threshold: 30 }, actions: [say()], slots: [numberSlot("threshold", "match.threshold", "Gallery.Slot.TotalAbove", 30)] },
  { id: "anyDoubles", group: "any", icon: "fa-clone", mode: "automatic", match: { type: "all-same" }, actions: [say()] },

  // Natural 20 and natural 1 on a d20, any game system
  { id: "d20Nat20Cheer", group: "d20", icon: "fa-dice-d20", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, actions: [say()] },
  { id: "d20Nat20Table", group: "d20", icon: "fa-table-list", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, actions: [table()], slots: [tableSlot(0)] },
  { id: "d20Nat20Bonus", group: "d20", icon: "fa-dice-d6", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, actions: [{ type: "roll-formula", formula: "1d6", visibility: "public", flavorKey: "Flavor" }] },
  { id: "d20Nat1Groan", group: "d20", icon: "fa-face-grimace", mode: "automatic", match: { type: "die-min", faces: 20, minCount: 1 }, actions: [say()] },
  { id: "d20Nat1Table", group: "d20", icon: "fa-table-list", mode: "automatic", match: { type: "die-min", faces: 20, minCount: 1 }, actions: [table()], slots: [tableSlot(0)] },
  { id: "d20Nat1Note", group: "d20", icon: "fa-user-secret", mode: "automatic", match: { type: "die-min", faces: 20, minCount: 1 }, actions: [note()] },

  // d100 systems
  { id: "d100Critical", group: "d100", icon: "fa-star", mode: "automatic", match: { type: "die-value", faces: 100, value: 1, minCount: 1 }, actions: [say()] },
  { id: "d100Fumble", group: "d100", icon: "fa-skull", mode: "automatic", match: { type: "die-value", faces: 100, value: 100, minCount: 1 }, actions: [note()] },
  {
    id: "d100Doubles", group: "d100", icon: "fa-clone", mode: "automatic",
    match: { type: "custom-js", expression: "Number.isInteger(event.total) && event.total >= 11 && event.total <= 99 && event.total % 11 === 0" },
    filters: { exactDiceCountByFaces: { 100: 1 } }, actions: [say()]
  },
  { id: "d100Low", group: "d100", icon: "fa-arrow-down-1-9", mode: "automatic", match: { type: "die-result-below", faces: 100, threshold: 6 }, actions: [say()], slots: [numberSlot("threshold", "match.threshold", "Gallery.Slot.DieBelow", 6, 2, 100)] },

  // D&D 5e
  { id: "dnd5eCritCheer", group: "dnd5e", systems: ["dnd5e"], icon: "fa-burst", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [say()] },
  { id: "dnd5eCritTable", group: "dnd5e", systems: ["dnd5e"], icon: "fa-table-list", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [table()], slots: [tableSlot(0)] },
  { id: "dnd5eCritInspiration", group: "dnd5e", systems: ["dnd5e"], icon: "fa-sun", mode: "confirm-gm", match: { type: "die-max", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [resource("system.attributes.inspiration"), say()] },
  { id: "dnd5eFumbleTable", group: "dnd5e", systems: ["dnd5e"], icon: "fa-table-list", mode: "automatic", match: { type: "die-min", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [table()], slots: [tableSlot(0)] },
  { id: "dnd5eFumbleProne", group: "dnd5e", systems: ["dnd5e"], icon: "fa-person-falling", mode: "confirm-gm", match: { type: "die-min", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [{ type: "apply-effect", status: "prone", target: "actor" }, say()] },
  { id: "dnd5eFumbleNote", group: "dnd5e", systems: ["dnd5e"], icon: "fa-user-secret", mode: "automatic", match: { type: "die-min", faces: 20, minCount: 1 }, filters: { rollType: ["attack"] }, actions: [note()] },
  { id: "dnd5eDeathSaveFail", group: "dnd5e", systems: ["dnd5e"], icon: "fa-skull-crossbones", mode: "automatic", match: DND5E_DEATH_SAVE, extraMatches: [{ type: "total-below", threshold: 10 }], actions: [note()] },
  { id: "dnd5eDeathSaveNat20", group: "dnd5e", systems: ["dnd5e"], icon: "fa-heart-pulse", mode: "automatic", match: DND5E_DEATH_SAVE, extraMatches: [{ type: "die-max", faces: 20, minCount: 1 }], actions: [say()] },
  { id: "dnd5eMaxDamage", group: "dnd5e", systems: ["dnd5e"], icon: "fa-hammer", mode: "automatic", match: { type: "at-least-n-max", minCount: 2 }, filters: { rollType: ["damage"] }, actions: [say()], slots: [numberSlot("minCount", "match.minCount", "Gallery.Slot.DiceMax", 2, 1, 20)] },
  { id: "dnd5eInitiative20", group: "dnd5e", systems: ["dnd5e"], icon: "fa-bolt", mode: "automatic", match: { type: "die-max", faces: 20, minCount: 1 }, filters: { rollType: ["initiative"] }, actions: [say()] },

  // Pathfinder 2e
  { id: "pf2eCritCheer", group: "pf2e", systems: ["pf2e"], icon: "fa-burst", mode: "automatic", match: { type: "success-degree", degree: "critical-success" }, actions: [say()] },
  { id: "pf2eCritFailureNote", group: "pf2e", systems: ["pf2e"], icon: "fa-user-secret", mode: "automatic", match: { type: "success-degree", degree: "critical-failure" }, actions: [note()] },
  { id: "pf2eCritFailureTable", group: "pf2e", systems: ["pf2e"], icon: "fa-table-list", mode: "automatic", match: { type: "success-degree", degree: "critical-failure" }, actions: [table()], slots: [tableSlot(0)] },
  { id: "pf2eNat20HeroPoint", group: "pf2e", systems: ["pf2e"], icon: "fa-star", mode: "confirm-gm", match: { type: "die-max", faces: 20, minCount: 1 }, actions: [resource("system.resources.heroPoints.value"), say()] },

  // Savage Worlds
  { id: "swadeSnakeEyes", group: "swade", systems: ["swade"], icon: "fa-dice-one", mode: "automatic", match: { type: "at-least-n-value", value: 1, minCount: 2 }, actions: [note()] },
  { id: "swadeAce", group: "swade", systems: ["swade"], icon: "fa-bolt", mode: "automatic", match: { type: "die-max", minCount: 1 }, actions: [say()] },
  { id: "swadeAceBenny", group: "swade", systems: ["swade"], icon: "fa-coins", mode: "confirm-gm", match: { type: "die-max", minCount: 1 }, actions: [resource("system.bennies.value"), say()] },

  // Crucible
  { id: "crucibleTriple", group: "crucible", systems: ["crucible"], icon: "fa-dice", mode: "automatic", match: { type: "at-least-n-same", minCount: 3 }, actions: [say()] },
  { id: "crucibleTripleOnes", group: "crucible", systems: ["crucible"], icon: "fa-user-secret", mode: "automatic", match: { type: "at-least-n-value", value: 1, minCount: 3 }, actions: [note()] },
  { id: "crucibleHeroism", group: "crucible", systems: ["crucible"], icon: "fa-crown", mode: "confirm-gm", match: { type: "at-least-n-same", minCount: 3 }, actions: [resource("system.resources.heroism.value"), say()] },

  // Combat events
  { id: "combatTurnAnnounce", group: "combat", kind: "combat", icon: "fa-bullhorn", mode: "automatic", combat: { event: "turn-start" }, actions: [say()] },
  { id: "combatNpcTurnNote", group: "combat", kind: "combat", icon: "fa-user-secret", mode: "automatic", combat: { event: "turn-start" }, filters: { actorType: ["npc"] }, actions: [note()] },
  { id: "combatRoundAnnounce", group: "combat", kind: "combat", icon: "fa-rotate", mode: "automatic", combat: { event: "round-start" }, actions: [say()] },
  { id: "combatEveryThird", group: "combat", kind: "combat", icon: "fa-hourglass-half", mode: "automatic", combat: { event: "round-start", every: 3 }, actions: [note()], slots: [numberSlot("every", "combat.every", "Gallery.Slot.Every", 3, 2, 20)] },
  { id: "combatRoundTable", group: "combat", kind: "combat", icon: "fa-table-list", mode: "automatic", combat: { event: "round-start", round: 5 }, actions: [table()], slots: [numberSlot("round", "combat.round", "Gallery.Slot.Round", 5, 1, 99), tableSlot(0)] },
  { id: "combatStartCall", group: "combat", kind: "combat", icon: "fa-shield-halved", mode: "automatic", combat: { event: "combat-start" }, actions: [say()] },
  { id: "combatEndNote", group: "combat", kind: "combat", icon: "fa-flag-checkered", mode: "automatic", combat: { event: "combat-end" }, actions: [note()] },
  { id: "combatEffectEnds", group: "combat", kind: "combat", icon: "fa-hourglass-end", mode: "automatic", combat: { event: "effect-end" }, actions: [say()] }
]);

export function getRule(id) {
  return GALLERY_RULES.find((rule) => rule.id === id) ?? null;
}

export function isCombatRule(rule) {
  return rule?.kind === "combat";
}

// Whether a rule fits the game system of the world. Rules without a system list fit every world.
export function fitsSystem(rule, systemId) {
  return !rule.systems || rule.systems.includes(String(systemId ?? ""));
}

function textKey(rule, key) {
  return `Gallery.Rule.${rule.id}.${key}`;
}

export function getRuleTitle(rule) {
  return localize(textKey(rule, "Title"));
}

// The "when" and "then" sentences, with the slot values put in. Missing values use the slot default.
export function getRuleWords(rule, values = {}, translate = { localize, format }) {
  const data = {};
  for (const slot of rule.slots ?? []) {
    if (slot.type === "number") data[slot.key] = resolveNumber(slot, values[slot.key]);
  }
  const when = translate.format(textKey(rule, "When"), data);
  const then = translate.format(textKey(rule, "Then"), data);
  return { when, then };
}

export function resolveNumber(slot, value) {
  const number = Number(value);
  if (value === "" || value == null || !Number.isFinite(number)) return slot.default;
  return Math.min(Math.max(Math.round(number), slot.min ?? 1), slot.max ?? 999);
}

// Which slots still need a choice before the rule can be added.
export function getMissingSlots(rule, values = {}) {
  return (rule.slots ?? []).filter((slot) => slot.type === "table" && !String(values[slot.key] ?? "").trim());
}

function setPath(target, path, value) {
  const keys = path.split(".");
  let current = target;
  for (const key of keys.slice(0, -1)) {
    current[key] = current[key] && typeof current[key] === "object" ? current[key] : {};
    current = current[key];
  }
  current[keys.at(-1)] = value;
}

// The trigger a rule becomes: the rule's data, the localized texts and the chosen slot values. The result goes through
// normalizeTrigger before it is stored, like every other trigger.
export function buildRuleTrigger(rule, values = {}, { id, translate = { localize, format } } = {}) {
  const trigger = {
    id: id ?? `${GALLERY_SOURCE_PREFIX.replace(":", "-")}${rule.id}`,
    name: translate.localize(textKey(rule, "Title")),
    description: (() => {
      const words = getRuleWords(rule, values, translate);
      return `${words.when} ${words.then}`;
    })(),
    category: "gallery",
    enabled: true,
    priority: 100,
    executionMode: rule.mode ?? "automatic",
    filters: JSON.parse(JSON.stringify(rule.filters ?? {})),
    extraMatches: JSON.parse(JSON.stringify(rule.extraMatches ?? [])),
    source: `${GALLERY_SOURCE_PREFIX}${rule.id}`
  };
  if (isCombatRule(rule)) {
    trigger.kind = "combat";
    trigger.combat = JSON.parse(JSON.stringify(rule.combat ?? {}));
  } else {
    trigger.match = JSON.parse(JSON.stringify(rule.match ?? {}));
  }

  trigger.actions = (rule.actions ?? []).map((definition) => {
    const { textKey: templateKey, flavorKey, slot, ...action } = JSON.parse(JSON.stringify(definition));
    if (templateKey) action.template = translate.localize(textKey(rule, templateKey));
    if (flavorKey) action.flavor = translate.localize(textKey(rule, flavorKey));
    if (slot) {
      const reference = String(values[slot] ?? "").trim();
      if (reference) action.tables = [reference];
    }
    return action;
  });

  for (const slot of rule.slots ?? []) {
    if (slot.type === "number") setPath(trigger, slot.path, resolveNumber(slot, values[slot.key]));
  }
  return trigger;
}

// Rule ids already added to the world (the trigger source remembers where a trigger came from).
export function getAddedRuleIds(triggers) {
  const ids = new Set();
  for (const trigger of triggers ?? []) {
    const source = String(trigger?.source ?? "");
    if (source.startsWith(GALLERY_SOURCE_PREFIX)) ids.add(source.slice(GALLERY_SOURCE_PREFIX.length));
  }
  return ids;
}

// The rules to show, grouped in catalog order. showAll lists the rules of other game systems too. The search looks
// into the title and the plain words.
export function getVisibleGroups({ systemId, showAll = false, search = "" } = {}, translate = { localize, format }) {
  const needle = String(search ?? "").trim().toLowerCase();
  const groups = [];
  for (const group of GALLERY_GROUPS) {
    const rules = GALLERY_RULES.filter((rule) => rule.group === group)
      .filter((rule) => showAll || fitsSystem(rule, systemId))
      .filter((rule) => {
        if (!needle) return true;
        const words = getRuleWords(rule, {}, translate);
        return [translate.localize(textKey(rule, "Title")), words.when, words.then].some((text) => String(text).toLowerCase().includes(needle));
      });
    if (rules.length) groups.push({ id: group, rules });
  }
  return groups;
}

export const __test__ = { setPath, textKey };
