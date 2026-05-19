const GLOBAL_NAMES = [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "SVGElement",
  "EventTarget",
  "Event",
  "CustomEvent",
  "HTMLMediaElement",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "queueMicrotask",
];

const originalGlobalDescriptors = new Map<string, PropertyDescriptor | undefined>();

function setGlobalValue(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobalValue(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete (globalThis as Record<string, unknown>)[name];
}

function createFakeRuntime() {
  let nextId = 0;
  let fakeDocument: FakeDocument;

  class FakeEventTarget {
    __handlers: Record<string, Function[]> = {};

    addEventListener(type: string, handler: Function) {
      (this.__handlers[type] ||= []).push(handler);
    }

    removeEventListener(type: string, handler: Function) {
      this.__handlers[type] = (this.__handlers[type] || []).filter((item) => item !== handler);
    }

    dispatchEvent(event: FakeEvent) {
      for (const handler of this.__handlers[event.type] || []) {
        handler.call(this, event);
      }

      return true;
    }
  }

  class FakeNode extends FakeEventTarget {
    parentNode: FakeNode | null = null;
    childNodes: FakeNode[] = [];
    uid = `_${++nextId}`;
    sid = this.uid;
    nodeName = "#node";
    nodeType = 0;

    get ownerDocument() {
      return fakeDocument;
    }

    get firstChild() {
      return this.childNodes[0] || null;
    }

    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }

    get nextSibling() {
      if (!this.parentNode) {
        return null;
      }

      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index + 1] || null;
    }

    get previousSibling() {
      if (!this.parentNode) {
        return null;
      }

      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index - 1] || null;
    }

    get parentElement() {
      return this.parentNode?.nodeType === 1 ? this.parentNode : null;
    }

    get textContent(): string {
      return this.childNodes.map((node) => node.textContent).join("");
    }

    set textContent(value: string) {
      this.childNodes = [];

      if (value) {
        this.appendChild(fakeDocument.createTextNode(value));
      }
    }

    insertBefore(newChild: FakeNode, refChild: FakeNode | null = null) {
      if (newChild.nodeName === "document-fragment") {
        for (const child of [...newChild.childNodes]) {
          this.insertBefore(child, refChild);
        }

        return newChild;
      }

      newChild.remove();
      newChild.parentNode = this;

      const index = refChild ? this.childNodes.indexOf(refChild) : -1;

      if (index < 0) {
        this.childNodes.push(newChild);
      } else {
        this.childNodes.splice(index, 0, newChild);
      }

      return newChild;
    }

    appendChild(newChild: FakeNode) {
      return this.insertBefore(newChild);
    }

    removeChild(child: FakeNode) {
      const index = this.childNodes.indexOf(child);

      if (index >= 0) {
        this.childNodes.splice(index, 1);
        child.parentNode = null;
      }

      return child;
    }

    remove() {
      this.parentNode?.removeChild(this);
    }

    hasChildNodes() {
      return this.childNodes.length > 0;
    }
  }

  class FakeElement extends FakeNode {
    props: Record<string, unknown> = {};
    dataset: Record<string, unknown> = {};
    style = {
      cssText: "",
      _value: {},
      _usedStyleProp: new Set<string>(),
    };

    constructor(nodeName = "view") {
      super();
      this.nodeName = nodeName;
      this.nodeType = 1;
      this.tagName = nodeName.toUpperCase();
    }

    tagName: string;

    get attributes() {
      return Object.entries(this.props).map(([name, value]) => ({ name, value }));
    }

    setAttribute(name: string, value: unknown) {
      this.props[name] = value;

      if (name.startsWith("data-")) {
        this.dataset[name.slice(5)] = value;
      }
    }

    getAttribute(name: string) {
      return this.props[name] ?? "";
    }

    removeAttribute(name: string) {
      delete this.props[name];
    }
  }

  class FakeText extends FakeNode {
    private value: string;

    constructor(value = "") {
      super();
      this.nodeName = "#text";
      this.nodeType = 3;
      this.value = value;
    }

    get data() {
      return this.value;
    }

    set data(value: string) {
      this.value = value;
    }

    get nodeValue() {
      return this.value;
    }

    set nodeValue(value: string) {
      this.value = value;
    }

    get textContent() {
      return this.value;
    }

    set textContent(value: string) {
      this.value = value;
    }
  }

  class FakeDocument extends FakeElement {
    defaultView?: unknown;

    constructor() {
      super("document");
      this.nodeType = 9;
    }

    createElement(type: string) {
      return new FakeElement(type.toLowerCase());
    }

    createElementNS(_namespace: string, type: string) {
      return this.createElement(type);
    }

    createTextNode(value = "") {
      return new FakeText(value);
    }

    createComment(value = "") {
      const comment = new FakeText(value);
      comment.nodeName = "#comment";
      return comment;
    }

    createEvent(type: string) {
      return new FakeEvent(type, { bubbles: true, cancelable: true });
    }
  }

  class FakeEvent {
    defaultPrevented = false;
    detail: unknown;
    type: string;
    bubbles: boolean;
    cancelable: boolean;

    constructor(type: string, eventInitDict: Record<string, unknown> = {}) {
      this.type = type.toLowerCase();
      this.bubbles = Boolean(eventInitDict.bubbles);
      this.cancelable = Boolean(eventInitDict.cancelable);
    }

    preventDefault() {
      this.defaultPrevented = true;
    }

    stopPropagation() {
      // noop
    }

    stopImmediatePropagation() {
      // noop
    }
  }

  const navigator = { userAgent: "TaroRuntimeTest" };
  const window = {
    navigator,
    requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
      callback(Date.now());
      return 1;
    }),
    cancelAnimationFrame: jest.fn(),
    getComputedStyle: jest.fn(() => ({ position: "static", width: "0px", height: "0px" })),
  };

  fakeDocument = new FakeDocument();
  fakeDocument.defaultView = window;

  return {
    COMMENT: "#comment",
    DOCUMENT_FRAGMENT: "document-fragment",
    TaroNode: FakeNode,
    TaroElement: FakeElement,
    TaroText: FakeText,
    SVGElement: FakeElement,
    TaroEvent: FakeEvent,
    document: fakeDocument,
    window,
    navigator,
    getComputedStyle: window.getComputedStyle,
  };
}

