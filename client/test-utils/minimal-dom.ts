const NODE_TYPE_ELEMENT = 1;
const NODE_TYPE_TEXT = 3;
const NODE_TYPE_COMMENT = 8;
const NODE_TYPE_DOCUMENT = 9;
const NODE_TYPE_FRAGMENT = 11;

type Listener = (event: MinimalEvent) => void;

type ListenerMap = Map<string, Set<Listener>>;

class MinimalEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  target: any;
  currentTarget: any;
  #stopped = false;

  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean; target?: any } = {}) {
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.cancelable = init.cancelable ?? true;
    if (init.target) {
      this.target = init.target;
    }
  }

  stopPropagation() {
    this.#stopped = true;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  get propagationStopped() {
    return this.#stopped;
  }
}

class NodeBase {
  nodeType: number;
  nodeName: string;
  parentNode: NodeBase | null = null;
  ownerDocument: DocumentNode | null = null;
  childNodes: NodeBase[] = [];

  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  appendChild<T extends NodeBase>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.childNodes.push(child);
    child.parentNode = this;
    if (!child.ownerDocument && this.ownerDocument) {
      this.ownerDocument.assignOwner(child);
    }
    return child;
  }

  removeChild<T extends NodeBase>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore<T extends NodeBase>(child: T, ref: NodeBase | null): T {
    if (!ref) {
      return this.appendChild(child);
    }
    const index = this.childNodes.indexOf(ref);
    if (index === -1) {
      return this.appendChild(child);
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    if (!child.ownerDocument && this.ownerDocument) {
      this.ownerDocument.assignOwner(child);
    }
    return child;
  }

  replaceChild<T extends NodeBase>(newChild: T, oldChild: NodeBase): NodeBase {
    this.insertBefore(newChild, oldChild);
    this.removeChild(oldChild);
    return oldChild;
  }

  get firstChild(): NodeBase | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map(child => child.textContent).join('');
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (!this.ownerDocument) {
      return;
    }
    if (value) {
      this.appendChild(this.ownerDocument.createTextNode(value));
    }
  }
}

class TextNode extends NodeBase {
  nodeValue: string;

  constructor(text: string) {
    super(NODE_TYPE_TEXT, '#text');
    this.nodeValue = text;
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value: string) {
    this.nodeValue = value;
  }
}

class CommentNode extends NodeBase {
  data: string;

  constructor(data: string) {
    super(NODE_TYPE_COMMENT, '#comment');
    this.data = data;
  }

