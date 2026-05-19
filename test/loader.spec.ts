import taroSvelteLoader from "../src/taroSvelteLoader";
import taroSvelteStyleLoader from "../src/taroSvelteStyleLoader";

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

/**
 * 从 `svelte-loader` 生成的 CSS import 中提取虚拟 CSS 路径。
 *
 * @param code 编译后的 JS 代码。
 * @returns 虚拟 CSS 路径。
 */
function extractCssPath(code: string): string {
  const marker = "?cssPath=";
  const start = code.indexOf(marker);

  if (start < 0) {
    throw new Error("CSS import was not generated");
  }

  const cssPathStart = start + marker.length;
  const cssPathEnd = code.indexOf("!", cssPathStart);

  return code.slice(cssPathStart, cssPathEnd);
}

/**
 * 调用样式代理 loader 读取 Svelte 虚拟 CSS。
 *
 * @param cssPath Svelte 虚拟 CSS 路径。
 * @returns 读取到的 CSS 内容。
 */
function loadStyleWithLoader(cssPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    taroSvelteStyleLoader.call(
      {
        cacheable: jest.fn(),
        query: { cssPath },
        async() {
          return (err: Error | null, code: string) => {
            if (err) {
              reject(err);
              return;
            }

            resolve(code);
          };
        },
        resourcePath: cssPath,
      },
      "",
      undefined,
    );
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

  it("should not compile hyphenated mini-program components as web custom elements", async () => {
    process.env.TARO_ENV = "weapp";

    const { code } = await compileWithLoader(
      '<t-open-data type="userAvatarUrl"></t-open-data>',
    );

    expect(code).toContain("open-data");
    expect(code).toContain("set_attribute");
    expect(code).not.toContain("set_custom_element_data");
    expect(componentConfig.includes.has("open-data")).toBe(true);
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

  it("should proxy and cache emitted css for repeated mini-program extraction", async () => {
    process.env.TARO_ENV = "weapp";

    const { code } = await compileWithLoader(
      `<t-view class="box">hello</t-view>
<style>
  .box {
    width: 300px;
  }
</style>`,
    );

    expect(code).toContain("taroSvelteStyleLoader");
    expect(code).not.toContain("!=!svelte-loader?cssPath=");

    const cssPath = extractCssPath(code);
    const firstReadCss = await loadStyleWithLoader(cssPath);
    const secondReadCss = await loadStyleWithLoader(cssPath);

    expect(firstReadCss).toContain(".box");
    expect(firstReadCss).toContain("300px");
    expect(secondReadCss).toBe(firstReadCss);
  });

  it("should use latest emitted css after component style changes", async () => {
    process.env.TARO_ENV = "weapp";

    const { code: initialCode } = await compileWithLoader(
      `<t-view class="box">hello</t-view>
<style>
  .box {
    width: 100px;
  }
</style>`,
    );
    const cssPath = extractCssPath(initialCode);
    const initialCss = await loadStyleWithLoader(cssPath);

    expect(initialCss).toContain("100px");

    const { code: updatedCode } = await compileWithLoader(
      `<t-view class="box">hello</t-view>
<style>
  .box {
    width: 200px;
  }
</style>`,
    );
    const updatedCssPath = extractCssPath(updatedCode);
    const updatedCss = await loadStyleWithLoader(updatedCssPath);
    const repeatedUpdatedCss = await loadStyleWithLoader(updatedCssPath);

    expect(updatedCssPath).not.toBe(cssPath);
    expect(updatedCss).toContain("200px");
    expect(updatedCss).not.toContain("100px");
    expect(repeatedUpdatedCss).toBe(updatedCss);
  });
});
