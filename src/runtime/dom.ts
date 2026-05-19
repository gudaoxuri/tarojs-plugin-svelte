// @ts-nocheck

let hasInstalledGlobalShims = false;

const DOCUMENT_FRAGMENT_NODE = 11;
const COMMENT_NODE = 8;
const TEXT_NODE = 3;

function getGlobalObject() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }

  if (typeof global !== "undefined") {
    return global;
  }

  if (typeof window !== "undefined") {
    return window;
  }

  return {};
}

function addGlobalCandidate(candidates: unknown[], value: unknown) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return;
  }

  if (!candidates.includes(value)) {
    candidates.push(value);
  }
}

function getGlobalObjects(...extraCandidates: unknown[]) {
  const candidates: unknown[] = [];

  try {
    if (typeof globalThis !== "undefined") {
      addGlobalCandidate(candidates, globalThis);
    }
  } catch {
    // noop
  }

  try {
    if (typeof global !== "undefined") {
      addGlobalCandidate(candidates, global);
    }
  } catch {
    // noop
  }

  try {
    if (typeof window !== "undefined") {
      addGlobalCandidate(candidates, window);
    }
  } catch {
    // noop
  }

  try {
    addGlobalCandidate(candidates, Function("return this")());
  } catch {
    // noop
  }

  for (const candidate of extraCandidates) {
    addGlobalCandidate(candidates, candidate);
  }

  if (candidates.length === 0) {
    candidates.push(getGlobalObject());
  }

  return candidates;
}

function resolveTaroRuntime() {
  try {
    return require("@tarojs/runtime");
  } catch {
    return {};
  }
}

function defineOnObjectIfMissing(target: unknown, name: string, value: unknown) {
  if ((typeof target !== "object" && typeof target !== "function") || target === null) {
    return;
  }

  if (typeof target[name] !== "undefined") {
    return;
  }

  try {
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  } catch {
    try {
      target[name] = value;
    } catch {
      // noop
    }
  }
}

function defineGlobalIfMissing(name: string, value: unknown, ...extraTargets: unknown[]) {
  if (typeof value === "undefined" || value === null) {
    return;
  }

  for (const target of getGlobalObjects(...extraTargets)) {
    defineOnObjectIfMissing(target, name, value);
  }
}

function defineMethod(target: unknown, name: string, value: Function, override = false) {
  if (!target || (!override && typeof target[name] === "function")) {
    return;
  }

  try {
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  } catch {
    try {
      target[name] = value;
    } catch {
      // noop
    }
  }
}

function normalizeNode(document: Document, value: unknown) {
  return typeof value === "string" ? document.createTextNode(value) : value;
}

function append(...nodes: unknown[]) {
  const ownerDocument = this.ownerDocument || getGlobalObject().document;

  for (const node of nodes) {
    this.appendChild(normalizeNode(ownerDocument, node));
  }
}

function before(...nodes: unknown[]) {
  const parentNode = this.parentNode;

  if (!parentNode) {
    return;
  }

  const ownerDocument = this.ownerDocument || parentNode.ownerDocument || getGlobalObject().document;

  for (const node of nodes) {
    parentNode.insertBefore(normalizeNode(ownerDocument, node), this);
  }
}

function after(...nodes: unknown[]) {
  const parentNode = this.parentNode;

  if (!parentNode) {
    return;
  }

  const ownerDocument = this.ownerDocument || parentNode.ownerDocument || getGlobalObject().document;
  const nextSibling = this.nextSibling;

  for (const node of nodes) {
    parentNode.insertBefore(normalizeNode(ownerDocument, node), nextSibling);
  }
}

function replaceWith(...nodes: unknown[]) {
  before.call(this, ...nodes);
  this.remove();
}

function contains(node: unknown) {
  if (node === this) {
    return true;
  }

  const childNodes = this.childNodes || [];

  for (const childNode of childNodes) {
    if (childNode === node || (typeof childNode.contains === "function" && childNode.contains(node))) {
      return true;
    }
  }

  return false;
}

function createNodeClone(document: Document, sourceNode: unknown) {
  const nodeName = sourceNode.nodeName || sourceNode.tagName || "view";

  if (sourceNode.nodeType === COMMENT_NODE || nodeName === "#comment") {
    return document.createComment(sourceNode.data || sourceNode.nodeValue || sourceNode.textContent || "");
  }

  if (sourceNode.nodeType === DOCUMENT_FRAGMENT_NODE || nodeName === "document-fragment") {
    return document.createDocumentFragment();
  }

  if (sourceNode.nodeType === TEXT_NODE) {
    return document.createTextNode(sourceNode.data || sourceNode.nodeValue || sourceNode.textContent || "");
  }

  return document.createElement(String(nodeName).toLowerCase());
}

