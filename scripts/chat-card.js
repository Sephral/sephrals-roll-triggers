import { escapeHtml } from "./actions.js";
import { MODULE_ID, localize } from "./settings.js";

function getRootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function getMessageAuthorId(message) {
  return message?._source?.author ?? message?.author?.id ?? null;
}

function getSpeakerActor(message) {
  return globalThis.ChatMessage?.getSpeakerActor?.(message?.speaker) ?? null;
}

// GMs may always run a stored trigger. With player buttons allowed, a player may run it only on a message
// they rolled or whose speaker actor they own, and never on a blind roll.
export function canUserRunTriggerButtons(message, user, options = {}) {
  if (!user) return false;
  if (user.isGM) return true;
  if (!options.allowPlayerButtons) return false;
  if (message?.blind) return false;
  if (user.id && getMessageAuthorId(message) === user.id) return true;
  return Boolean(getSpeakerActor(message)?.testUserPermission?.(user, "OWNER"));
}

function canSeeButton(entry, message, options) {
  if (entry?.executed) return false;
  return canUserRunTriggerButtons(message, game.user, options);
}

export class TriggerChatCardRenderer {
  appendButtons(message, html, options = {}) {
    const root = getRootElement(html);
    if (!root) return false;
    if (root.querySelector(`.srt-trigger-panel[data-message-id="${message.id}"]`)) return false;

    const deferredMatches = message.getFlag?.(MODULE_ID, "deferredMatches") ?? [];
    const visibleMatches = deferredMatches.filter((entry) => canSeeButton(entry, message, options));
    if (!visibleMatches.length) return false;

    const items = visibleMatches.map((entry) => `
      <div class="srt-trigger-panel__item">
        <span class="srt-trigger-panel__name">${escapeHtml(entry.triggerName)}</span>
        <button type="button" class="srt-trigger-panel__button" data-action="run-trigger" data-trigger-id="${escapeHtml(entry.triggerId)}" data-message-id="${message.id}">${localize("Chat.TriggerButton")}</button>
      </div>
    `).join("");

    const markup = `
      <div class="srt-trigger-panel" data-message-id="${message.id}">
        <div class="srt-trigger-panel__title">${localize("Chat.TriggerReady")}</div>
        <div class="srt-trigger-panel__items">${items}</div>
      </div>
    `;

    const content = root.querySelector(".message-content") ?? root;
    content.insertAdjacentHTML("beforeend", markup);

    if (typeof options.onRunTrigger === "function") {
      const panel = content.querySelector(`.srt-trigger-panel[data-message-id="${message.id}"]`);
      for (const button of panel?.querySelectorAll('[data-action="run-trigger"]') ?? []) {
        button.addEventListener("click", () => {
          void options.onRunTrigger({
            messageId: message.id,
            triggerId: button.dataset.triggerId,
            button,
            root
          });
        });
      }
    }

    return true;
  }
}
