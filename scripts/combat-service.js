import { executeMatch } from "./actions.js";
import {
  claimCombatEvent,
  collectCombatMatches,
  deriveTurnChangeEvents,
  getCombatEventKey,
  isCombatTrigger,
  isEffectExpired
} from "./combat-events.js";
import { getActorType } from "./roll-event.js";
import { isActiveGmClient } from "./roll-trigger-service.js";
import { format, MODULE_ID } from "./settings.js";
import { countFeature } from "./usage.mjs";

const DESCRIPTION_KEYS = {
  "turn-start": "Combat.Description.TurnStart",
  "turn-end": "Combat.Description.TurnEnd",
  "round-start": "Combat.Description.RoundStart",
  "combat-start": "Combat.Description.CombatStart",
  "combat-end": "Combat.Description.CombatEnd",
  "effect-end": "Combat.Description.EffectEnd"
};

// An actor's first active player owner. A rule that talks to "the player" reaches that user, nobody when the actor
// has no player online.
function findPlayerOwner(actor) {
  if (!actor?.testUserPermission) return null;
  const owner = ownerLevel();
  return game.users?.find?.((user) => user.active && !user.isGM && actor.testUserPermission(user, owner)) ?? null;
}

function ownerLevel() {
  return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? "OWNER";
}

function combatantsOfActor(combat, actor) {
  return (combat?.combatants?.contents ?? []).filter((combatant) => combatant.actorId === actor?.id);
}

// The event a combat trigger sees: the fields of a roll event that filters and actions read, plus the combat data.
// There is no roll, so formula and dice are empty.
export function buildCombatEvent(combat, descriptor, extras = {}) {
  const combatant = descriptor.combatantId ? combat.combatants?.get?.(descriptor.combatantId) ?? null : null;
  const actor = extras.actor ?? combatant?.actor ?? null;
  const token = combatant?.token ?? null;
  const owner = findPlayerOwner(actor);
  const effect = extras.effect ?? null;
  const actorName = actor?.name ?? combatant?.name ?? null;
  const round = descriptor.round ?? combat.round ?? null;

  const event = {
    adapterId: "combat",
    kind: "combat",
    combatEvent: descriptor.type,
    systemId: String(game.system?.id ?? "").trim() || "unknown",
    systemVersion: String(game.system?.version ?? "").trim() || null,
    messageId: null,
    messageUuid: null,
    rollIndex: 0,
    rollType: "combat",
    successDegree: null,
    actor,
    actorId: actor?.id ?? null,
    actorName,
    actorType: getActorType(actor),
    token,
    tokenId: token?.id ?? null,
    item: null,
    itemId: null,
    itemName: null,
    user: owner,
    userId: owner?.id ?? null,
    visibility: "public",
    rollMode: "publicroll",
    isCombat: true,
    sceneId: combat.scene?.id ?? combat.sceneId ?? null,
    formula: "",
    total: null,
    diceTerms: [],
    diceResults: [],
    targetUuids: [],
    flags: {},
    round,
    turn: descriptor.turn ?? combat.turn ?? null,
    combatId: combat.id ?? null,
    combatName: combat.name ?? "",
    combatantId: combatant?.id ?? null,
    combatantName: combatant?.name ?? actorName ?? "",
    effectName: effect?.name ?? effect?.label ?? null,
    effectStatuses: effect?.statuses ? [...effect.statuses] : []
  };
  event.description = format(DESCRIPTION_KEYS[descriptor.type] ?? DESCRIPTION_KEYS["turn-start"], {
    actor: actorName ?? "-",
    round: round ?? "-",
    effect: event.effectName ?? "-"
  });
  return event;
}

// Runs combat triggers. Combat hooks fire on every client, only the designated active GM acts, and every event
// counts once: the same event seen twice within a moment (a combat update can reach a hook twice) runs once.
export class CombatTriggerService {
  constructor({ settings, trace = null }) {
    this.settings = settings;
    this.trace = trace;
    this.seen = new Map();
    this.reportedEffects = new Set();
    this.queue = Promise.resolve();
  }

  record(event, data) {
    this.trace?.add(event, data);
  }

