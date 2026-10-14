import { normalizeSuccessDegree } from "./roll-event.js";

function normalizeArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function getDiceByFaces(event, faces) {
  const dice = event.diceResults ?? [];
  // An empty faces field (null after normalization) means "any die", not "dice with 0 faces".
  if (faces == null || faces === "") return dice;
  const number = Number(faces);
  if (!Number.isFinite(number) || number <= 0) return dice;
  return dice.filter((entry) => Number(entry.faces) === number);
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

function matchPrivateRollOverride(event, filters, options) {
  if (!options.respectPrivateRolls || filters.visibilityOverride === true) return true;
  return !(["blind", "gm-private"].includes(event.visibility) && filters.forcePublic);
}

// The filter checks in the order matchTrigger applies them. The keys name the filter that blocked a roll,
// so the test bench can explain a miss with exactly the checks the chat processing runs.
const FILTER_CHECKS = [
  ["playerOnly", (event, filters) => !(filters.playerOnly && event.user?.isGM)],
  ["gmOnly", (event, filters) => !(filters.gmOnly && !event.user?.isGM)],
  ["users", (event, filters) => hasSpecificUser(event, normalizeArray(filters.users))],
  ["actorType", (event, filters) => matchActorType(event, normalizeArray(filters.actorType))],
  ["rollType", (event, filters) => matchRollType(event, normalizeArray(filters.rollType))],
  ["visibility", (event, filters) => matchVisibility(event, normalizeArray(filters.visibility))],
  ["combatState", (event, filters) => matchCombatState(event, filters.combatState)],
  ["scene", (event, filters) => matchScene(event, filters)],
  ["actor", (event, filters) => matchActor(event, filters)],
  ["item", (event, filters) => matchItem(event, filters)],
  ["diceCount", (event, filters) => matchDiceCountByFaces(event, filters.exactDiceCountByFaces)],
  ["privateRoll", (event, filters, options) => matchPrivateRollOverride(event, filters, options)]
];

export const FILTER_KEYS = Object.freeze(FILTER_CHECKS.map(([key]) => key));

// Keys of every filter that blocks the roll. An empty list means the trigger passes its filters.
export function getBlockingFilters(trigger, event, options = {}) {
  const filters = trigger?.filters ?? {};
  return FILTER_CHECKS.filter(([, check]) => !check(event, filters, options)).map(([key]) => key);
}

function passesFilters(trigger, event, options = {}) {
  const filters = trigger.filters ?? {};
  return FILTER_CHECKS.every(([, check]) => check(event, filters, options));
}

function evaluateCustomJs(match, event) {
  if (!game.user?.isGM || !match.expression) return false;
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
      // One die alone is no "all the same": a doubles trigger must not fire on every single die roll.
      return dice.length > 1 && dice.every((entry) => entry.value === dice[0].value);
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
    case "success-degree": {
      // Both sides are normalized, so "criticalSuccess", "critical-success" and PF2e's 3 all match.
      const degree = normalizeSuccessDegree(match.degree);
      return degree != null && normalizeSuccessDegree(event.successDegree) === degree;
    }
    case "system-flag":
      return Boolean(globalThis.foundry?.utils?.getProperty?.(event.flags, match.path) ?? false);
    case "custom-js":
      return evaluateCustomJs(match, event);
    default:
      return false;
  }
}

// The primary `match` plus every entry of the optional `extraMatches` array (logical AND).
export function getTriggerConditions(trigger) {
  const extraMatches = Array.isArray(trigger?.extraMatches)
    ? trigger.extraMatches.filter((condition) => condition && typeof condition === "object")
    : [];
  return [trigger?.match ?? {}, ...extraMatches];
}

export function evaluateTriggerConditions(trigger, event) {
  return getTriggerConditions(trigger).every((condition) => evaluateMatchCondition(condition, event));
}

export function matchTrigger(trigger, event, options = {}) {
  if (!trigger?.enabled) return null;
  if (!passesFilters(trigger, event, options)) return null;
  if (!evaluateTriggerConditions(trigger, event)) return null;

  return {
    trigger,
    event,
    actions: Array.isArray(trigger.actions) ? trigger.actions : [],
    executionMode: trigger.executionMode ?? options.defaultExecutionMode ?? "confirm-gm"
  };
}

// A trigger runs at most once per chat message (first matching roll) unless oncePerMessage is false
// or allowMultipleMatches is true. Both fields are stored on every trigger, either one opts into a run per roll.
export function allowsRepeatedMatches(trigger) {
  return trigger?.oncePerMessage === false || trigger?.allowMultipleMatches === true;
}

export function orderTriggersByPriority(triggers) {
  return [...(triggers ?? [])].sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));
}

// Triggers already reported as failing (id and condition), so a broken trigger warns once and not on every roll.
const reportedFailures = new Set();

// A trigger whose custom condition throws counts as not matched, like in the test bench. It must not stop the
// other triggers of the roll.
function tryMatchTrigger(trigger, event, options) {
  try {
    return matchTrigger(trigger, event, options);
  } catch (error) {
    const key = `${trigger?.id ?? trigger?.name ?? "?"}:${JSON.stringify(getTriggerConditions(trigger))}`;
    if (!reportedFailures.has(key)) {
      reportedFailures.add(key);
      console.warn(`[SRT] Trigger "${trigger?.name ?? trigger?.id ?? "?"}" failed to evaluate and was skipped`, error);
    }
    return null;
  }
}

export function collectMatches(triggers, event, options = {}) {
  const ordered = orderTriggersByPriority(triggers);
  const matches = [];

  for (const trigger of ordered) {
    const match = tryMatchTrigger(trigger, event, options);
    if (!match) continue;
    matches.push(match);
    if (trigger.stopLowerPriority) break;
  }

  return matches;
}

// Each condition on its own, for the test bench. A custom condition that throws counts as failed and keeps its error.
export function explainTriggerConditions(trigger, event) {
  return getTriggerConditions(trigger).map((condition, index) => {
    try {
      return { index, condition, passed: Boolean(evaluateMatchCondition(condition, event)), error: null };
    } catch (error) {
      return { index, condition, passed: false, error: String(error?.message ?? error) };
    }
  });
}

// Why a trigger matches a roll or not. The verdict itself comes from matchTrigger, the same call the chat
// processing makes, the filter and condition lists only explain it.
export function explainTrigger(trigger, event, options = {}) {
  let match = null;
  let error = null;
  try {
    match = matchTrigger(trigger, event, options);
  } catch (caught) {
    error = String(caught?.message ?? caught);
  }

  return {
    trigger,
    enabled: Boolean(trigger?.enabled),
    blockedBy: getBlockingFilters(trigger, event, options),
    conditions: explainTriggerConditions(trigger, event),
    matched: Boolean(match),
    match,
    error,
    stoppedBy: null
  };
}

// Runs every trigger like collectMatches does and explains each one. Triggers below a matching trigger with
// "stop lower priority" are reported as stopped, exactly where collectMatches stops.
export function simulateTriggers(triggers, event, options = {}) {
  const reports = [];
  let stoppedBy = null;

  for (const trigger of orderTriggersByPriority(triggers)) {
    const report = explainTrigger(trigger, event, options);
    if (stoppedBy) {
      reports.push({ ...report, matched: false, match: null, stoppedBy });
      continue;
    }
    reports.push(report);
    if (report.matched && trigger.stopLowerPriority) stoppedBy = trigger;
  }

  return reports;
}
