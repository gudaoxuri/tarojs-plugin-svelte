import { createTaroSvelteMarkupPreprocess } from "./svelte-markup";

const svelteLoaderModule = require("svelte-loader") as {
  default?: (
    this: Record<string, any>,
    source: string,
    map?: string,
  ) => unknown;
} & ((this: Record<string, any>, source: string, map?: string) => unknown);
const svelteLoader = svelteLoaderModule.default ?? svelteLoaderModule;
const sveltePreprocessModule = require("svelte-preprocess") as {
  default?: (...args: any[]) => unknown;
} & ((...args: any[]) => unknown);
const sveltePreprocess =
  sveltePreprocessModule.default ?? sveltePreprocessModule;

/**
 * `svelte-loader` 接收的核心选项。
 *
 * 这里只声明插件自己会读写的字段，剩余字段保持透传，
 * 以便继续兼容 `svelte-loader` 原生支持的配置项。
 */
export interface ITaroSvelteLoaderOptions {
  emitCss?: boolean;
  compilerOptions?: Record<string, unknown>;
  preprocess?: unknown | unknown[];
  [key: string]: unknown;
}

/**
 * 将 loader 配置中的单项或数组统一转成数组。
 *
 * @param value 任意可能是数组的值。
 * @returns 标准化后的数组。
 */
function toArray<T>(value?: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
}

/**
 * 创建插件默认使用的 Svelte 预处理链。
 *
 * 预处理顺序如下：
 *
 * 1. 先把 `t-*` 标签与 `tap` 事件转换成目标平台需要的语法。
 * 2. 再交给 `svelte-preprocess` 处理 TypeScript、样式预处理等通用能力。
 *
 * @returns 标准化后的 Svelte 预处理器数组。
 */
function createDefaultPreprocessChain(): unknown[] {
  return [
    createTaroSvelteMarkupPreprocess({
      env: process.env.TARO_ENV,
    }),
    sveltePreprocess({
      typescript: {
        compilerOptions: {
          module: "ESNext",
        },
      },
    }),
  ];
}

/**
 * 这些 a11y 警告在 Taro 自定义标签上没有任何意义：
 *
 * - 小程序场景下根本没有真实 DOM，更没有键盘事件可言。
 * - H5 场景下 Taro 自己负责把 `taro-*-core` 渲染成可交互的组件。
 *
 * 全部抛给用户只会污染日志，因此在 loader 内默认静音。
 */
const SILENCED_A11Y_WARNING_CODES = new Set<string>([
  "a11y_click_events_have_key_events",
  "a11y_no_static_element_interactions",
  "a11y_no_noninteractive_element_interactions",
  "a11y_mouse_events_have_key_events",
]);

/**
 * 合并 Svelte 编译选项。
 *
 * Svelte 5 默认会优先生成基于 HTML 字符串的模板片段，
 * 小程序环境更适合使用 `fragments: 'tree'` 的树结构产物，
 * 这样可以避免依赖 `innerHTML` 路径。
 *
 * 同时注入默认的 `warningFilter`，把 Taro 自定义标签上没有意义的
 * a11y 警告过滤掉，并尽量保留用户自定义的过滤逻辑。
 *
 * @param compilerOptions 用户已有的编译选项。
 * @returns 合并后的最终编译选项。
 */
function mergeCompilerOptions(
  compilerOptions: Record<string, unknown> = {},
): Record<string, unknown> {
  const userWarningFilter = compilerOptions.warningFilter as
    | ((warning: { code: string }) => boolean)
    | undefined;

  return {
    fragments: "tree",
    ...compilerOptions,
    warningFilter(warning: { code: string }) {
      if (SILENCED_A11Y_WARNING_CODES.has(warning.code)) {
        return false;
      }

      return userWarningFilter ? userWarningFilter(warning) : true;
    },
  };
}

/**
 * 从 loader 上下文中读取当前配置。
 *
 * 在真实的 webpack 环境里，配置通常来自 `this.query`；
 * 在单元测试里则可能完全没有这些字段，因此这里要做兼容兜底。
 *
 * @param loaderContext webpack loader 上下文。
 * @returns 当前 loader 配置对象。
 */
function readLoaderOptions(
  loaderContext: Record<string, any>,
): ITaroSvelteLoaderOptions {
  if (loaderContext.query && typeof loaderContext.query === "object") {
    return loaderContext.query;
  }

  return {};
}

/**
 * 生成真正传递给 `svelte-loader` 的最终配置。
 *
 * @param baseOptions 原始 loader 配置。
 * @returns 合并后的最终配置。
 */
function createMergedLoaderOptions(
  baseOptions: ITaroSvelteLoaderOptions,
): ITaroSvelteLoaderOptions {
  return {
    ...baseOptions,
    emitCss: baseOptions.emitCss ?? true,
    compilerOptions: mergeCompilerOptions(baseOptions.compilerOptions),
    preprocess: [
      ...createDefaultPreprocessChain(),
      ...toArray(baseOptions.preprocess),
    ],
  };
}

/**
 * Taro Svelte 专用 webpack loader。
 *
 * 该 loader 复用了官方 `svelte-loader` 的绝大部分能力，仅在进入编译前，
 * 注入一层适配 Taro 的预处理器与编译选项，从而兼容 Svelte 5 和 Taro 4。
 *
 * @param this webpack loader 上下文。
 * @param source `.svelte` 文件源码。
 * @param map 上游 sourcemap。
 * @returns 由 `svelte-loader` 返回的编译结果。
 */
function taroSvelteLoader(
  this: Record<string, any>,
  source: string,
  map?: string,
) {
  const currentQuery = this.query;
  const mergedOptions = createMergedLoaderOptions(readLoaderOptions(this));

  if (currentQuery && typeof currentQuery === "object") {
    const originalEntries = new Map<
      string,
      { exists: boolean; value: unknown }
    >();

    Object.keys(mergedOptions).forEach((key) => {
      originalEntries.set(key, {
        exists: Object.prototype.hasOwnProperty.call(currentQuery, key),
        value: currentQuery[key],
      });
      currentQuery[key] = mergedOptions[key];
    });

    try {
      return svelteLoader.call(this, source, map);
    } finally {
      originalEntries.forEach((entry, key) => {
        if (entry.exists) {
          currentQuery[key] = entry.value;
        } else {
          delete currentQuery[key];
        }
      });
    }
  }

  const originalOwnQueryDescriptor = Object.prototype.hasOwnProperty.call(
    this,
    "query",
  )
    ? Object.getOwnPropertyDescriptor(this, "query")
    : undefined;

  Object.defineProperty(this, "query", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: mergedOptions,
  });

  try {
    return svelteLoader.call(this, source, map);
  } finally {
    if (originalOwnQueryDescriptor) {
      Object.defineProperty(this, "query", originalOwnQueryDescriptor);
    } else {
      delete this.query;
    }
  }
}

export default taroSvelteLoader;
