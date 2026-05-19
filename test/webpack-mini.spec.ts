import { modifyMiniWebpackChain } from "../src/webpack.mini";

const Config = require("webpack-chain");

class FakePlugin {}

/**
 * 创建包含 Taro mini 基础规则/插件占位的 webpack-chain 实例。
 *
 * @returns 可传给插件修改函数的测试 chain。
 */
function createMiniChain() {
  const chain = new Config();

  chain
    .module
    .rule("script")
    .test(/\.js$/)
    .use("babelLoader")
    .loader("babel-loader")
    .options({ compact: false });

  chain.plugin("providerPlugin").use(FakePlugin, [{}]);
  chain.plugin("miniPlugin").use(FakePlugin, [{}]);

  return chain;
}

describe("mini webpack chain", () => {
  it("transpiles Svelte components and modern runtime dependencies", () => {
    const chain = createMiniChain();

    modifyMiniWebpackChain(chain);

    const svelteUses = chain.module.rule("svelte").uses.values().map((use: any) => use.toConfig());
    const scriptRule = chain.module.rule("script");
    const scriptLoader = scriptRule.use("babelLoader").toConfig();
    const modernDependencyMatcher = scriptRule.include.values().find((item: unknown) => typeof item === "function");

    expect(svelteUses.map((use: any) => use.loader)).toEqual([
      "babel-loader",
      require.resolve("../src/taroSvelteLoader"),
    ]);
    expect(svelteUses[0].options.plugins).toEqual(expect.arrayContaining([
      ["@babel/plugin-transform-private-methods", { loose: true }],
      "@babel/plugin-transform-optional-chaining",
      "@babel/plugin-transform-nullish-coalescing-operator",
    ]));

    expect(scriptLoader.options.plugins).toEqual(expect.arrayContaining([
      ["@babel/plugin-transform-private-methods", { loose: true }],
      "@babel/plugin-transform-logical-assignment-operators",
    ]));
    expect(modernDependencyMatcher("C:\\project\\node_modules\\svelte\\src\\internal\\client\\index.js")).toBe(true);
    expect(modernDependencyMatcher("C:\\project\\node_modules\\.pnpm\\svelte@5.55.5\\node_modules\\svelte\\src\\index-client.js")).toBe(true);
    expect(modernDependencyMatcher("C:\\project\\node_modules\\tarojs-plugin-svelte\\lib\\runtime.js")).toBe(true);
    expect(modernDependencyMatcher("C:\\project\\node_modules\\lodash\\index.js")).toBe(false);
  });
});
