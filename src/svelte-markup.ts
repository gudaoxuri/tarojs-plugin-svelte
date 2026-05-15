import MagicString from "magic-string";
import { parse } from "svelte/compiler";
import { getTaroComponentConfig } from "./component-config";

/**
 * Svelte 预处理器的 `markup` 回调入参。
 */
export interface ISvelteMarkupPreprocessInput {
  content: string;
  filename?: string;
}

/**
 * Taro Svelte 模板转换配置。
 */
export interface ITaroSvelteTransformOptions {
  env?: string;
  filename?: string;
}

/**
 * 单次模板转换结果。
 */
export interface ITaroSvelteMarkupTransformResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]> | null;
  components: string[];
}

/**
 * 判断当前是否为 H5 构建。
 *
 * @param env 当前 `TARO_ENV`。
 * @returns 若为 H5 构建返回 `true`。
 */
function isH5Build(env?: string): boolean {
  return env === "h5";
}

/**
 * 将 `t-*` 标签名转换成 Taro 运行时真正需要的标签名。
 *
 * - 小程序端：`t-view` -> `view`
 * - H5 端：`t-view` -> `taro-view-core`
 *
 * @param tagName Svelte 模板中的原始标签名。
 * @param env 当前 `TARO_ENV`。
 * @returns 转换后的标签名。
 */
function resolvePlatformTagName(tagName: string, env?: string): string {
  const rawTagName = tagName.slice(2);
  return isH5Build(env) ? `taro-${rawTagName}-core` : rawTagName;
}

/**
 * 覆盖元素的开始与结束标签名。
 *
 * Svelte 解析后的 HTML AST 会保留元素起止位置，因此这里可以精准替换标签名，
 * 而不必依赖脆弱的正则全局替换。
 *
 * @param source 原始 Svelte 源码。
 * @param magic `MagicString` 实例。
 * @param nodeStart 元素起始位置。
 * @param nodeEnd 元素结束位置。
 * @param previousName 原始标签名。
 * @param nextName 目标标签名。
 */
function overwriteElementTagName(
  source: string,
  magic: MagicString,
  nodeStart: number,
  nodeEnd: number,
  previousName: string,
  nextName: string,
): void {
  const openingTagStart = nodeStart + 1;
  magic.overwrite(
    openingTagStart,
    openingTagStart + previousName.length,
    nextName,
  );

  const closingTag = `</${previousName}>`;
  const closingTagStart = nodeEnd - closingTag.length;

  if (source.slice(nodeEnd - 2, nodeEnd) === "/>") {
    magic.overwrite(nodeEnd - 2, nodeEnd, `></${nextName}>`);
    return;
  }

  if (source.slice(closingTagStart, nodeEnd) === closingTag) {
    magic.overwrite(
      closingTagStart + 2,
      closingTagStart + 2 + previousName.length,
      nextName,
    );
  }
}

/**
 * 递归遍历 Svelte 的 HTML AST。
 *
 * 这里只处理普通对象与数组，忽略原始值。Svelte AST 是无环结构，因此可以直接递归。
 *
 * @param node 当前遍历节点。
 * @param visitor 节点访问器。
 */
function walkMarkupAst(
  node: unknown,
  visitor: (node: Record<string, any>) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walkMarkupAst(child, visitor));
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const astNode = node as Record<string, any>;
  visitor(astNode);

  Object.keys(astNode).forEach((key) => {
    walkMarkupAst(astNode[key], visitor);
  });
}

/**
 * 对 Svelte 模板源码进行平台化转换。
 *
 * 这个过程发生在 Svelte 编译之前，因此不依赖 Svelte 私有编译产物结构，
 * 能显著降低 Svelte 主版本升级带来的破坏性影响。
 *
 * @param source `.svelte` 文件源码。
 * @param options 转换配置。
 * @returns 转换后的代码、sourcemap 与收集到的小程序组件名。
 */
export function transformTaroSvelteMarkup(
  source: string,
  options: ITaroSvelteTransformOptions = {},
): ITaroSvelteMarkupTransformResult {
  const magic = new MagicString(source);
  const ast = parse(source);
  const components = new Set<string>();

  walkMarkupAst(ast.html, (node) => {
    if (node.type !== "Element" || typeof node.name !== "string") {
      return;
    }

    if (node.name.startsWith("t-")) {
      const nextName = resolvePlatformTagName(node.name, options.env);
      overwriteElementTagName(
        source,
        magic,
        node.start,
        node.end,
        node.name,
        nextName,
      );

      if (!isH5Build(options.env)) {
        components.add(nextName);
      }
    }

    if (!isH5Build(options.env) || !Array.isArray(node.attributes)) {
      return;
    }

    node.attributes.forEach((attribute: Record<string, any>) => {
      if (
        attribute?.type !== "EventHandler" ||
        attribute.name !== "tap"
      ) {
        return;
      }

      // 在 Svelte 5 的 legacy AST 中，`name_loc` 的范围覆盖整个 `on:tap`
      // 前缀，直接整体覆盖会把 `on:` 前缀一并吃掉，最终生成的不是事件监听
      // 而是一个名为 `click` 的普通属性，导致 H5 端的 tap 事件失效。
      // 这里改为按事件名计算覆盖范围，确保仅替换 `tap` 自身。
      const attributeStart =
        typeof attribute.start === "number" ? attribute.start : null;

      if (attributeStart === null) {
        return;
      }

      const eventNameStart = attributeStart + "on:".length;
      const eventNameEnd = eventNameStart + attribute.name.length;

      if (source.slice(eventNameStart, eventNameEnd) !== attribute.name) {
        return;
      }

      magic.overwrite(eventNameStart, eventNameEnd, "click");
    });
  });

  const map = magic.hasChanged()
    ? magic.generateMap({
        ...(options.filename ? { file: options.filename } : {}),
        includeContent: true,
        hires: true,
      })
    : null;

  return {
    code: magic.toString(),
    map,
    components: [...components],
  };
}

/**
 * 创建供 `svelte-loader` 使用的 `markup` 预处理器。
 *
 * @param options 平台转换配置。
 * @returns 可直接传给 `svelte.preprocess` 的预处理器对象。
 */
export function createTaroSvelteMarkupPreprocess(
  options: ITaroSvelteTransformOptions = {},
) {
  return {
    markup({ content, filename }: ISvelteMarkupPreprocessInput) {
      const result = transformTaroSvelteMarkup(content, {
        ...options,
        filename,
      });

      if (!isH5Build(options.env) && result.components.length > 0) {
        const componentConfig = getTaroComponentConfig();
        result.components.forEach((componentName) => {
          componentConfig.includes.add(componentName);
        });
      }

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}