  get textContent() {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

class ClassList {
  #owner: ElementNode;
  #set: Set<string>;

  constructor(owner: ElementNode) {
    this.#owner = owner;
    this.#set = new Set((owner.getAttribute('class') || '').split(/\s+/).filter(Boolean));
  }

  #sync() {
    this.#owner.setAttribute('class', Array.from(this.#set).join(' '));
  }

  add(...tokens: string[]) {
    tokens.forEach(token => this.#set.add(token));
    this.#sync();
  }

  remove(...tokens: string[]) {
    tokens.forEach(token => this.#set.delete(token));
    this.#sync();
  }

  contains(token: string) {
    return this.#set.has(token);
  }

  toggle(token: string, force?: boolean) {
    if (force === undefined) {
      if (this.contains(token)) {
        this.remove(token);
        return false;
      }
      this.add(token);
      return true;
    }
    if (force) {
      this.add(token);
      return true;
    }
    this.remove(token);
    return false;
  }

  toString() {
    return Array.from(this.#set).join(' ');
  }
}

class StyleDeclaration {
  #store: Record<string, string> = {};

  setProperty(name: string, value: string) {
    this.#store[name] = value;
  }

  removeProperty(name: string) {
    delete this.#store[name];
  }

  get cssText() {
    return Object.entries(this.#store).map(([key, value]) => `${key}: ${value};`).join(' ');
  }
}

class ElementNode extends NodeBase {
  tagName: string;
  attributes: Record<string, string> = {};
  style: StyleDeclaration;
  #listeners: ListenerMap = new Map();
  dataset: Record<string, string> = {};
  classList: ClassList;
  defaultValue: string | null = null;
  #value: any = '';
  checked = false;
  disabled = false;
  #options: ElementNode[] | null = null;
  selectedIndex = -1;

  constructor(tagName: string) {
    super(NODE_TYPE_ELEMENT, tagName.toUpperCase());
    this.tagName = this.nodeName;
    this.style = new StyleDeclaration();
    this.classList = new ClassList(this);
    if (this.tagName === 'SELECT') {
      this.#options = [];
    }
  }

  appendChild<T extends NodeBase>(child: T): T {
    const appended = super.appendChild(child);
    if (this.#options && appended instanceof ElementNode && appended.tagName === 'OPTION') {
      this.#options.push(appended);
      if (appended.getAttribute('selected')) {
        this.selectedIndex = this.#options.length - 1;
      }
    }
    return appended;
  }

  removeChild<T extends NodeBase>(child: T): T {
    const removed = super.removeChild(child);
    if (this.#options && child instanceof ElementNode && child.tagName === 'OPTION') {
      const optionIndex = this.#options.indexOf(child);
      if (optionIndex !== -1) {
        this.#options.splice(optionIndex, 1);
        if (this.selectedIndex === optionIndex) {
          this.selectedIndex = this.#options.length ? Math.min(optionIndex, this.#options.length - 1) : -1;
        }
      }
    }
    return removed;
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: MinimalEvent) {
    if (!event.target) {
      event.target = this;
    }
    event.currentTarget = this;
    const listeners = this.#listeners.get(event.type);
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        listener.call(this, event);
        if (event.propagationStopped) {
          break;
        }
      }
    }
    if (!event.propagationStopped && this.parentNode) {
      (this.parentNode as any).dispatchEvent?.(event);
    } else if (!event.propagationStopped && this.ownerDocument && (this as any) !== this.ownerDocument) {
      this.ownerDocument.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  setAttribute(name: string, value: any) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name === 'class' || name === 'className') {
      this.classList = new ClassList(this);
    }
    if (name === 'id') {
      (this as any).id = stringValue;
    }
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .split('-')
        .map((segment, index) => index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1))
        .join('');
      this.dataset[key] = stringValue;
    }
    if (this.#options && name === 'value') {
      this.value = stringValue;
    }
    if (name === 'disabled') {
      this.disabled = stringValue !== 'false';
    }
    if (name === 'checked') {
      this.checked = stringValue !== 'false';
    }
  }

  getAttribute(name: string) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
    if (name === 'class' || name === 'className') {
      this.classList = new ClassList(this);
    }
    if (name === 'id') {
      delete (this as any).id;
    }
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .split('-')
        .map((segment, index) => index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1))
        .join('');
      delete this.dataset[key];
    }
    if (name === 'disabled') {
      this.disabled = false;
    }
    if (name === 'checked') {
      this.checked = false;
    }
  }

  get textContent() {
    return super.textContent;
  }

  set textContent(value: string) {
    super.textContent = value;
  }

  get value(): any {
    if (!this.#options) {
      return this.#value;
    }
    if (this.selectedIndex >= 0 && this.selectedIndex < this.#options.length) {
      const option = this.#options[this.selectedIndex];
      return option.getAttribute('value') ?? option.textContent ?? '';
    }
    return '';
  }

  set value(nextValue: any) {
    if (!this.#options) {
      this.#value = nextValue;
      return;
    }
    const stringValue = String(nextValue);
    const index = this.#options.findIndex(option => {
      const optionValue = option.getAttribute('value') ?? option.textContent ?? '';
      return optionValue === stringValue;
    });
    this.selectedIndex = index;
  }

  get options(): ElementNode[] | undefined {
    return this.#options ?? undefined;
  }

  get children(): ElementNode[] {
    return this.childNodes.filter((node): node is ElementNode => node.nodeType === NODE_TYPE_ELEMENT);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  querySelectorAll(selector: string): ElementNode[] {
    const matcher = createSelectorMatcher(selector);
    const results: ElementNode[] = [];
    const visit = (node: NodeBase) => {
      if (node instanceof ElementNode && matcher(node)) {
        results.push(node);
      }
      node.childNodes.forEach(child => {
        if (child instanceof ElementNode || child.nodeType === NODE_TYPE_ELEMENT) {
          visit(child);
        }
      });
    };
    this.childNodes.forEach(child => visit(child));
    return results;
  }

  querySelector(selector: string): ElementNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  contains(node: NodeBase | null): boolean {
    if (!node) return false;
    if (node === this) return true;
    return this.childNodes.some(child => (child as ElementNode).contains?.(node));
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() { return this; } };
  }

  focus() {
    if (this.ownerDocument) {
      (this.ownerDocument as DocumentNode).activeElement = this;
    }
  }

  blur() {
    if (this.ownerDocument) {
      (this.ownerDocument as DocumentNode).activeElement = null;
    }
  }

  scrollIntoView() {}
}

