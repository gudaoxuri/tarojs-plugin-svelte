/**
 * Taro 自定义框架接入 `@tarojs/taro-loader` 时使用的元信息。
 *
 * 这些字段会被 Taro 注入到页面、应用与 H5 入口生成逻辑里，
 * 从而把默认的 React/Vue 引导过程替换成 Svelte 版本。
 */
export interface ILoaderMeta {
  importFrameworkStatement: string;
  mockAppStatement: string;
  frameworkArgs: string;
  creator: string;
  creatorLocation: string;
  extraImportForWeb: string;
  execBeforeCreateWebApp: string;
  importFrameworkName: string;
  isNeedRawLoader?: boolean;
  modifyConfig?: (config: Record<string, any>, source: string) => void;
}

/**
 * 生成当前插件提供给 Taro 的框架元信息。
 *
 * @returns 供 `loaderMeta` 使用的 Svelte 框架元信息对象。
 */
export function getLoaderMeta(): ILoaderMeta {
  return {
    importFrameworkStatement: "",
    mockAppStatement: "",
    frameworkArgs: "config",
    creator: "createSvelteApp",
    creatorLocation: "tarojs-plugin-svelte/lib/runtime",
    importFrameworkName: "",
    isNeedRawLoader: true,
    extraImportForWeb: "",
    execBeforeCreateWebApp: "",
  };
}
