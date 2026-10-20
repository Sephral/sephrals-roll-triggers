import { executeMatch, hydrateDeferredMatch, markDeferredMatchExecuted, storeDeferredMatches, TRIGGER_OUTPUT_FLAG } from "./actions.js";
import { canUserRunTriggerButtons, TriggerChatCardRenderer } from "./chat-card.js";
import { allowsRepeatedMatches, collectMatches } from "./triggers.js";
import { localize, MODULE_ID } from "./settings.js";

// createChatMessage fires on every connected client. Only the designated active GM (game.users.activeGM, v13 and v14)
// processes rolls and relay requests, so a second GM or an Assistant GM does not repeat actions or confirm dialogs.
export function isActiveGmClient() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users?.activeGM;
  return Boolean(activeGM) && activeGM.id === game.user.id;
}

// A match costs one action slot per configured action (at least one). Chat button matches run later and disabled
// ones never, so both cost nothing when the message is processed. Shared by the chat processing and the test bench.
// Relay requests are removed a few seconds after the active GM handled them. v14 animates a chat notification for
// every new message on the GMs and the author, and that animation fails when the message is already gone.
export const RELAY_CLEANUP_DELAY_MS = 5000;

export function getMatchActionCost(match) {
  return Math.max(match?.actions?.length ?? 0, 1);
}

// A trigger without actions (for example a fresh starter profile trigger) has nothing to run: no confirmation
// dialog, no chat button. Only the GM whisper log, which never runs actions, still reports the match.
export function hasNothingToRun(match) {
  const actions = Array.isArray(match?.actions) ? match.actions : [];
  return actions.length === 0 && match?.executionMode !== "gm-whisper-log";
}

export function exceedsActionLimit(match, executedActions, maxActions) {
  if (match?.executionMode === "chat-button" || match?.executionMode === "disabled") return false;
  return executedActions + getMatchActionCost(match) > maxActions;
}

export class RollTriggerService {
  constructor({ adapter, settings }) {
    this.adapter = adapter;
    this.settings = settings;
    this.renderer = new TriggerChatCardRenderer();
    // Per message: how many of its rolls were checked, which triggers fired and how many actions ran.
    this.processedMessages = new Map();
    // Chat button runs in progress on this client (message id and trigger id), so a double click or two relayed
    // requests for the same button run the actions only once.
    this.runningDeferred = new Set();
    this.relayCleanupDelay = RELAY_CLEANUP_DELAY_MS;
  }

  log(label, payload) {
    if (!this.settings.debug) return;
    console.debug(`[SRT] ${label}`, payload);
  }

  getActiveTriggers() {
    return (this.settings.getTriggers?.() ?? []).filter((trigger) => trigger?.enabled !== false);
  }

