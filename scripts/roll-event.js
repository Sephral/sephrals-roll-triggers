function flattenTerms(terms, collector) {
  for (const term of terms ?? []) {
    collector.push(term);

    if (Array.isArray(term?.terms) && term.terms.length) {
      flattenTerms(term.terms, collector);
    }

    if (Array.isArray(term?.rolls) && term.rolls.length) {
      for (const nestedRoll of term.rolls) flattenTerms(nestedRoll?.terms ?? [], collector);
    }

    if (term?.roll?.terms) {
      flattenTerms(term.roll.terms, collector);
    }
  }
}

function getTermType(term) {
  return term?.constructor?.name ?? "UnknownTerm";
}

function isDiceTerm(term) {
  const diceTermClass = globalThis.foundry?.dice?.terms?.DiceTerm;
  if (diceTermClass && term instanceof diceTermClass) return true;

  return ["DiceTerm", "Die", "Coin", "FateDie"].includes(getTermType(term));
}

function normalizeDieResult(result) {
  return {
    result: Number(result?.result ?? result),
    active: result?.active !== false,
    discarded: Boolean(result?.discarded),
    exploded: Boolean(result?.exploded),
    rerolled: Boolean(result?.rerolled),
    success: result?.success ?? null,
    failure: result?.failure ?? null
  };
}

export function getVisibleDiceResults(term) {
  return (term?.results ?? [])
    .map((result) => normalizeDieResult(result))
    .filter((result) => Number.isFinite(result.result) && result.active && !result.discarded);
}

function normalizeDiceTerm(term, index) {
  const faces = Number(term?.faces ?? term?.options?.faces ?? 0) || null;
  const number = Number(term?.number ?? term?.count ?? 0) || 0;
  const results = getVisibleDiceResults(term);

  return {
    index,
    type: getTermType(term),
    expression: String(term?.expression ?? term?.formula ?? "").trim() || null,
    faces,
    number,
    total: Number(term?.total ?? NaN),
    results,
    minValue: faces ? 1 : null,
    maxValue: faces,
    values: results.map((result) => result.result)
  };
}

// A self roll is whispered to its author only. Core speaker data has no user, the author is the message's
// source field (speaker.user is kept as a fallback for older data).
function normalizeVisibility(message) {
  const whisperCount = Array.isArray(message?.whisper) ? message.whisper.length : 0;
  if (message?.blind) return "blind";
  if (whisperCount === 0) return "public";
  const authorId = message?._source?.author ?? message?.author?.id ?? message?.speaker?.user ?? null;
  if (authorId && whisperCount === 1 && message.whisper[0] === authorId) return "self";
  return "gm-private";
}

function getRollMode(message) {
  return String(message?.rollMode ?? message?.flags?.core?.rollMode ?? game.settings?.get?.("core", "rollMode") ?? "publicroll");
}

function getActorType(actor) {
  if (!actor) return "none";
  const rawType = String(actor.type ?? actor.system?.type ?? "").trim().toLowerCase();
  if (["character", "pc", "player", "hero"].includes(rawType)) return "pc";
  if (["npc", "creature", "monster"].includes(rawType)) return "npc";
  if (rawType === "vehicle") return "vehicle";
  return rawType || "other";
}

function getSpeakerToken(message) {
  const sceneId = message?.speaker?.scene;
  const tokenId = message?.speaker?.token;
  if (!sceneId || !tokenId || !game.scenes) return null;
  return game.scenes.get(sceneId)?.tokens?.get(tokenId) ?? null;
}

function getAssociatedItem(message) {
  const flags = message?.flags ?? {};
  return flags?.dnd5e?.item ?? flags?.pf2e?.item ?? flags?.swade?.item ?? null;
}

// dnd5e names the item of a card only by type, id and uuid. The name comes from the item itself.
function getAssociatedItemName(item, actor) {
  if (!item) return null;
  if (item.name) return String(item.name);
  const owned = item.id ? actor?.items?.get?.(item.id) : null;
  if (owned?.name) return String(owned.name);
  if (!item.uuid || typeof globalThis.fromUuidSync !== "function") return null;
  try {
    return globalThis.fromUuidSync(item.uuid, { strict: false })?.name ?? null;
  } catch {
    return null;
  }
}

const SUCCESS_DEGREES_BY_INDEX = ["critical-failure", "failure", "success", "critical-success"];

