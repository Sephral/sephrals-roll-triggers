import { createRollEvent } from "../roll-event.js";

export class GenericRollAdapter {
  constructor() {
    this.id = "generic";
  }

  supportsMessage(message) {
    return Array.isArray(message?.rolls) && message.rolls.some((roll) => Boolean(roll));
  }

  extractRollEvents(message) {
    return (message?.rolls ?? [])
      .filter((roll) => Boolean(roll))
      .map((roll, index) => createRollEvent(message, roll, index, this.id));
  }
}