function copyElementState(sourceNode: unknown, targetNode: unknown) {
  if (sourceNode.nodeName) {
    targetNode.nodeName = sourceNode.nodeName;
  }

  if (sourceNode.tagName) {
    targetNode.tagName = sourceNode.tagName;
  }

  if (sourceNode.props && targetNode.props) {
    if (typeof targetNode.setAttribute === "function") {
      for (const key of Object.keys(sourceNode.props)) {
        targetNode.setAttribute(key, sourceNode.props[key]);
      }
    } else {
      targetNode.props = { ...sourceNode.props };
    }
  }

  if (sourceNode.dataset && targetNode.dataset) {
    targetNode.dataset = { ...sourceNode.dataset };
  }

  if (sourceNode.style && targetNode.style) {
    if (sourceNode.style.cssText) {
      targetNode.style.cssText = sourceNode.style.cssText;
    }

    if (sourceNode.style._value) {
      targetNode.style._value = { ...sourceNode.style._value };
    }

    if (sourceNode.style._usedStyleProp) {
      targetNode.style._usedStyleProp = new Set(Array.from(sourceNode.style._usedStyleProp));
    }
  }
}

function cloneNode(isDeep = false) {
  const ownerDocument = this.ownerDocument || getGlobalObject().document;
  const clonedNode = createNodeClone(ownerDocument, this);

  copyElementState(this, clonedNode);

  if (isDeep) {
    for (const childNode of this.childNodes || []) {
      clonedNode.appendChild(childNode.cloneNode(true));
    }
  }

  return clonedNode;
}

function createCommentConstructor(runtime: unknown) {
  if (!runtime.TaroText) {
    return undefined;
  }

  const commentName = runtime.COMMENT || "#comment";

  return class TaroSvelteComment extends runtime.TaroText {
    constructor(data = "") {
      super(data);
      this.nodeName = commentName;
      this.nodeType = COMMENT_NODE;
    }
  };
}

function createDocumentFragmentConstructor(runtime: unknown) {
  if (!runtime.TaroElement) {
    return undefined;
  }

  const fragmentName = runtime.DOCUMENT_FRAGMENT || "document-fragment";

  return class TaroSvelteDocumentFragment extends runtime.TaroElement {
    constructor() {
      super();
      this.nodeName = fragmentName;
      this.nodeType = DOCUMENT_FRAGMENT_NODE;
    }
  };
}

function patchDocument(document: Document, runtime: unknown) {
  const existingCommentConstructor = getGlobalObject().Comment;
  const CommentConstructor = existingCommentConstructor || createCommentConstructor(runtime);
  const DocumentFragmentConstructor = getGlobalObject().DocumentFragment || createDocumentFragmentConstructor(runtime);

  defineGlobalIfMissing("Comment", CommentConstructor, runtime.window, document.defaultView);
  defineGlobalIfMissing("DocumentFragment", DocumentFragmentConstructor, runtime.window, document.defaultView);

  if (CommentConstructor) {
    defineMethod(document, "createComment", (data = "") => new CommentConstructor(data), !existingCommentConstructor);
  }

  if (DocumentFragmentConstructor) {
    defineMethod(document, "createDocumentFragment", () => new DocumentFragmentConstructor());
  }

  defineMethod(document, "importNode", (node: Node, deep = false) => node.cloneNode(deep));

  if (!document.baseURI) {
    try {
      Object.defineProperty(document, "baseURI", {
        configurable: true,
        value: "https://taro.local/",
      });
    } catch {
      // noop
    }
  }
}

function patchNodePrototype(runtime: unknown) {
  const nodePrototype = runtime.TaroNode && runtime.TaroNode.prototype;

  if (!nodePrototype) {
    return;
  }

  defineMethod(nodePrototype, "append", append);
  defineMethod(nodePrototype, "before", before);
  defineMethod(nodePrototype, "after", after);
  defineMethod(nodePrototype, "replaceWith", replaceWith);
  defineMethod(nodePrototype, "contains", contains);
  defineMethod(nodePrototype, "cloneNode", cloneNode, true);
}

function createCustomEventConstructor(EventConstructor: Function) {
  return class TaroSvelteCustomEvent extends EventConstructor {
    constructor(type: string, eventInitDict = {}) {
      super(type, eventInitDict);
      this.detail = eventInitDict.detail;
    }
  };
}