function loadRuntimeDomWithFakeRuntime() {
  const runtime = createFakeRuntime();

  jest.resetModules();
  jest.doMock("@tarojs/runtime", () => runtime);

  const { installGlobalShims } = require("../src/runtime/dom");

  return { runtime, installGlobalShims };
}

describe("runtime DOM shims", () => {
  beforeEach(() => {
    originalGlobalDescriptors.clear();

    for (const name of GLOBAL_NAMES) {
      originalGlobalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      setGlobalValue(name, undefined);
    }
  });

  afterEach(() => {
    jest.dontMock("@tarojs/runtime");
    jest.resetModules();

    for (const name of GLOBAL_NAMES) {
      restoreGlobalValue(name, originalGlobalDescriptors.get(name));
    }
  });

  it("installs Taro-backed DOM constructors for Svelte runtime initialization", () => {
    const { runtime, installGlobalShims } = loadRuntimeDomWithFakeRuntime();

    installGlobalShims();
    const globalObject = globalThis as Record<string, unknown>;

    expect(globalObject.window).toBe(runtime.window);
    expect(globalObject.document).toBe(runtime.document);
    expect(globalObject.Node).toBe(runtime.TaroNode);
    expect(globalObject.Element).toBe(runtime.TaroElement);
    expect(globalObject.HTMLElement).toBe(runtime.TaroElement);
    expect(globalObject.Text).toBe(runtime.TaroText);
    expect(globalObject.SVGElement).toBe(runtime.SVGElement);
    expect((runtime.window as any).Node).toBe(runtime.TaroNode);
    expect((runtime.window as any).Text).toBe(runtime.TaroText);
    expect(new runtime.TaroNode()).toBeInstanceOf(globalObject.EventTarget as Function);

    const comment = runtime.document.createComment("");
    expect(comment).toBeInstanceOf(globalObject.Comment as Function);
    expect(comment.nodeType).toBe(8);

    const fragment = (runtime.document as any).createDocumentFragment();
    expect(fragment).toBeInstanceOf(globalObject.DocumentFragment as Function);
    expect(fragment.nodeType).toBe(11);
  });

  it("provides DOM node helpers required by Svelte templates", () => {
    const { runtime, installGlobalShims } = loadRuntimeDomWithFakeRuntime();

    installGlobalShims();
    const fakeDocument = runtime.document as any;
    const root = fakeDocument.createElement("root");
    const anchor = fakeDocument.createTextNode("");

    root.appendChild(anchor);
    const block = fakeDocument.createElement("block");
    anchor.before(block);
    const tail = fakeDocument.createTextNode("tail");
    block.after(tail);

    expect(root.childNodes).toEqual([block, tail, anchor]);

    const fragment = fakeDocument.createDocumentFragment();
    fragment.append(fakeDocument.createElement("label"), "hello");

    expect(fragment.childNodes[0].parentNode).toBe(fragment);
    expect(fragment.childNodes[1]).toBeInstanceOf(runtime.TaroText);
    expect(fragment.childNodes[1].data).toBe("hello");

    const parent = fakeDocument.createElement("block");
    parent.setAttribute("class", "box");
    parent.append("hello");

    const cloned = parent.cloneNode(true);
    expect(cloned).not.toBe(parent);
    expect(cloned.getAttribute("class")).toBe("box");
    expect(cloned.firstChild.parentNode).toBe(cloned);
    expect(cloned.firstChild.data).toBe("hello");
    expect(fakeDocument.importNode(parent, true).firstChild.data).toBe("hello");
  });

  it("keeps document.createEvent compatible with initCustomEvent", () => {
    const { runtime, installGlobalShims } = loadRuntimeDomWithFakeRuntime();

    installGlobalShims();
    const event = runtime.document.createEvent("custom") as any;

    event.initCustomEvent("ready", false, false, { ok: true });

    expect(event.type).toBe("ready");
    expect(event.detail).toEqual({ ok: true });
    expect(event.eventName).toBe("ready");
  });
});
