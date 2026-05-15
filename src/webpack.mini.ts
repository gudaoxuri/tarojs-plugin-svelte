import { getLoaderMeta } from "./loader-meta";

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

  chain.plugin("miniPlugin").tap((args: any[]) => {
    args[0].loaderMeta = getLoaderMeta();
    return args;
  });
}
