import { MODULE_ID, localize } from "./settings.js";

function getRootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function canSeeButton(entry, options) {
  if (entry?.executed) return false;
  if (game.user?.isGM) return true;
  return Boolean(options.allowPlayerButtons);
}

export class TriggerChatCardRenderer {
  appendButtons(message, html, options = {}) {
    const root = getRootElement(html);
    if (!root) return false;
    if (root.querySelector(`.srt-trigger-panel[data-message-id="${message.id}"]`)) return false;

    const deferredMatches = message.getFlag?.(MODULE_ID, "deferredMatches") ?? [];
    const visibleMatches = deferredMatches.filter((entry) => canSeeButton(entry, options));
    if (!visibleMatches.length) return false;

    const items = visibleMatches.map((entry) => `
      <div class="srt-trigger-panel__item">
        <span class="srt-trigger-panel__name">${entry.triggerName}</span>
        <button type="button" class="srt-trigger-panel__button" data-action="run-trigger" data-trigger-id="${entry.triggerId}" data-message-id="${message.id}">${localize("Chat.TriggerButton")}</button>
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