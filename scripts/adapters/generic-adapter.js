import { createRollEvent } from "../roll-event.js";

// Ready Set Roll stores Roll#toJSON(). Rebuilt rolls keep their class, terms and dice results.
function restoreRoll(data) {
  const Roll = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
  if (!data || typeof data !== "object" || (typeof Roll === "function" && data instanceof Roll)) return data ?? null;
  if (typeof Roll?.fromData !== "function") return data;
  try {
    return Roll.fromData(data) ?? data;
  } catch {
    return data;
  }
}

export class GenericRollAdapter {
  constructor() {
    this.id = "generic";
  }

  // Ready Set Roll (dnd5e 5.3 builds) keeps the rolls of its cards serialized in flags.rsr5e.rolls and leaves
  // message.rolls empty. The flag wins whenever it is there, as in Ready Set Roll itself.
  getMessageRolls(message) {
    const stored = message?.flags?.rsr5e?.rolls;
    const rolls = Array.isArray(stored) ? stored.map(restoreRoll) : Array.from(message?.rolls ?? []);
    return rolls.filter((roll) => Boolean(roll));
  }

  supportsMessage(message) {
    return this.getMessageRolls(message).length > 0;
  }

  // Whether an update of a chat message brought rolls: Ready Set Roll and MidiQOL fill their cards after creating them.
  rollsChanged(changed) {
    return Array.isArray(changed?.rolls) || Array.isArray(changed?.flags?.rsr5e?.rolls);
  }

  // extra is passed on to createRollEvent. Only the test bench uses it, real chat messages pass nothing.
  extractRollEvents(message, extra = {}) {
    const rolls = this.getMessageRolls(message);
    return rolls.map((roll, index) => createRollEvent(message, roll, index, this.id, extra, rolls));
  }
}
