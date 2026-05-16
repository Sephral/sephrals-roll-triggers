function normalizeArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function getDiceByFaces(event, faces) {
  if (!Number.isFinite(Number(faces))) return event.diceResults ?? [];
  return (event.diceResults ?? []).filter((entry) => Number(entry.faces) === Number(faces));
}

function countByValue(entries, value) {
  return entries.filter((entry) => Number(entry.value) === Number(value)).length;
}

function countMin(entries) {
  return entries.filter((entry) => Number(entry.faces) > 0 && Number(entry.value) === 1).length;
}

function countMax(entries) {
  return entries.filter((entry) => Number(entry.faces) > 0 && Number(entry.value) === Number(entry.faces)).length;
}

function hasSpecificUser(event, allowedUsers) {
  if (!allowedUsers?.length) return true;
  return allowedUsers.includes(event.userId);
}

function matchActorType(event, actorTypes) {
  if (!actorTypes?.length) return true;
  return actorTypes.includes(event.actorType) || actorTypes.includes("any");
}

function matchRollType(event, rollTypes) {
  if (!rollTypes?.length) return true;
  return rollTypes.includes(event.rollType) || rollTypes.includes("any");
}

function matchVisibility(event, visibility) {
  if (!visibility?.length) return true;
  return visibility.includes(event.visibility) || visibility.includes("any");
}

function matchCombatState(event, combatState) {
  if (!combatState || combatState === "any") return true;
  if (combatState === "in-combat") return event.isCombat;
  if (combatState === "out-of-combat") return !event.isCombat;
  return true;
}

function matchScene(event, filters) {
  const included = normalizeArray(filters.includeScenes);
  if (included.length && !included.includes(event.sceneId)) return false;
  return true;
}

function matchActor(event, filters) {
  const included = normalizeArray(filters.includeActors);
  if (included.length && !included.includes(event.actorId)) return false;
  return true;
}

function matchItem(event, filters) {
  const included = normalizeArray(filters.includeItems);
  if (included.length && !included.includes(event.itemId)) return false;
  return true;
}

function matchDiceCountByFaces(event, exactDiceCountByFaces) {
  if (!exactDiceCountByFaces || typeof exactDiceCountByFaces !== "object") return true;
  return Object.entries(exactDiceCountByFaces).every(([faces, count]) => getDiceByFaces(event, Number(faces)).length === Number(count));
}

function passesFilters(trigger, event, options = {}) {
  const filters = trigger.filters ?? {};
  const playerOnly = Boolean(filters.playerOnly);
  const gmOnly = Boolean(filters.gmOnly);

  if (playerOnly && event.user?.isGM) return false;
  if (gmOnly && !event.user?.isGM) return false;
  if (!hasSpecificUser(event, normalizeArray(filters.users))) return false;
  if (!matchActorType(event, normalizeArray(filters.actorType))) return false;
  if (!matchRollType(event, normalizeArray(filters.rollType))) return false;
  if (!matchVisibility(event, normalizeArray(filters.visibility))) return false;
  if (!matchCombatState(event, filters.combatState)) return false;
  if (!matchScene(event, filters)) return false;
  if (!matchActor(event, filters)) return false;
  if (!matchItem(event, filters)) return false;
  if (!matchDiceCountByFaces(event, filters.exactDiceCountByFaces)) return false;

  if (options.respectPrivateRolls && filters.visibilityOverride !== true && ["blind", "gm-private"].includes(event.visibility) && filters.forcePublic) {
    return false;
  }

  return true;
}

function evaluateCustomJs(match, event) {
  if (!event.user?.isGM || !match.expression) return false;
  const evaluator = new Function("event", `return Boolean(${match.expression});`);
  return Boolean(evaluator(event));
}

export function evaluateMatchCondition(match, event) {
  const dice = getDiceByFaces(event, match.faces);
  const minCount = Number(match.minCount ?? 1);
  const threshold = Number(match.threshold ?? 0);

  switch (match.type) {
    case "die-value":
      return countByValue(dice, match.value) >= minCount;
    case "die-min":
      return countMin(dice) >= minCount;
    case "die-max":
      return countMax(dice) >= minCount;
    case "at-least-n-value":
      return countByValue(dice, match.value) >= minCount;
    case "at-least-n-min":
      return countMin(dice) >= minCount;
    case "at-least-n-max":
      return countMax(dice) >= minCount;
    case "all-same":
      return dice.length > 0 && dice.every((entry) => entry.value === dice[0].value);
    case "at-least-n-same": {
      const counts = new Map();
      for (const entry of dice) counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
      return [...counts.values()].some((count) => count >= minCount);
    }
    case "die-result-above":
      return dice.some((entry) => entry.value > threshold);
    case "die-result-below":
      return dice.some((entry) => entry.value < threshold);
    case "total-above":
      return Number(event.total ?? Number.NEGATIVE_INFINITY) > threshold;
    case "total-below":
      return Number(event.total ?? Number.POSITIVE_INFINITY) < threshold;
    case "success-degree":
      return String(event.successDegree ?? "") === String(match.degree ?? "");
    case "system-flag":
      return Boolean(globalThis.foundry?.utils?.getProperty?.(event.flags, match.path) ?? false);
    case "custom-js":
      return evaluateCustomJs(match, event);
    default:
      return false;
  }
}

export function matchTrigger(trigger, event, options = {}) {
  if (!trigger?.enabled) return null;
  if (!passesFilters(trigger, event, options)) return null;
  if (!evaluateMatchCondition(trigger.match ?? {}, event)) return null;

  return {
    trigger,
    event,
    actions: Array.isArray(trigger.actions) ? trigger.actions : [],
    executionMode: trigger.executionMode ?? options.defaultExecutionMode ?? "confirm-gm"
  };
}

export function collectMatches(triggers, event, options = {}) {
  const ordered = [...(triggers ?? [])].sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));
  const matches = [];

  for (const trigger of ordered) {
    const match = matchTrigger(trigger, event, options);
    if (!match) continue;
    matches.push(match);
    if (trigger.stopLowerPriority) break;
  }

  return matches;
}