class DocumentFragmentNode extends NodeBase {
  constructor() {
    super(NODE_TYPE_FRAGMENT, '#document-fragment');
  }

  dispatchEvent(event: MinimalEvent) {
    this.childNodes.forEach(child => (child as any).dispatchEvent?.(event));
    return !event.defaultPrevented;
  }
}

class DocumentNode extends ElementNode {
  defaultView: any;
  documentElement: ElementNode;
  head: ElementNode;
  body: ElementNode;
  #activeElement: ElementNode | null = null;
  #listeners: ListenerMap = new Map();

  constructor() {
    super('#document');
    this.nodeType = NODE_TYPE_DOCUMENT;
    this.ownerDocument = this;
    this.defaultView = undefined;
    this.documentElement = new ElementNode('html');
    this.documentElement.ownerDocument = this;
    this.appendChild(this.documentElement);
    this.head = new ElementNode('head');
    this.head.ownerDocument = this;
    this.body = new ElementNode('body');
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  assignOwner(node: NodeBase) {
    node.ownerDocument = this;
    if (node instanceof ElementNode || node instanceof DocumentFragmentNode) {
      node.childNodes.forEach(child => this.assignOwner(child));
    }
  }

  createElement(tagName: string) {
    const element = new ElementNode(tagName);
    element.ownerDocument = this;
    return element;
  }

  createElementNS(_ns: string, tagName: string) {
    return this.createElement(tagName);
  }

  createTextNode(text: string) {
    const node = new TextNode(text);
    node.ownerDocument = this;
    return node;
  }

  createComment(data: string) {
    const comment = new CommentNode(data);
    comment.ownerDocument = this;
    return comment;
  }

  createDocumentFragment() {
    const fragment = new DocumentFragmentNode();
    fragment.ownerDocument = this;
    return fragment;
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: MinimalEvent) {
    event.target = event.target ?? this;
    event.currentTarget = this;
    const listeners = this.#listeners.get(event.type);
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        listener.call(this, event);
        if (event.propagationStopped) {
          break;
        }
      }
    }
    return !event.defaultPrevented;
  }

  getElementById(id: string) {
    return findElement(this, element => element.getAttribute('id') === id) || null;
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string) {
    const results: ElementNode[] = [];
    const matcher = createSelectorMatcher(selector);
    traverseElements(this, element => {
      if (matcher(element)) {
        results.push(element);
      }
    });
    return results;
  }

  get activeElement(): ElementNode | null {
    return this.#activeElement;
  }

  set activeElement(element: ElementNode | null) {
    this.#activeElement = element;
  }
}

function traverseElements(node: NodeBase, visitor: (element: ElementNode) => void) {
  if (node.nodeType === NODE_TYPE_ELEMENT) {
    visitor(node as ElementNode);
  }
  node.childNodes.forEach(child => traverseElements(child, visitor));
}

