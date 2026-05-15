import taroSvelteLoader from "../src/taroSvelteLoader";

jest.mock("@tarojs/webpack5-runner/dist/utils/component", () => ({
  componentConfig: {
    includes: new Set(),
  },
}));

const {
  componentConfig,
} = require("@tarojs/webpack5-runner/dist/utils/component");

/**
 * 调用自定义 Svelte loader 并返回编译结果。
 *
 * @param source 待编译的 `.svelte` 源码。
 * @returns 编译产物与依赖收集结果。
 */
function compileWithLoader(
  source: string,
): Promise<{ code: string; map: unknown; addedDependencies: Set<string> }> {
  return new Promise((resolve, reject) => {
    const addedDependencies = new Set<string>();

    const cacheableSpy = jest.fn();
    const dependencySpy = jest.fn((dependencyPath: string) => {
      addedDependencies.add(dependencyPath);
    });

    taroSvelteLoader.call(
      {
        cacheable: cacheableSpy,
        async() {
          return (err: Error | null, code: string, map: unknown) => {
            if (err) {
              reject(err);
              return;
            }

            resolve({
              code,
              map,
              addedDependencies,
            });
          };
        },
        addDependency: dependencySpy,
        emitWarning: jest.fn(),
        emitError: jest.fn(),
        resourcePath: "<nil>.svelte",
      },
      source,
      undefined,
    );

    expect(cacheableSpy).toHaveBeenCalled();
  });
}

describe("taro svelte loader", () => {
  beforeEach(() => {
    componentConfig.includes.clear();
  });

  it("should transform mini-program tags and collect used components", async () => {
    process.env.TARO_ENV = "weapp";

    const { code, map } = await compileWithLoader(
      "<t-view>hello, world</t-view>",
    );

    expect(code).toMatch(/from_tree\(\[\[['"]view['"]/);
    expect(code).not.toContain("taro-view-core");
    expect(componentConfig.includes.has("view")).toBe(true);
    expect(map).toBeTruthy();
  });

  it("should transform h5 tags into taro custom elements", async () => {
    process.env.TARO_ENV = "h5";

    const { code, map } = await compileWithLoader(
      "<t-view>hello, world</t-view>",
    );

    expect(code).toMatch(/from_tree\(\[\[['"]taro-view-core['"]/);
    expect(code).not.toContain("['view'");
    expect(map).toBeTruthy();
  });

  it("should keep tap events on mini-program builds", async () => {
    process.env.TARO_ENV = "weapp";

    const { code } = await compileWithLoader(
      "<t-view on:tap={() => {}}>hello, world</t-view>",
    );

    expect(code).toContain("$.event('tap'");
  });

  it("should rewrite tap events to click on h5 builds", async () => {
    process.env.TARO_ENV = "h5";

    const { code } = await compileWithLoader(
      "<t-view on:tap={() => {}}>hello, world</t-view>",
    );

    // 必须是真正的事件监听，而不是一个名为 `click` 的普通属性。
    expect(code).toContain("$.event('click'");
    expect(code).not.toMatch(/set_attribute\([^)]*['"]click['"]/);
    expect(code).not.toContain("'tap'");
  });
});
