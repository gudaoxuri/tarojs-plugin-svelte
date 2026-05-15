import { flushSync, mount, unmount, type Component } from "svelte";
import { installGlobalShims } from "./dom";

const { hooks } = require("@tarojs/shared");
const { Current, document } = require("@tarojs/runtime");

installGlobalShims();

const [ONLAUNCH, ONSHOW, ONHIDE] = hooks.call("getMiniLifecycleImpl").app;

/**
 * 已挂载页面实例的内部记录。
 */
interface ISvelteMountedPage {
  instance: Record<string, any>;
  target: Element;
}

/**
 * Taro `app.js` 导出的可选生命周期对象。
 */
export interface ITaroSvelteAppInstance {
  onLaunch?: (options: Record<string, any>) => void;
  onShow?: (options: Record<string, any>) => void;
  onHide?: (options: Record<string, any>) => void;
  onError?: (error: string) => void;
  onUnhandledRejection?: (error: unknown) => void;
  onPageNotFound?: (payload: Record<string, any>) => void;
}

let container: HTMLElement | null = null;

/**
 * 获取 H5 页面容器，不存在时自动补建。
 *
 * @param appId Taro H5 应用挂载点 ID。
 * @returns 实际用于承载页面节点的容器元素。
 */
function ensureAppContainer(appId: string): HTMLElement {
  const existedContainer = document.getElementById(appId);
  if (existedContainer) {
    return existedContainer;
  }

  const createdContainer = document.createElement("div") as HTMLElement;
  createdContainer.id = appId;
  (document.body || document.documentElement).appendChild(createdContainer);
  return createdContainer;
}

/**
 * 为页面创建真正的挂载根节点。
 *
 * - H5 使用常规 `div`，并补上 `taro_page` 类名。
 * - 小程序端继续使用 Taro DOM 的 `root` 节点。
 *
 * @param id Taro 分配的页面 ID。
 * @returns Svelte `mount` 所需的挂载目标节点。
 */
function createPageTarget(id: string): Element {
  if (process.env.TARO_ENV === "h5") {
    const root = document.createElement("div") as HTMLElement;
    root.id = id;
    root.className = "taro_page";
    container?.appendChild(root);
    return root;
  }

  const root = document.createElement("root");
  root.id = id;
  return root;
}

/**
 * 创建供 Taro 运行时调用的 Svelte 应用桥接对象。
 *
 * Taro 只关心两个能力：
 *
 * 1. 在页面进入时挂载一个页面组件。
 * 2. 在页面离开时卸载它。
 *
 * Svelte 5 已经不再通过类实例化组件，因此这里改为使用 `mount` / `unmount`。
 * 同时借助 `flushSync()` 保持与旧实现接近的同步挂载时序。
 *
 * @param app `app.js` 导出的应用生命周期对象。
 * @param config Taro 读取到的应用配置。
 * @returns 交给 Taro 的应用桥接对象。
 */
export function createSvelteApp(
  app: ITaroSvelteAppInstance | undefined,
  config: Record<string, any>,
) {
  const pages = new Map<string, ISvelteMountedPage>();

  const appConfig = {
    config,

    mount(Page: Component<any>, id: string, cb: () => void) {
      const target = createPageTarget(id);
      const instance = mount(Page, {
        target,
      }) as Record<string, any>;

      pages.set(id, {
        instance,
        target,
      });

      flushSync();
      cb();
    },

    unmount(id: string, cb: () => void) {
      const mountedPage = pages.get(id);
      pages.delete(id);

      if (!mountedPage) {
        cb();
        return;
      }

      Promise.resolve(unmount(mountedPage.instance)).finally(() => {
        if (process.env.TARO_ENV === "h5") {
          mountedPage.target.parentNode?.removeChild(mountedPage.target);
        }
        cb();
      });
    },

    [ONLAUNCH](options: Record<string, any>) {
      if (process.env.TARO_ENV === "h5") {
        const appId = config?.appId || "app";
        container = ensureAppContainer(appId);
      }

      app?.onLaunch?.(options);
    },

    [ONSHOW](options: Record<string, any>) {
      app?.onShow?.(options);
    },

    [ONHIDE](options: Record<string, any>) {
      app?.onHide?.(options);
    },

    onError(error: string) {
      app?.onError?.(error);
    },

    onUnhandledRejection(error: unknown) {
      app?.onUnhandledRejection?.(error);
    },

    onPageNotFound(payload: Record<string, any>) {
      app?.onPageNotFound?.(payload);
    },
  };

  Current.app = appConfig;

  return appConfig;
}
