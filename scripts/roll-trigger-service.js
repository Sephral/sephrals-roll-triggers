import { executeMatch, hydrateDeferredMatch, markDeferredMatchExecuted, storeDeferredMatches } from "./actions.js";
import { TriggerChatCardRenderer } from "./chat-card.js";
import { collectMatches } from "./triggers.js";
import { MODULE_ID } from "./settings.js";

export class RollTriggerService {
  constructor({ adapter, settings }) {
    this.adapter = adapter;
    this.settings = settings;
    this.renderer = new TriggerChatCardRenderer();
    this.processedMessages = new Set();
  }

  log(label, payload) {
    if (!this.settings.debug) return;
    console.debug(`[SRT] ${label}`, payload);
  }

  getActiveTriggers() {
    return (this.settings.getTriggers?.() ?? []).filter((trigger) => trigger?.enabled !== false);
  }

  async processChatMessage(message) {
    if (!game.user?.isGM) return;
    if (!this.settings.enabled) return;
    if (!this.adapter.supportsMessage(message)) return;

    const messageKey = `${message.id}:${message.uuid ?? ""}`;
    if (this.processedMessages.has(messageKey)) return;

    const stored = message.getFlag?.(this.settings.moduleId, "processed");
    if (stored && this.settings.storeTriggeredInChat) return;

    const triggers = this.getActiveTriggers();
    if (!triggers.length) return;

    const events = this.adapter.extractRollEvents(message);
    const deferredMatches = [];
    let executedActions = 0;

    for (const event of events) {
      this.log("Normalized roll event", event);
      const matches = collectMatches(triggers, event, {
        defaultExecutionMode: this.settings.defaultExecutionMode,
        respectPrivateRolls: this.settings.respectPrivateRolls
      });

      for (const match of matches) {
        this.log("Matched trigger", { triggerId: match.trigger.id, messageId: message.id, rollIndex: event.rollIndex });
        if (executedActions >= this.settings.maxActionsPerMessage) break;

        try {
          const result = await executeMatch(match, {
            storeTriggeredInChat: this.settings.storeTriggeredInChat
          });
          if (result?.deferred) {
            deferredMatches.push(match);
          } else if (!result?.skipped) {
            executedActions += Math.max(match.actions?.length ?? 0, 1);
          }
        } catch (error) {
          console.error("[SRT] Trigger action failed", error, match);
        }
      }
    }

    this.processedMessages.add(messageKey);

    if (deferredMatches.length) {
      await storeDeferredMatches(message, deferredMatches);
    }
    if (this.settings.storeTriggeredInChat) {
      await message.setFlag(this.settings.moduleId, "processed", true);
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
    if (!game.user?.isGM) return true;

    const sourceMessage = game.messages?.get?.(request.messageId) ?? null;
    if (!sourceMessage) return true;

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
    const gmRecipients = ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
    if (!gmRecipients.length) return { skipped: true, reason: "no-active-gm" };

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
        storeTriggeredInChat: this.settings.storeTriggeredInChat
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