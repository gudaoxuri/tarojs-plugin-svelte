import { getLoaderMeta } from "./loader-meta";

/**
 * 为 H5 构建注入 Svelte 所需的 webpack 配置。
 *
 * 这里主要做三件事：
 *
 * 1. 让 webpack 能识别 `.svelte` 文件。
 * 2. 优先解析包中的 `svelte` 入口条件，兼容 Svelte 5 生态包。
 * 3. 把自定义 `loaderMeta` 注入给 Taro 主插件，接管应用入口与页面入口生成逻辑。
 *
 * @param chain Taro 暴露的 webpack-chain 实例。
 */
export function modifyH5WebpackChain(chain: any) {
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

  chain.plugin("mainPlugin").tap((args: any[]) => {
    args[0].loaderMeta = getLoaderMeta();
    return args;
  });
}
