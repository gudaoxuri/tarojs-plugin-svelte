// @ts-nocheck

let hasInstalledGlobalShims = false;

/**
 * 安装 Svelte 运行时在 Taro DOM 环境下所需的最小兼容补丁。
 *
 * Taro 提供的 `document.createEvent()` 返回的是精简版事件对象，
 * 而 Svelte 运行时与部分第三方逻辑会依赖 `initCustomEvent()`。
 * 这里在不影响浏览器原生实现的前提下，补齐一层兼容能力：仅当
 * Taro DOM 返回的事件对象上缺少 `initCustomEvent` 时再注入兜底实现，
 * 避免在真实浏览器环境里去改写只读属性而抛错。
 */
export function installGlobalShims() {
  if (hasInstalledGlobalShims || typeof document === "undefined") {
    return;
  }

  hasInstalledGlobalShims = true;

  if (typeof document.createEvent !== "function") {
    return;
  }

  const originCreateEvent = document.createEvent.bind(document);

  document.createEvent = function (type, node) {
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
