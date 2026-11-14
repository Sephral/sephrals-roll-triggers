import { getBlockingFilters, orderTriggersByPriority } from "./triggers.js";

// Combat triggers react to what happens in a combat instead of a roll. This file holds the pure parts: the event
// kinds, the settings of a combat trigger, which events a turn change produces and which triggers match an event.
// The Foundry side (hooks, the active GM, building the event from a combat) lives in combat-service.js.

export const COMBAT_EVENTS = Object.freeze(["turn-start", "turn-end", "round-start", "combat-start", "combat-end", "effect-end"]);

export const COMBAT_EVENT_LABEL_KEYS = Object.freeze({
  "turn-start": "CombatEvent.TurnStart",
  "turn-end": "CombatEvent.TurnEnd",
  "round-start": "CombatEvent.RoundStart",
  "combat-start": "CombatEvent.CombatStart",
  "combat-end": "CombatEvent.CombatEnd",
  "effect-end": "CombatEvent.EffectEnd"
});

// Which settings and filters make sense for which event. The editor shows only these, normalization drops the rest.
export const COMBAT_EVENT_FIELDS = Object.freeze({
  "turn-start": { rounds: true, actors: true, effect: false },
  "turn-end": { rounds: true, actors: true, effect: false },
  "round-start": { rounds: true, actors: false, effect: false },
  "combat-start": { rounds: false, actors: false, effect: false },
  "combat-end": { rounds: false, actors: false, effect: false },
  "effect-end": { rounds: true, actors: true, effect: true }
});

// Combat triggers cannot show a chat button: there is no roll message to put it on.
export const COMBAT_EXECUTION_MODES = Object.freeze(["automatic", "confirm-gm", "gm-whisper-log", "disabled"]);

// Two events with the same key within this time count as one (a combat update can reach the hook twice).
export const COMBAT_EVENT_DEDUPE_MS = 1500;

export function isCombatTrigger(trigger) {
  return trigger?.kind === "combat";
}

function toPositiveInteger(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

// The stored settings of a combat trigger. Fields the event does not use are dropped.
export function normalizeCombatConfig(combat) {
  const event = COMBAT_EVENTS.includes(combat?.event) ? combat.event : "turn-start";
  const fields = COMBAT_EVENT_FIELDS[event];
  const effect = String(combat?.effect ?? "").trim();
  return {
    event,
    round: fields.rounds ? toPositiveInteger(combat?.round) : null,
    every: fields.rounds ? toPositiveInteger(combat?.every) : null,
    effect: fields.effect && effect ? effect : null
  };
}

export function getCombatExecutionMode(mode) {
  return COMBAT_EXECUTION_MODES.includes(mode) ? mode : "confirm-gm";
}

// "Only in round N" or "every N rounds". Alone, every N counts rounds N, 2N, 3N. Together with a round it counts
// from that round on: round 2 and every 3 gives rounds 2, 5, 8.
export function matchesRoundRule({ round = null, every = null } = {}, currentRound) {
  const current = Number(currentRound);
  if (!Number.isFinite(current)) return false;
  if (round && every) return current >= round && (current - round) % every === 0;
  if (round) return current === round;
  if (every) return current >= every && current % every === 0;
  return true;
}

function matchesEffectText(text, event) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (!needle) return true;
  const hay = [event.effectName, ...(Array.isArray(event.effectStatuses) ? event.effectStatuses : [])]
    .map((value) => String(value ?? "").toLowerCase());
  return hay.some((value) => value.includes(needle));
}

// A combat trigger against a combat event, or null. Filters work like the roll filters (actor type, actors, scenes),
// the event carries the same fields a roll event has.
export function matchCombatTrigger(trigger, event, options = {}) {
  if (!isCombatTrigger(trigger) || !trigger.enabled) return null;
  const combat = normalizeCombatConfig(trigger.combat);
  if (combat.event !== event?.combatEvent) return null;
  if (COMBAT_EVENT_FIELDS[combat.event].rounds && !matchesRoundRule(combat, event.round)) return null;
  if (COMBAT_EVENT_FIELDS[combat.event].effect && !matchesEffectText(combat.effect, event)) return null;
  if (getBlockingFilters(trigger, event, options).length) return null;

  return {
    trigger,
    event,
    actions: Array.isArray(trigger.actions) ? trigger.actions : [],
    executionMode: getCombatExecutionMode(trigger.executionMode ?? options.defaultExecutionMode)
  };
}

export function collectCombatMatches(triggers, event, options = {}) {
  const matches = [];
  for (const trigger of orderTriggersByPriority((triggers ?? []).filter(isCombatTrigger))) {
    let match = null;
    try {
      match = matchCombatTrigger(trigger, event, options);
    } catch (error) {
      console.warn(`[SRT] Combat trigger "${trigger?.name ?? trigger?.id ?? "?"}" failed to evaluate and was skipped`, error);
    }
    if (!match) continue;
    matches.push(match);
    if (trigger.stopLowerPriority) break;
  }
  return matches;
}

