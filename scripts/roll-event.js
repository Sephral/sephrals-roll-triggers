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

function normalizeVisibility(message) {
  const whisperCount = Array.isArray(message?.whisper) ? message.whisper.length : 0;
  if (message?.blind) return "blind";
  if (whisperCount === 0) return "public";
  if (message?.speaker?.user && whisperCount === 1 && message.whisper[0] === message.speaker.user) return "self";
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

function inferSuccessDegree(message, roll) {
  const flags = message?.flags ?? {};
  return flags?.pf2e?.context?.outcome ?? roll?.options?.degreeOfSuccess ?? null;
}

function getMessageUserData(message) {
  const userId = message?._source?.user ?? message?.speaker?.user ?? game.user?.id ?? null;
  const user = game.users?.get?.(userId) ?? (game.user?.id === userId ? game.user : null) ?? game.user ?? null;

  return { user, userId };
}

export function createRollEvent(message, roll, rollIndex, adapterId, extra = {}) {
  const flattenedTerms = [];
  flattenTerms(roll?.terms ?? [], flattenedTerms);

  const diceTerms = flattenedTerms.filter((term) => isDiceTerm(term)).map((term, index) => normalizeDiceTerm(term, index));
  const diceResults = diceTerms.flatMap((term) => term.values.map((value) => ({ faces: term.faces, value })));
  const actor = message?.getAssociatedActor?.() ?? null;
  const token = getSpeakerToken(message);
  const item = getAssociatedItem(message);
  const systemId = String(game.system?.id ?? "").trim() || "unknown";
  const systemVersion = String(game.system?.version ?? "").trim() || null;
  const { user, userId } = getMessageUserData(message);

  return {
    adapterId,
    systemId,
    systemVersion,
    messageId: message?.id ?? null,
    messageUuid: message?.uuid ?? null,
    rollIndex,
    rollType: extra.rollType ?? roll?.options?.rollType ?? roll?.options?.type ?? "any",
    successDegree: extra.successDegree ?? inferSuccessDegree(message, roll),
    actor,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorType: extra.actorType ?? getActorType(actor),
    token,
    tokenId: token?.id ?? null,
    item,
    itemId: item?.id ?? item?._id ?? null,
    itemName: item?.name ?? null,
    user,
    userId,
    visibility: normalizeVisibility(message),
    rollMode: getRollMode(message),
    isCombat: Boolean(game.combat?.started),
    sceneId: globalThis.canvas?.scene?.id ?? message?.speaker?.scene ?? null,
    formula: String(roll?.formula ?? "").trim(),
    total: Number.isFinite(Number(roll?.total)) ? Number(roll.total) : null,
    diceTerms,
    diceResults,
    flags: message?.flags ?? {},
    rawMessage: message,
    rawRoll: roll,
    rawRolls: message?.rolls ?? []
  };
}