  async processChatMessage(message) {
    if (!isActiveGmClient()) return;
    if (!this.settings.enabled) return;
    if (!this.adapter.supportsMessage(message)) return;
    // A roll table card posted by a trigger must not trigger again (no loops on the table's own roll).
    if (message.getFlag?.(MODULE_ID, TRIGGER_OUTPUT_FLAG)) return;

    // Ready Set Roll and MidiQOL add rolls to a card after creating it. Every call checks only the rolls that came
    // since the last one. The stored flag holds the number of checked rolls (true from older versions: all of them).
    const messageKey = `${message.id}:${message.uuid ?? ""}`;
    const state = this.processedMessages.get(messageKey) ?? { rollCount: 0, matchedTriggers: new Set(), executedActions: 0 };
    const stored = this.settings.storeTriggeredInChat ? message.getFlag?.(this.settings.moduleId, "processed") : null;
    if (stored === true) return;
    const fromIndex = Math.max(state.rollCount, Number(stored) || 0);

    const triggers = this.getActiveTriggers();
    if (!triggers.length) return;

    const allEvents = this.adapter.extractRollEvents(message);
    const rollCount = allEvents.reduce((count, event) => Math.max(count, (Number(event.rollIndex) || 0) + 1), 0);
    if (rollCount <= fromIndex) return;
    // Taken before any await, so a second update arriving meanwhile does not check the same rolls again.
    state.rollCount = rollCount;
    this.processedMessages.set(messageKey, state);

    const events = allEvents.filter((event) => (Number(event.rollIndex) || 0) >= fromIndex);
    const deferredMatches = [];
    const matchedTriggers = state.matchedTriggers;
    const maxActions = this.settings.maxActionsPerMessage;
    let executedActions = state.executedActions;

    for (const event of events) {
      if (executedActions >= maxActions) break;
      this.log("Normalized roll event", event);
      const matches = collectMatches(triggers, event, {
        defaultExecutionMode: this.settings.defaultExecutionMode,
        respectPrivateRolls: this.settings.respectPrivateRolls
      });

      for (const match of matches) {
        if (executedActions >= maxActions) break;

        // A card with several rolls (for example several damage parts) runs each trigger once unless it opts out.
        const triggerKey = match.trigger.id ?? match.trigger;
        if (matchedTriggers.has(triggerKey) && !allowsRepeatedMatches(match.trigger)) continue;
        matchedTriggers.add(triggerKey);
        if (hasNothingToRun(match)) continue;

        // Skip a trigger whose actions would exceed the limit. Chat-button matches run later and cost nothing now.
        const actionCount = getMatchActionCost(match);
        if (exceedsActionLimit(match, executedActions, maxActions)) {
          this.log("Action limit reached", { triggerId: match.trigger.id, messageId: message.id, rollIndex: event.rollIndex });
          continue;
        }

        this.log("Matched trigger", { triggerId: match.trigger.id, messageId: message.id, rollIndex: event.rollIndex });

        try {
          const result = await executeMatch(match, {
            storeTriggeredInChat: this.settings.storeTriggeredInChat,
            respectPrivateRolls: this.settings.respectPrivateRolls
          });
          if (result?.deferred) {
            deferredMatches.push(match);
          } else if (!result?.skipped) {
            executedActions += actionCount;
          }
        } catch (error) {
          console.error("[SRT] Trigger action failed", error, match);
        }
      }
    }

    state.executedActions = executedActions;

    if (deferredMatches.length) {
      await storeDeferredMatches(message, deferredMatches);
    }
    if (this.settings.storeTriggeredInChat) {
      await message.setFlag(this.settings.moduleId, "processed", rollCount);
    }
  }

  renderChatMessage(message, html) {
    if (this.isDeferredRequestMessage(message)) {
      html.hidden = true;
      html.style.display = "none";
      return false;
    }

    if (!this.settings.enabled) return false;
    return this.renderer.appendButtons(message, html, {
      allowPlayerButtons: this.settings.allowPlayerButtons,
      onRunTrigger: async ({ triggerId, button, root }) => {
        await this.executeDeferredTrigger(message, triggerId, { button, root });
      }
    });
  }

  isDeferredRequestMessage(message) {
    return Boolean(this.getDeferredRequest(message));
  }

  getDeferredRequest(message) {
    return message?.getFlag?.(MODULE_ID, "deferredRequest")
      ?? globalThis.foundry?.utils?.getProperty?.(message, `flags.${MODULE_ID}.deferredRequest`)
      ?? globalThis.foundry?.utils?.getProperty?.(message, `_source.flags.${MODULE_ID}.deferredRequest`)
      ?? null;
  }

  async handleDeferredRequestMessage(message) {
    const request = this.getDeferredRequest(message);

    if (!request) return false;
    if (!isActiveGmClient()) return true;

    try {
      await this.#handleDeferredRequest(message, request);
    } finally {
      this.scheduleRelayCleanup(message);
    }
    return true;
  }

  // The request is only a hidden transport message. Once the active GM handled it, it is removed, so relay requests
  // do not pile up in the chat log (and in its exports).
  scheduleRelayCleanup(message) {
    const remove = async () => {
      if (message?.id && game.messages?.get?.(message.id) !== message) return;
      try {
        await message.delete?.();
      } catch (error) {
        this.log("Relay request cleanup failed", error);
      }
    };
    if (!this.relayCleanupDelay) return remove();
    globalThis.setTimeout?.(() => void remove(), this.relayCleanupDelay);
    return null;
  }