const MAX_SKIPPED_ROUNDS = 20;

// The events one turn change brings, in the order Foundry itself runs them: end of the old turn, start of the new
// rounds, start of the new turn. The first turn after "Begin Combat" also starts the combat. Going back in the
// tracker (an earlier round or turn) brings nothing. previous and current look like Combat#previous and #current.
export function deriveTurnChangeEvents(previous, current) {
  const prior = { round: Number(previous?.round) || 0, turn: previous?.turn ?? null, combatantId: previous?.combatantId ?? null };
  const next = { round: Number(current?.round) || 0, turn: current?.turn ?? null, combatantId: current?.combatantId ?? null };
  if (next.round < 1) return [];

  const events = [];
  if (prior.round < 1) {
    events.push({ type: "combat-start", round: next.round });
    for (let round = 1; round <= Math.min(next.round, MAX_SKIPPED_ROUNDS); round += 1) events.push({ type: "round-start", round });
    if (next.combatantId) events.push({ type: "turn-start", round: next.round, turn: next.turn, combatantId: next.combatantId });
    return events;
  }

  const roundsForward = next.round - prior.round;
  const sameRound = roundsForward === 0;
  const turnsBack = sameRound && next.turn != null && prior.turn != null && Number(next.turn) < Number(prior.turn);
  if (roundsForward < 0 || turnsBack) return [];

  // The same combatant in the same round is no new turn, even when the turn number shifted because someone joined.
  const changed = !sameRound || (next.combatantId !== prior.combatantId) || (next.combatantId == null && next.turn !== prior.turn);
  if (!changed) return [];

  if (prior.combatantId) events.push({ type: "turn-end", round: prior.round, turn: prior.turn, combatantId: prior.combatantId });
  for (let round = prior.round + 1; round <= next.round && round <= prior.round + MAX_SKIPPED_ROUNDS; round += 1) {
    events.push({ type: "round-start", round });
  }
  if (next.combatantId) events.push({ type: "turn-start", round: next.round, turn: next.turn, combatantId: next.combatantId });
  return events;
}

export function getCombatEventKey(combatId, descriptor) {
  return [combatId ?? "", descriptor?.type ?? "", descriptor?.round ?? "", descriptor?.turn ?? "", descriptor?.combatantId ?? "", descriptor?.effectId ?? ""].join(":");
}

// A map of event keys to the time they were last seen. Returns true when the key is new (or older than the window).
export function claimCombatEvent(seen, key, now = Date.now(), windowMs = COMBAT_EVENT_DEDUPE_MS) {
  const last = seen.get(key);
  if (last != null && now - last < windowMs) return false;
  seen.set(key, now);
  if (seen.size > 200) {
    for (const [oldKey, time] of seen) if (now - time > windowMs * 4) seen.delete(oldKey);
  }
  return true;
}

// Rounds an effect with a duration in rounds or turns has left, counted like Foundry 13 does (the effect keeps
// startRound and startTurn). Null when the duration is not given in rounds or turns.
export function getRoundsRemaining(duration, combat) {
  const rounds = Number(duration?.rounds) || 0;
  const turns = Number(duration?.turns) || 0;
  if ((!rounds && !turns) || !combat) return null;
  const round = Number(combat.round) || 0;
  const turnCount = Math.max(Number(combat.turns?.length) || 1, 1);
  const startRound = Number(duration.startRound) || round;
  let elapsedRounds = Math.max(round - startRound, 0);
  let elapsedTurns = (Number(combat.turn) || 0) - (Number(duration.startTurn) || 0);
  if (elapsedTurns < 0) {
    elapsedRounds -= 1;
    elapsedTurns += turnCount;
  }
  return (rounds - elapsedRounds) + ((turns - elapsedTurns) / turnCount);
}

// Whether an effect has run out. Foundry 14 marks duration.expired before the turn event reaches the hooks. Foundry 13
// computes the duration when the actor is prepared, which has not happened yet at that moment, so its rounds and turns
// are counted again from the combat.
export function isEffectExpired(effect, combat = null) {
  const duration = effect?.duration;
  if (!duration) return false;
  if (duration.expired === true) return true;
  if (!effect.isTemporary) return false;
  const remaining = Number(duration.remaining);
  if (duration.remaining != null && Number.isFinite(remaining) && remaining <= 0) return true;
  const left = getRoundsRemaining(duration, combat);
  return left != null && left <= 0;
}

export const __test__ = { toPositiveInteger, matchesEffectText, MAX_SKIPPED_ROUNDS };
