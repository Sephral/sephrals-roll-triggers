// A tiny DOM for the editor tests: elements with attributes, a dataset, a value and children, and the selector forms
// the module uses: tag, [attr], [attr="value"], [attr=value] and combinations of them.

const toCamel = (name) => name.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());

export class FakeElement {
  constructor(tag = "div", attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.hidden = false;
    this.value = attrs.value ?? "";
    this.checked = Boolean(attrs.checked);
    this.textContent = "";
    this.options = [];
    this.parent = null;
    for (const child of children) this.append(child);
  }

  get dataset() {
    const dataset = {};
    for (const [name, value] of Object.entries(this.attrs)) if (name.startsWith("data-")) dataset[toCamel(name.slice(5))] = value;
    return dataset;
  }

  get multiple() {
    return "multiple" in this.attrs;
  }

  get selectedOptions() {
    return this.options.filter((option) => option.selected);
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, value) {
    this.attrs[name] = value;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  hasAttribute(name) {
    return name in this.attrs;
  }

  closest(selector) {
    for (let element = this; element; element = element.parent) if (element.matches(selector)) return element;
    return null;
  }

  matches(selector) {
    const match = selector.match(/^(\w+)?((?:\[[^\]]+\])*)$/);
    if (!match) throw new Error(`Unsupported selector ${selector}`);
    if (match[1] && this.tagName !== match[1].toUpperCase()) return false;
    for (const [, name, quote, expected] of match[2].matchAll(/\[([\w-]+)(?:=(["']?)([^\]"']*)\2)?\]/g)) {
      if (!(name in this.attrs)) return false;
      if (quote !== undefined && expected !== undefined && String(this.attrs[name]) !== expected) return false;
    }
    return true;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export function input(name, value = "", extra = {}) {
  const element = new FakeElement("input", { name, ...extra });
  element.value = value;
  return element;
}

export function checkbox(name, checked = false) {
  const element = new FakeElement("input", { name, type: "checkbox" });
  element.checked = checked;
  return element;
}

export function select(name, values, selected = [], extra = {}) {
  const element = new FakeElement("select", { name, ...extra });
  element.options = values.map(([value, label]) => {
    const option = new FakeElement("option", { value });
    option.value = value;
    option.textContent = label ?? value;
    option.selected = [].concat(selected).includes(value);
    return option;
  });
  element.value = element.options.find((option) => option.selected)?.value ?? element.options[0]?.value ?? "";
  return element;
}

export function section(attrs, children = []) {
  return new FakeElement("div", attrs, children);
}
