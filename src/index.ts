import type { IPluginContext } from "@tarojs/service";
import { modifyH5WebpackChain } from "./webpack.h5";
import { modifyMiniWebpackChain } from "./webpack.mini";

const { isWebPlatform } = require("@tarojs/shared");

const SVELTE_FRAMEWORK = "svelte";
const SVELTE_EXTENSION = ".svelte";

/**
 * 插件可选配置。
 */
export interface ISveltePluginOptions {
  /**
   * 是否启用插件。
   *
   * 默认启用。保留该选项主要是为了便于排查问题或做灰度切换。
   */
  enable?: boolean;
}

/**
 * 规范化 Taro runner 中的 `frameworkExts` 配置。
 *
 * Taro 4 内部会把它当作数组使用，因此这里统一转换成数组并去重。
 *
 * @param frameworkExts 原始 `frameworkExts` 配置。
 * @returns 规范化后的扩展名列表。
 */
function normalizeFrameworkExts(frameworkExts: unknown): string[] {
  if (Array.isArray(frameworkExts)) {
    return [...new Set(frameworkExts)];
  }

  if (typeof frameworkExts === "string" && frameworkExts.length > 0) {
    return [frameworkExts];
  }

  return [];
}

/**
 * Taro Svelte 插件入口。
 *
 * 从 Taro 4 开始，配置校验不再容易扩展 `framework: 'svelte'`，
 * 因此这里改成“只要插件被加载，就主动把 runner 切换到 Svelte 模式”。
 * 这样既兼容旧项目，也兼容 Taro 4 推荐的 `framework: 'none'` 配置方式。
 *
 * @param ctx Taro 插件上下文。
 * @param pluginOptions 插件可选配置。
 */
export default function sveltePlugin(
  ctx: IPluginContext,
  pluginOptions: ISveltePluginOptions = {},
) {
  if (pluginOptions.enable === false) {
    return;
  }

  ctx.modifyWebpackChain(({ chain }) => {
    chain.plugin("definePlugin").tap((args: any[]) => {
      const config = args[0];
      config.__TARO_FRAMEWORK__ = JSON.stringify(SVELTE_FRAMEWORK);
      return args;
    });

    chain.resolve.extensions.add(SVELTE_EXTENSION);

    if (isWebPlatform()) {
      modifyH5WebpackChain(chain);
    } else {
      modifyMiniWebpackChain(chain);
    }
  });

  ctx.modifyRunnerOpts(({ opts }) => {
    opts.framework = SVELTE_FRAMEWORK;
    opts.frameworkExts = [
      ...new Set([
        ...normalizeFrameworkExts(opts.frameworkExts),
        SVELTE_EXTENSION,
      ]),
    ];

    if (!opts.compiler) {
      return;
    }

    if (typeof opts.compiler === "string") {
      opts.compiler = {
        type: opts.compiler,
      };
    }

    const { compiler } = opts;

    if (compiler.type === "webpack5") {
      if (!compiler.prebundle) {
        compiler.prebundle = {};
      }

      const prebundleOptions = compiler.prebundle;
      prebundleOptions.include ||= [];
      prebundleOptions.exclude ||= [];

      /**
       * 目前 Svelte 生态在 Taro 的 webpack prebundle 场景下还缺少稳定验证，
       * 先默认关闭，保证升级后的构建链条稳定可用。
       */
      prebundleOptions.enable = false;
    }
  });
}