// The module compares success degrees in kebab-case ("critical-success"). PF2e stores the outcome camelCase in
// flags.pf2e.context.outcome ("criticalSuccess") and as a number in roll.options.degreeOfSuccess
// (0 critical failure .. 3 critical success). Both forms map to the internal one.
export function normalizeSuccessDegree(value) {
  if (value == null) return null;

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return SUCCESS_DEGREES_BY_INDEX[Number(text)] ?? text;

  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function inferSuccessDegree(message, roll) {
  const flags = message?.flags ?? {};
  return flags?.pf2e?.context?.outcome ?? roll?.options?.degreeOfSuccess ?? null;
}

// dnd5e 5.3.3 roll types without an own filter value, mapped to the closest one. attack, save, skill, damage
// and healing exist as filter values (concentration saves arrive as "save").
const DND5E_ROLL_TYPES = {
  ability: "check",
  tool: "check",
  death: "save",
  hitDie: "healing",
  hitPoints: "utility",
  generic: "utility"
};

function isInitiativeMessage(message) {
  const flags = message?.flags ?? {};
  return Boolean(flags.core?.initiativeRoll ?? flags["core.initiativeRoll"]);
}

// dnd5e 5.x keeps the roll type on the message (flags.dnd5e.roll.type) and copies it into roll.options.rollType
// only for rolls built through its own workflow. The flag goes before roll.options.type, which is the damage type
// ("fire") on a dnd5e DamageRoll. Core initiative rolls carry no type, only the core.initiativeRoll flag.
function inferRollType(message, roll, systemId) {
  const rollType = roll?.options?.rollType ?? message?.flags?.dnd5e?.roll?.type ?? null;
  if (rollType != null) return systemId === "dnd5e" ? DND5E_ROLL_TYPES[rollType] ?? rollType : rollType;
  if (isInitiativeMessage(message)) return "initiative";
  return roll?.options?.type ?? "any";
}

// dnd5e stores the targets of a roll as actor UUIDs (flags.dnd5e.targets), PF2e a single target token or actor
// (flags.pf2e.context.target). Other systems store nothing, then the roller's current targets count. Those are synced
// to every client, so the GM client sees them too. Token targets become token document UUIDs.
export function getRollTargetUuids(message, user) {
  const flags = message?.flags ?? {};
  const uuids = [];
  const add = (uuid) => {
    const text = typeof uuid === "string" ? uuid.trim() : "";
    if (text && !uuids.includes(text)) uuids.push(text);
  };

  for (const target of Array.isArray(flags.dnd5e?.targets) ? flags.dnd5e.targets : []) add(target?.uuid);
  const pf2eTarget = flags.pf2e?.context?.target;
  if (pf2eTarget) add(pf2eTarget.token ?? pf2eTarget.actor);
  if (uuids.length) return uuids;

  for (const token of user?.targets ?? []) add(token?.document?.uuid ?? token?.uuid);
  return uuids;
}

function getMessageUserData(message) {
  // The source field is "author" since v12. Reading "user" logs a deprecation in v13 and is gone in v14,
  // so it is only a fallback for messages that lack the new field.
  const userId = message?._source?.author ?? message?._source?.user ?? message?.speaker?.user ?? game.user?.id ?? null;
  const user = game.users?.get?.(userId) ?? (game.user?.id === userId ? game.user : null) ?? game.user ?? null;

  return { user, userId };
}

// rolls: all rolls of the message as the adapter reads them (Ready Set Roll keeps them outside message.rolls).
export function createRollEvent(message, roll, rollIndex, adapterId, extra = {}, rolls = null) {
  const flattenedTerms = [];
  flattenTerms(roll?.terms ?? [], flattenedTerms);

  const diceTerms = flattenedTerms.filter((term) => isDiceTerm(term)).map((term, index) => normalizeDiceTerm(term, index));
  const diceResults = diceTerms.flatMap((term) => term.values.map((value) => ({ faces: term.faces, value })));
  // getAssociatedActor is a dnd5e helper. Core messages expose the speaker actor (a synthetic actor for unlinked tokens).
  const actor = message?.getAssociatedActor?.() ?? message?.speakerActor ?? null;
  const token = getSpeakerToken(message);
  const item = getAssociatedItem(message);
  const systemId = String(game.system?.id ?? "").trim() || "unknown";
  const systemVersion = String(game.system?.version ?? "").trim() || null;
  const { user, userId } = getMessageUserData(message);

  // extra overrides let the test bench describe a roll that is not a real chat message (visibility, combat, targets).

  return {
    adapterId,
    systemId,
    systemVersion,
    messageId: message?.id ?? null,
    messageUuid: message?.uuid ?? null,
    rollIndex,
    rollType: extra.rollType ?? inferRollType(message, roll, systemId),
    successDegree: normalizeSuccessDegree(extra.successDegree ?? inferSuccessDegree(message, roll)),
    actor,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorType: extra.actorType ?? getActorType(actor),
    token,
    tokenId: token?.id ?? null,
    item,
    itemId: item?.id ?? item?._id ?? null,
    itemName: getAssociatedItemName(item, actor),
    user,
    userId,
    visibility: extra.visibility ?? normalizeVisibility(message),
    rollMode: getRollMode(message),
    isCombat: extra.isCombat ?? Boolean(game.combat?.started),
    // The speaker's scene is where the roll happened. The scene the GM is viewing is only a fallback.
    sceneId: message?.speaker?.scene ?? globalThis.canvas?.scene?.id ?? null,
    formula: String(roll?.formula ?? "").trim(),
    total: Number.isFinite(Number(roll?.total)) ? Number(roll.total) : null,
    diceTerms,
    diceResults,
    targetUuids: Array.isArray(extra.targetUuids) ? [...extra.targetUuids] : getRollTargetUuids(message, user),
    flags: message?.flags ?? {},
    rawMessage: message,
    rawRoll: roll,
    rawRolls: rolls ?? message?.rolls ?? []
  };
}