  getTriggers() {
    return (this.settings.getTriggers?.() ?? []).filter((trigger) => isCombatTrigger(trigger) && trigger.enabled !== false);
  }

  canRun() {
    return isActiveGmClient() && Boolean(this.settings.enabled) && this.getTriggers().length > 0;
  }

  // Events run one after another, in the order they happened.
  enqueue(task) {
    this.queue = this.queue.then(task).catch((error) => console.error("[SRT] Combat trigger failed", error));
    return this.queue;
  }

  async handleTurnChange(combat, previous, current) {
    if (!combat || !this.canRun()) return null;
    const descriptors = deriveTurnChangeEvents(previous, current);
    if (!descriptors.length) return null;
    return this.enqueue(async () => {
      for (const descriptor of descriptors) await this.fire(combat, descriptor);
      await this.scanExpiredEffects(combat);
    });
  }

  async handleCombatDeleted(combat) {
    if (!combat || !(Number(combat.round) > 0) || !this.canRun()) return null;
    return this.enqueue(() => this.fire(combat, { type: "combat-end", round: combat.round }));
  }

  // An effect that is deleted from a combatant's actor while its combat runs (removed by hand or run out).
  async handleEffectDeleted(effect) {
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor" || !this.canRun()) return null;
    const key = effect.uuid ?? effect.id;
    if (this.reportedEffects.delete(key)) return null;
    const combat = this.findCombatOf(actor);
    if (!combat) return null;
    return this.enqueue(() => this.fire(combat, { type: "effect-end", round: combat.round, effectId: effect.id, combatantId: combatantsOfActor(combat, actor)[0]?.id ?? null }, { actor, effect }));
  }

  findCombatOf(actor) {
    const combats = game.combats?.contents ?? [];
    const running = combats.filter((combat) => combat.started && combatantsOfActor(combat, actor).length);
    return running.find((combat) => combat.active) ?? running[0] ?? null;
  }

  // Effects that ran out at this turn change, before they are deleted (or without ever being deleted).
  async scanExpiredEffects(combat) {
    for (const combatant of combat.combatants?.contents ?? []) {
      const actor = combatant.actor;
      for (const effect of actor?.effects?.contents ?? []) {
        const key = effect.uuid ?? effect.id;
        if (!isEffectExpired(effect, combat) || this.reportedEffects.has(key)) continue;
        this.reportedEffects.add(key);
        await this.fire(combat, { type: "effect-end", round: combat.round, effectId: effect.id, combatantId: combatant.id }, { actor, effect });
      }
    }
  }

  async fire(combat, descriptor, extras = {}) {
    const key = getCombatEventKey(combat.id, descriptor);
    if (!claimCombatEvent(this.seen, key)) return { skipped: true, reason: "duplicate" };

    const event = buildCombatEvent(combat, descriptor, extras);
    const matches = collectCombatMatches(this.getTriggers(), event, { defaultExecutionMode: this.settings.defaultExecutionMode });
    this.record("combat", { combatId: combat.id, event: descriptor.type, round: event.round, turn: event.turn, combatant: event.combatantName, matches: matches.map((match) => match.trigger.id) });
    let executed = 0;

    for (const match of matches) {
      try {
        const result = await executeMatch(match, {
          allowDeferred: false,
          storeTriggeredInChat: false,
          respectPrivateRolls: this.settings.respectPrivateRolls
        });
        if (!result?.skipped) executed += 1;
        this.record("combat-matched", { triggerId: match.trigger.id, event: descriptor.type, result: result?.skipped ? "skipped" : "executed", reason: result?.reason ?? null });
      } catch (error) {
        this.record("combat-matched", { triggerId: match.trigger.id, event: descriptor.type, result: "error", error: String(error?.stack ?? error) });
        console.error("[SRT] Combat trigger action failed", error, match);
      }
    }

    // One count per event that set off a trigger, not per trigger or action.
    if (executed) countFeature(MODULE_ID, "combatTriggerFired");
    return { executed, matches: matches.length };
  }
}

export const __test__ = { findPlayerOwner, combatantsOfActor, DESCRIPTION_KEYS };
