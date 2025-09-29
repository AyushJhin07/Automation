const placeholderClass = class {};

function ensurePlaceholder(key: string, value: any) {
  if (!(key in globalThis)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }
}

ensurePlaceholder('HTMLElement', placeholderClass);
ensurePlaceholder('Element', placeholderClass);
ensurePlaceholder('Node', placeholderClass);
ensurePlaceholder('Text', placeholderClass);
ensurePlaceholder('Comment', placeholderClass);
ensurePlaceholder('DocumentFragment', placeholderClass);
ensurePlaceholder('Event', class {});
ensurePlaceholder('localStorage', {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
  clear() {}
});