  async #handleDeferredRequest(message, request) {
    const sourceMessage = game.messages?.get?.(request.messageId) ?? null;
    if (!sourceMessage) return true;

    // Foundry only lets players create messages as themselves, so the relay author is the requesting user.
    const requesterId = message._source?.author ?? message.author?.id ?? null;
    const requester = game.users?.get?.(requesterId) ?? null;
    if (!canUserRunTriggerButtons(sourceMessage, requester, { allowPlayerButtons: this.settings.allowPlayerButtons })) {
      this.log("Rejected deferred trigger request", { messageId: request.messageId, triggerId: request.triggerId, requestedBy: requesterId });
      return true;
    }

    try {
      await this.executeDeferredTrigger(sourceMessage, request.triggerId, {
        requestRelay: true
      });
    } catch (error) {
      console.error("[SRT] Deferred trigger relay execution failed", error, {
        messageId: request.messageId,
        triggerId: request.triggerId,
        requestedBy: request.userId ?? null
      });
    }

    return true;
  }

  async requestDeferredTriggerExecution(message, triggerId) {
    // getWhisperRecipients("GM") also lists offline GMs. Without an active GM nobody would ever handle the request.
    const gmRecipients = ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
    if (!gmRecipients.length || !game.users?.activeGM) {
      globalThis.ui?.notifications?.warn?.(localize("Notification.NoActiveGm"));
      return { skipped: true, reason: "no-active-gm" };
    }

    await ChatMessage.create({
      content: "<div class=\"srt-deferred-request\" hidden></div>",
      whisper: gmRecipients,
      flags: {
        [MODULE_ID]: {
          deferredRequest: {
            messageId: message.id,
            triggerId,
            userId: game.user?.id ?? null
          }
        }
      }
    });

    return { queued: true, mode: "chat-button" };
  }

  async executeDeferredTrigger(message, triggerId, context = {}) {
    if (!message || !triggerId) return { skipped: true, reason: "missing-data" };

    const runKey = `${message.id}:${triggerId}`;
    if (this.runningDeferred.has(runKey)) return { skipped: true, reason: "running" };
    this.runningDeferred.add(runKey);
    try {
      return await this.#runDeferredTrigger(message, triggerId, context);
    } finally {
      this.runningDeferred.delete(runKey);
    }
  }

  async #runDeferredTrigger(message, triggerId, context) {
    const deferredEntries = message.getFlag?.(MODULE_ID, "deferredMatches") ?? [];
    const deferredEntry = deferredEntries.find((entry) => entry?.triggerId === triggerId && entry.executed !== true);
    if (!deferredEntry) return { skipped: true, reason: "missing-trigger" };

    const match = hydrateDeferredMatch(deferredEntry);
    if (!match) return { skipped: true, reason: "invalid-trigger" };

    if (!game.user?.isGM && context.requestRelay !== true) {
      const queued = await this.requestDeferredTriggerExecution(message, triggerId);
      if (!queued?.skipped) {
        context.button?.setAttribute?.("disabled", "disabled");
        context.button?.classList?.add?.("is-disabled");
      }
      return queued;
    }

    try {
      const result = await executeMatch(match, {
        allowDeferred: false,
        forceExecutionMode: "automatic",
        storeTriggeredInChat: this.settings.storeTriggeredInChat,
        respectPrivateRolls: this.settings.respectPrivateRolls
      });

      if (!result?.skipped) {
        await markDeferredMatchExecuted(message, triggerId);
        context.button?.setAttribute?.("disabled", "disabled");
        context.button?.classList?.add?.("is-disabled");
      }

      return result;
    } catch (error) {
      console.error("[SRT] Deferred trigger execution failed", error, { messageId: message.id, triggerId });
      throw error;
    }
  }
}