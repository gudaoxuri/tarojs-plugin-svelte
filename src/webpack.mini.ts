import { getLoaderMeta } from "./loader-meta";

/**
 * 判断文件是否来自需要额外转译的现代语法依赖。
 *
 * Taro mini 默认只编译应用源码和 Taro 自身依赖，Svelte 5 的运行时源码
 * 会以 `?.`、`??` 等现代语法进入最终包，微信开发者工具预览阶段会按
 * 上传规则做静态校验并拒绝这些语法。因此这里把 Svelte 与插件运行时
 * 加回 Babel 处理范围。
 *
 * @param filename webpack 当前模块文件名。
 * @returns 需要经过 Babel 转译时返回 `true`。
 */
function isModernDependency(filename: string) {
  if (typeof filename !== "string") {
    return false;
  }

  const normalized = filename.replace(/\\/g, "/");

  return /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?svelte\//.test(normalized) ||
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?tarojs-plugin-svelte\//.test(normalized);
}

const svelteRuntimeBabelPlugins = [
  ["@babel/plugin-transform-class-properties", { loose: true }],
  ["@babel/plugin-transform-private-methods", { loose: true }],
  ["@babel/plugin-transform-private-property-in-object", { loose: true }],
  "@babel/plugin-transform-optional-chaining",
  "@babel/plugin-transform-nullish-coalescing-operator",
  "@babel/plugin-transform-logical-assignment-operators",
];

/**
 * 补齐 Taro 默认 Babel 配置没有开启、但 Svelte 5 runtime 会使用的语法转换。
 *
 * @param options 原 babel-loader options。
 * @returns 合并后的 babel-loader options。
 */
function addSvelteRuntimeBabelPlugins(options: any = {}) {
  const plugins = Array.isArray(options.plugins) ? options.plugins : [];
  const pluginNames = new Set(plugins.map((plugin: any) => Array.isArray(plugin) ? plugin[0] : plugin));
  const nextPlugins = [...plugins];

  for (const plugin of svelteRuntimeBabelPlugins) {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;

    if (!pluginNames.has(pluginName)) {
      nextPlugins.push(plugin);
    }
  }

  return {
    ...options,
    plugins: nextPlugins,
  };
}

/**
 * 为小程序构建注入 Svelte 所需的 webpack 配置。
 *
 * 与 H5 构建类似，这里会注册 `.svelte` loader，并把框架适配信息
 * 注入给 Taro 的 mini 插件。
 *
 * @param chain Taro 暴露的 webpack-chain 实例。
 */
export function modifyMiniWebpackChain(chain: any) {
  if (typeof chain.resolve.mainFields?.prepend === "function") {
    chain.resolve.mainFields.prepend("svelte");
  }

  if (typeof chain.resolve.conditionNames?.add === "function") {
    chain.resolve.conditionNames.add("svelte");
  }

  chain.module
    .rule("svelte")
    .test(/\.svelte$/i)
    .use("taroSvelteLoader")
    .loader(require.resolve("./taroSvelteLoader"))
    .options({
      emitCss: true,
    });

  chain.module
    .rule("svelte")
    .use("babelLoader")
    .loader("babel-loader")
    .options(addSvelteRuntimeBabelPlugins({ compact: false }))
    .before("taroSvelteLoader");

  chain.module.rule("script").include.add(isModernDependency);
  chain.module.rule("script").use("babelLoader").tap(addSvelteRuntimeBabelPlugins);

  chain.plugin("providerPlugin").tap((args: any[]) => {
    const providers = args[0] || {};

    /**
     * Svelte 5 的浏览器运行时会直接读取 `Node.prototype` 和
     * `Text.prototype`。Taro mini 端默认只通过 ProvidePlugin 注入了
     * `Element`，微信 JSCore 中运行时写入 global 的变量又不一定能被
     * webpack 模块里的裸标识符稳定读取，因此这里在编译期补上缺失的
     * DOM 构造器映射。其余运行时能力由 `runtime/dom` 在 Taro DOM 上补齐，
     * 避免把不精确的 Web API 映射继续塞进 webpack 全局注入。
     */
    providers.Node ||= ["@tarojs/runtime", "TaroNode"];
    providers.Text ||= ["@tarojs/runtime", "TaroText"];

    args[0] = providers;
    return args;
  });

  chain.plugin("miniPlugin").tap((args: any[]) => {
    args[0].loaderMeta = getLoaderMeta();
    return args;
  });
}