function findElement(node: NodeBase, predicate: (element: ElementNode) => boolean): ElementNode | undefined {
  if (node.nodeType === NODE_TYPE_ELEMENT && predicate(node as ElementNode)) {
    return node as ElementNode;
  }
  for (const child of node.childNodes) {
    const found = findElement(child, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function createSelectorMatcher(selector: string) {
  selector = selector.trim();
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attribute = selector.slice(1, -1).split('=');
    const name = attribute[0];
    const expected = attribute[1]?.replace(/^"|"$/g, '') ?? null;
    return (element: ElementNode) => {
      if (!expected) {
        return element.getAttribute(name) !== null;
      }
      return element.getAttribute(name) === expected;
    };
  }
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return (element: ElementNode) => element.classList.contains(className);
  }
  const tagName = selector.toUpperCase();
  return (element: ElementNode) => element.tagName === tagName;
}

export interface DomEnvironment {
  window: any;
  document: DocumentNode;
}

export function setupDom(): DomEnvironment {
  const document = new DocumentNode();
  const window: any = {
    document,
    navigator: { userAgent: 'node.js' },
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    getComputedStyle: () => ({})
  };
  window.addEventListener = document.addEventListener.bind(document);
  window.removeEventListener = document.removeEventListener.bind(document);
  window.dispatchEvent = document.dispatchEvent.bind(document);
  window.scrollTo = () => {};
  window.open = () => null;
  window.localStorage = createStorage();
  window.sessionStorage = createStorage();
  window.location = {
    href: 'http://localhost/',
    origin: 'http://localhost',
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
    assign: () => {},
    replace: () => {},
    reload: () => {}
  };
  const HTMLElementShim = function HTMLElement() {};
  HTMLElementShim.prototype = ElementNode.prototype;

  const ElementShim = function Element() {};
  ElementShim.prototype = ElementNode.prototype;

  const NodeShim = function Node() {};
  NodeShim.prototype = NodeBase.prototype;

  const TextShim = function Text() {};
  TextShim.prototype = TextNode.prototype;

  const CommentShim = function Comment() {};
  CommentShim.prototype = CommentNode.prototype;

  const DocumentFragmentShim = function DocumentFragment() {};
  DocumentFragmentShim.prototype = DocumentFragmentNode.prototype;

  const HTMLIFrameElementShim = function HTMLIFrameElement() {};
  HTMLIFrameElementShim.prototype = ElementNode.prototype;

  window.HTMLElement = HTMLElementShim as any;
  window.Element = ElementShim as any;
  window.Node = NodeShim as any;
  window.Text = TextShim as any;
  window.Comment = CommentShim as any;
  window.DocumentFragment = DocumentFragmentShim as any;
  window.HTMLIFrameElement = HTMLIFrameElementShim as any;
  window.Event = MinimalEvent;
  document.defaultView = window;
  assignGlobals(window, document);
  return { window, document };
}

export function cleanupDom() {
  if (globalThis.document && globalThis.document.body) {
    const body = globalThis.document.body as ElementNode;
    body.childNodes.slice().forEach((child: any) => {
      body.removeChild(child);
    });
  }
}

function assignGlobals(window: any, document: DocumentNode) {
  defineGlobal('window', window);
  defineGlobal('document', document);
  defineGlobal('navigator', window.navigator);
  defineGlobal('location', window.location);
  defineGlobal('HTMLElement', window.HTMLElement);
  defineGlobal('Element', window.Element);
  defineGlobal('Node', window.Node);
  defineGlobal('Text', window.Text);
  defineGlobal('Comment', window.Comment);
  defineGlobal('DocumentFragment', window.DocumentFragment);
  defineGlobal('Event', MinimalEvent);
  defineGlobal('HTMLIFrameElement', window.HTMLIFrameElement);
  defineGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  defineGlobal('requestAnimationFrame', window.requestAnimationFrame);
  defineGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
}

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

export { ElementNode, MinimalEvent };

function defineGlobal(key: string, value: any) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value
  });
}
