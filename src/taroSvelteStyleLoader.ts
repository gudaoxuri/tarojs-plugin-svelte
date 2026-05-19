const svelteLoaderModule = require("svelte-loader") as {
  default?: (
    this: Record<string, any>,
    source: string,
    map?: unknown,
  ) => unknown;
} & ((this: Record<string, any>, source: string, map?: unknown) => unknown);
const svelteLoader = svelteLoaderModule.default ?? svelteLoaderModule;

interface ITaroSvelteStyleLoaderOptions {
  cssPath?: string;
  [key: string]: unknown;
}

interface ICachedStyleModule {
  code: string;
  map?: unknown;
  meta?: unknown;
}

const styleModuleCache = new Map<string, ICachedStyleModule>();

/**
 * 解析 webpack loader query 字符串。
 *
 * @param query 形如 `?cssPath=...` 的 query 字符串。
 * @returns 标准化后的配置对象。
 */
function parseQueryString(query: string): ITaroSvelteStyleLoaderOptions {
  const normalizedQuery = query.startsWith("?") ? query.slice(1) : query;
  const searchParams = new URLSearchParams(normalizedQuery);
  const options: ITaroSvelteStyleLoaderOptions = {};

  searchParams.forEach((value, key) => {
    options[key] = value;
  });

  return options;
}

/**
 * 从 loader 上下文中读取样式代理配置。
 *
 * @param loaderContext webpack loader 上下文。
 * @returns 当前 loader 配置对象。
 */
function readStyleLoaderOptions(
  loaderContext: Record<string, any>,
): ITaroSvelteStyleLoaderOptions {
  if (loaderContext.query && typeof loaderContext.query === "object") {
    return loaderContext.query;
  }

  if (typeof loaderContext.query === "string") {
    return parseQueryString(loaderContext.query);
  }

  return {};
}

/**
 * 创建传给原始 `svelte-loader` 的代理上下文。
 *
 * webpack 在某些 loader 链中会把 `query` 定义为不可配置属性，不能直接修改。
 * 因此这里创建一个以原始上下文为原型的代理对象，并在代理上提供 CSS 分支所需的
 * `query`、`getOptions` 与 `async`。
 *
 * @param loaderContext 原始 webpack loader 上下文。
 * @param cssPath Svelte 虚拟 CSS 模块路径。
 * @param fallbackStyleModule 当前 cssPath 已缓存的上一次 CSS 结果。
 * @param callback webpack loader 异步回调。
 * @returns 可传给 `svelte-loader` 的代理上下文。
 */
function createSvelteLoaderContext(
  loaderContext: Record<string, any>,
  cssPath: string,
  fallbackStyleModule: ICachedStyleModule | undefined,
  callback: (...args: any[]) => void,
): Record<string, any> {
  const svelteLoaderContext = Object.create(loaderContext);
  const styleCallback = (
    err: Error | null,
    code?: string,
    outputMap?: unknown,
    meta?: unknown,
  ) => {
    if (err) {
      callback(err);
      return;
    }

    if (typeof code !== "string") {
      if (fallbackStyleModule) {
        callback(
          null,
          fallbackStyleModule.code,
          fallbackStyleModule.map,
          fallbackStyleModule.meta,
        );
        return;
      }

      callback(
        new Error(`Svelte virtual CSS module is unavailable: ${cssPath}`),
      );
      return;
    }

    styleModuleCache.set(cssPath, {
      code,
      map: outputMap,
      meta,
    });
    callback(null, code, outputMap, meta);
  };

  Object.defineProperties(svelteLoaderContext, {
    query: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { cssPath },
    },
    getOptions: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: () => ({ cssPath }),
    },
    async: {
      configurable: true,
      enumerable: true,
      writable: true,
      value: () => styleCallback,
    },
  });

  return svelteLoaderContext;
}

/**
 * 从原始 `svelte-loader` 读取一次虚拟 CSS，并缓存结果以支持重复读取。
 *
 * @param loaderContext webpack loader 上下文。
 * @param source 上游传入的源码。
 * @param map 上游 sourcemap。
 * @param cssPath Svelte 虚拟 CSS 模块路径。
 * @param fallbackStyleModule 当前 cssPath 已缓存的上一次 CSS 结果。
 * @param callback webpack loader 异步回调。
 * @returns 原始 loader 的返回值。
 */
function readAndCacheSvelteCss(
  loaderContext: Record<string, any>,
  source: string,
  map: unknown,
  cssPath: string,
  fallbackStyleModule: ICachedStyleModule | undefined,
  callback: (...args: any[]) => void,
): unknown {
  const svelteLoaderContext = createSvelteLoaderContext(
    loaderContext,
    cssPath,
    fallbackStyleModule,
    callback,
  );

  return svelteLoader.call(svelteLoaderContext, source, map);
}

/**
 * 可重复读取的 Svelte 虚拟 CSS 代理 loader。
 *
 * 原始 `svelte-loader` 会在读取虚拟 CSS 后立即删除内部缓存；Taro 小程序端的
 * `mini-css-extract-plugin` 可能会重复读取同一 CSS 模块。本 loader 在首次读取后
 * 把 CSS 保存在插件侧缓存中；后续会优先读取 `svelte-loader` 的最新 CSS，读取不到
 * 时再回退到缓存结果，避免 watch 模式拿到过期样式。
 *
 * @param this webpack loader 上下文。
 * @param source 上游传入的源码。
 * @param map 上游 sourcemap。
 * @returns 原始 loader 的返回值或异步回调结果。
 */
function taroSvelteStyleLoader(
  this: Record<string, any>,
  source: string,
  map?: unknown,
) {
  this.cacheable?.();

  const callback = this.async();
  const { cssPath } = readStyleLoaderOptions(this);

  if (typeof cssPath !== "string" || cssPath.length === 0) {
    callback(new Error("Missing cssPath for taroSvelteStyleLoader"));
    return;
  }

  const cachedStyleModule = styleModuleCache.get(cssPath);

  return readAndCacheSvelteCss(
    this,
    source,
    map,
    cssPath,
    cachedStyleModule,
    callback,
  );
}

export default taroSvelteStyleLoader;