function installTaroBackedGlobals(document: Document, runtime: unknown) {
  const windowObject = runtime.window || document.defaultView;
  const navigatorObject = runtime.navigator || (windowObject && windowObject.navigator);
  const EventConstructor = runtime.TaroEvent;
  const EventTargetPrototype = runtime.TaroNode ? Object.getPrototypeOf(runtime.TaroNode.prototype) : undefined;
  const EventTargetConstructor = EventTargetPrototype && EventTargetPrototype.constructor || runtime.TaroNode;

  const globalTargets = [windowObject, document.defaultView, runtime.env && runtime.env.window];

  defineGlobalIfMissing("window", windowObject, ...globalTargets);
  defineGlobalIfMissing("document", document, ...globalTargets);
  defineGlobalIfMissing("navigator", navigatorObject, ...globalTargets);
  defineGlobalIfMissing("Node", runtime.TaroNode, ...globalTargets);
  defineGlobalIfMissing("Element", runtime.TaroElement, ...globalTargets);
  defineGlobalIfMissing("HTMLElement", runtime.TaroElement, ...globalTargets);
  defineGlobalIfMissing("Text", runtime.TaroText, ...globalTargets);
  defineGlobalIfMissing("SVGElement", runtime.SVGElement || runtime.TaroElement, ...globalTargets);
  defineGlobalIfMissing("EventTarget", EventTargetConstructor, ...globalTargets);
  defineGlobalIfMissing("Event", EventConstructor, ...globalTargets);
  defineGlobalIfMissing("CustomEvent", EventConstructor && createCustomEventConstructor(EventConstructor), ...globalTargets);
  defineGlobalIfMissing("HTMLMediaElement", class TaroSvelteHTMLMediaElement {}, ...globalTargets);
  defineGlobalIfMissing("requestAnimationFrame", (windowObject && windowObject.requestAnimationFrame) || ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16)), ...globalTargets);
  defineGlobalIfMissing("cancelAnimationFrame", (windowObject && windowObject.cancelAnimationFrame) || ((handle: number) => clearTimeout(handle)), ...globalTargets);
  defineGlobalIfMissing("getComputedStyle", runtime.getComputedStyle || (windowObject && windowObject.getComputedStyle) || (() => ({ position: "static", width: "0px", height: "0px" })), ...globalTargets);
  defineGlobalIfMissing("queueMicrotask", (callback: VoidFunction) => Promise.resolve().then(callback), ...globalTargets);
}

/**
 * 安装 Svelte 运行时在 Taro DOM 环境下所需的最小兼容补丁。
 *
 * Svelte 5 的 client runtime 会懒初始化 DOM 操作，并直接读取
 * `Element.prototype`、`Node.prototype`、`Text.prototype` 等浏览器全局。
 * 小程序逻辑层没有这些全局名称，但 Taro runtime 提供了等价的 DOM-like
 * 类型与 `document` 实例，因此这里在不覆盖真实浏览器实现的前提下，
 * 将缺失的全局能力桥接到 Taro DOM。
 *
 * 同时，Taro 小程序端默认没有 `createDocumentFragment()`、`Node.before()`、
 * `Node.append()` 和稳定的 `cloneNode()`，这些也是 Svelte 模板运行时需要的。
 * 补齐后，Svelte 可以在 Taro 创建的根节点上正常挂载。
 */
export function installGlobalShims() {
  if (hasInstalledGlobalShims) {
    return;
  }

  const runtime = resolveTaroRuntime();
  const runtimeDocument = runtime.document || getGlobalObject().document;

  if (!runtimeDocument) {
    return;
  }

  installTaroBackedGlobals(runtimeDocument, runtime);
  patchDocument(runtimeDocument, runtime);
  patchNodePrototype(runtime);

  hasInstalledGlobalShims = true;

  if (typeof runtimeDocument.createEvent !== "function") {
    return;
  }

  const originCreateEvent = runtimeDocument.createEvent.bind(runtimeDocument);

  runtimeDocument.createEvent = function (type, node) {
    const e = originCreateEvent(type, node);

    if (e && typeof e.initCustomEvent !== "function") {
      e.initCustomEvent = (eventType, _ignored1, _ignored2, detail) => {
        try {
          e.type = eventType;
        } catch {
          // 真实浏览器环境下 `Event.type` 为只读，忽略即可。
        }
        e.detail = detail;
        e.eventName = eventType;
      };
    }

    return e;
  };
}
