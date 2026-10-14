import { createRollEvent } from "../roll-event.js";

export class GenericRollAdapter {
  constructor() {
    this.id = "generic";
  }

  supportsMessage(message) {
    return Array.isArray(message?.rolls) && message.rolls.some((roll) => Boolean(roll));
  }

  // extra is passed on to createRollEvent. Only the test bench uses it, real chat messages pass nothing.
  extractRollEvents(message, extra = {}) {
    return (message?.rolls ?? [])
      .filter((roll) => Boolean(roll))
      .map((roll, index) => createRollEvent(message, roll, index, this.id, extra));
  }
}