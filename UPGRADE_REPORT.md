# tarojs-plugin-svelte 升级报告

检索时间：2026-05-11
复核时间：2026-05-14（Svelte 5.55.5 + Taro 4.2.0 落地后的补充复核）

> 文档分为两部分：
>
> - 第 1–8 节：升级前的目标版本调研与改造方案（首版结论）。
> - 第 9 节：升级落地后的代码复核、修正记录与验证结果。

## 1. 当前项目基线

### 插件本体

- 当前版本：`2.0.2`
- 当前 Svelte：`4.0.0`
- 当前 Taro 相关开发依赖：`3.6.5`
  - `@tarojs/runtime`
  - `@tarojs/service`
  - `@tarojs/shared`
  - `@tarojs/webpack5-runner`
- 当前 Node 固定版本：`18.13.0`
- 当前 TypeScript：`4.9.5`

### 示例项目

- `example/package.json` 仍停留在 `Taro 3.5.11`
- 示例项目依赖版本比插件本体更旧，升级时需要一并对齐

### 当前实现的核心特征

1. `src/taroSvelteLoader.ts` 依赖 Svelte 4 编译产物内部结构，按 AST 重写编译后的 JS：
   - 识别 `svelte/internal`
   - 识别 `element(...)`
   - 识别 `listen(...)`
   - 将 `t-*` 标签改成 Taro 所需标签
   - 将 H5 的 `tap` 改成 `click`
2. `src/runtime/connect.ts` 依赖 Svelte 4 组件类 API：
   - `new Page(options)`
   - `page.$destroy()`
3. 项目使用 `patch-package` 修改了 `svelte@4.0.0` 的编译器行为：
   - `patches/svelte+4.0.0.patch`
   - 目的本质上是限制小程序端使用 `innerHTML`
4. `src/index.ts` 通过修改 `@tarojs/cli/dist/doctor/configSchema` 的方式，把 `framework: 'svelte'` 注入 Taro 配置校验

---

## 2. 联网检索到的目标版本

### Svelte 相关

- `svelte` 最新版：`5.55.5`
- `svelte-loader` 最新版：`3.2.4`
- `svelte-preprocess` 最新版：`6.0.3`

### Taro 相关

- `@tarojs/cli` 最新版：`4.2.0`
- `@tarojs/runtime` 最新版：`4.2.0`
- `@tarojs/service` 最新版：`4.2.0`
- `@tarojs/shared` 最新版：`4.2.0`
- `@tarojs/webpack5-runner` 最新版：`4.2.0`

### 运行环境要求

- Taro 4.x：Node `>= 18`
- Svelte 5：Node `>= 18`
- `svelte-preprocess@6`：Node `>= 18`，并要求 TypeScript `^5`

结论：Node 版本门槛本项目已经满足，但如果切到 `svelte-preprocess@6`，则 TypeScript 也应同步升到 `5.x`。

---

## 3. 关键版本差异

## 3.1 Svelte 4 → Svelte 5

### 已确认的关键变化

1. 组件不再是 class，而是 function
   - Svelte 4：`new Component(...)`
   - Svelte 5：推荐 `mount(...)` / `unmount(...)`
2. 兼容模式仍可保留旧组件 API
   - 可通过 `compilerOptions.compatibility.componentApi = 4` 继续兼容旧式实例化方式
3. 事件与编译产物内部结构变化很大
   - Svelte 4 时代常见内部 helper：`element`、`listen`
   - Svelte 5 编译产物改为：
     - `import * as $ from 'svelte/internal/client'`
     - `$.event(...)`
     - `$.from_html(...)` 或 `$.from_tree(...)`
4. 仍支持旧语法的过渡期兼容
   - `on:click` 这类旧写法仍可用
   - 但官方方向是逐步迁移到新事件属性风格
5. 官方提供了新的编译选项来规避基于 HTML 字符串的 fragment 构造
   - `compilerOptions.fragments = 'tree'`
   - 这会让编译产物更偏向 `from_tree(...)`，而不是 `from_html(...)`

### 对本项目最关键的影响

- 现有 `taroSvelteLoader.ts` 基于 Svelte 4 编译内部实现做 JS 后处理，升级到 Svelte 5 后几乎必然失效
- 现有 `patch-package` 直接改 Svelte 4 编译器文件，也不能直接沿用到 Svelte 5
- 现有 `connect.ts` 对 `new Page(...)` 与 `$destroy()` 的依赖，必须改造或先走兼容模式

## 3.2 Taro 3.6 → Taro 4.x

### 已确认的关键变化

1. Node 要求统一提升到 `>= 18`
2. Taro 4 仍保留当前插件依赖的主要扩展点
   - `modifyWebpackChain`
   - `modifyRunnerOpts`
   - `loaderMeta`
   - `mainPlugin`
   - `miniPlugin`
3. `frameworkExts` 在 Taro 4 中按数组使用更稳妥
   - 当前插件写的是字符串：`.svelte`
   - Taro 4 部分内部逻辑会按数组展开处理，建议改为 `['.svelte']`
4. 配置校验机制发生变化
   - 旧代码依赖的 `@tarojs/cli/dist/doctor/configSchema` 在 Taro 4 中已不再是当前方案
   - Taro 4 构建前配置校验由 `@tarojs/plugin-doctor` 承担
5. 当前自定义 `framework: 'svelte'` 的注入方式，Taro 4 下大概率不再成立

### 对本项目最关键的影响

- Webpack / Runner 接入层不是最大的风险点，配置校验才是
- 继续把插件激活条件绑死在 `framework === 'svelte'` 上，Taro 4 下会很脆弱
- 更合理的做法是：插件自己接管激活逻辑，并在 Runner 层把 `framework` / `frameworkExts` 写回去

---

## 4. 对当前代码的直接影响分析

## 4.1 `src/taroSvelteLoader.ts`

### 当前做法

- 在 Svelte 编译完成后，解析生成代码 AST
- 查找 `svelte/internal`
- 查找 `element(...)` 与 `listen(...)`
- 动态改写标签与事件名

### 升级后问题

Svelte 5 编译产物已经不是这套结构，典型表现为：

- 内部导入路径不再是 `svelte/internal`
- 创建节点不再是 `element(...)`
- 绑定事件不再是 `listen(...)`
- 会变成 `$.event(...)`、`$.from_html(...)`、`$.from_tree(...)`

### 结论

`src/taroSvelteLoader.ts` 不能简单修修补补，需要重构。

### 推荐方案

不要继续依赖 Svelte 私有编译产物结构，改成“源码级”或“预处理级”的转换：

1. 在 Svelte 编译前转换标签
   - 小程序端：`t-view` → `view`
   - H5 端：`t-view` → `taro-view-core`
2. 在 Svelte 编译前转换事件
   - H5 端：`on:tap` → `on:click`
3. 在预处理阶段收集小程序端组件名，并写入 `componentConfig.includes`

推荐实现方式：自定义 Svelte `markup` preprocess，而不是继续去改编译后的 JS。

## 4.2 `src/runtime/connect.ts`

### 当前做法

- `new Page(options)`
- `page.$destroy()`

### 升级后问题

Svelte 5 推荐 API 已变成：

- `mount(Component, options)`
- `unmount(instance)`

### 两种可行路径

#### 路径 A：先走兼容模式

在 Svelte 5 编译选项里打开：

- `compatibility.componentApi = 4`

这样可以先保留旧的类组件调用方式，降低一次性改造成本。

#### 路径 B：直接改成原生 Svelte 5 写法

把 `createSvelteApp` 改成：

- 使用 `mount(...)`
- 卸载时使用 `unmount(...)`

### 结论

为了降低迁移风险，建议先走路径 A，再在第二阶段切到路径 B。

## 4.3 `patches/svelte+4.0.0.patch`

### 当前做法

- 直接 patch `svelte/compiler.cjs`
- 把 `can_use_innerhtml` 改成只在 H5 为 true

### 升级后问题

- 该 patch 只对应 `svelte@4.0.0`
- Svelte 5 编译器结构已经不同
- 继续维护这种 patch 成本极高

### 推荐替代方案

在 Svelte 5 中优先尝试官方编译选项：

- `compilerOptions.fragments = 'tree'`

它更符合当前插件诉求：尽量避免依赖 HTML 字符串生成 fragment。

### 结论

Svelte 5 升级后，应移除这份 patch，而不是继续维护新的 patch。

## 4.4 `src/index.ts`

### 当前做法

- 通过修改 `@tarojs/cli/dist/doctor/configSchema`，把 `framework: 'svelte'` 注入校验
- 仅当 `ctx.initialConfig.framework === 'svelte'` 时启用插件
- `opts.frameworkExts = '.svelte'`

### 升级后问题

1. Taro 4 下旧 `configSchema` 路径不再可靠
2. 插件启用条件过度依赖 `framework: 'svelte'`
3. `frameworkExts` 用字符串不够稳妥

### 推荐方案

1. 取消对旧 `configSchema` 的 monkey patch 依赖
2. 把插件激活条件改为更明确的插件配置或双兼容策略
   - Taro 3：保留 `framework: 'svelte'`
   - Taro 4：建议改为插件主动接管
3. Runner 配置统一改成：
   - `opts.framework = 'svelte'`
   - `opts.frameworkExts = ['.svelte']`

### 结论

`src/index.ts` 是 Taro 4 迁移的关键入口文件，需要重构激活逻辑。

## 4.5 `src/webpack.h5.ts` 与 `src/webpack.mini.ts`

### 当前做法

- 只传了 `emitCss` 与 `preprocess`
- 没有显式传入 Svelte 5 兼容相关编译选项

### 升级后建议

在 loader 配置中显式传入：

- `compilerOptions.fragments = 'tree'`
- `compilerOptions.compatibility.componentApi = 4`

如果先走兼容过渡期，这两项非常关键。

---

## 5. 推荐的升级路线

## 路线结论

不建议一次性“直接改到位”。

推荐按三个阶段实施，每个阶段都保证可验证、可回滚。

## 阶段 1：先把 Taro 侧升级到 4.x

### 目标

先解决 Taro 4 的配置校验、Runner 接入、示例工程对齐问题。

### 主要动作

1. 所有 Taro 依赖统一升到 `4.2.0`
2. 示例工程全部对齐到 `4.2.0`
3. 重构 `src/index.ts`
   - 不再依赖旧 `configSchema` patch
   - 改造插件激活机制
   - 把 `frameworkExts` 改成数组
4. 验证当前 Svelte 4 方案在 Taro 4 下是否还能跑通

### 收益

- 先减少一个变量
- 能把 Taro 4 的不确定性与 Svelte 5 的不确定性拆开处理

## 阶段 2：切换到 Svelte 5，但先保留兼容层

### 目标

在不立即重写运行时 API 的前提下，让 Svelte 5 跑起来。

### 主要动作

1. `svelte` 升到 `5.55.5`
2. `svelte-loader` 升到 `3.2.4`
3. `svelte-preprocess` 升到 `6.0.3`
4. `typescript` 升到 `5.x`
5. 在 `webpack.h5.ts` / `webpack.mini.ts` 中加入：
   - `fragments = 'tree'`
   - `compatibility.componentApi = 4`
6. 删除 `patch-package` 与 `svelte+4.0.0.patch`

### 收益

- 先用官方兼容层承接 Svelte 5 语义变化
- 不需要第一步就改 `connect.ts`

## 阶段 3：重构 Loader 与 Runtime，真正落到 Svelte 5 原生模型

### 目标

去掉对 Svelte 私有内部实现的依赖。

### 主要动作

1. 重写 `src/taroSvelteLoader.ts`
   - 从“编译后 JS AST 改写”切换到“源码 preprocess 改写”
2. 重写 `src/runtime/connect.ts`
   - 从 `new Page(...)` / `$destroy()` 切到 `mount(...)` / `unmount(...)`
3. 视情况移除 `compatibility.componentApi = 4`

### 收益

- 插件将不再强依赖 Svelte 内部 helper 名称
- 后续维护成本显著下降

---

## 6. 文件级改造建议

### `package.json`

建议变更：

- Taro 全家桶升级到 `4.2.0`
- `svelte` 升到 `5.55.5`
- `svelte-loader` 升到 `3.2.4`
- `svelte-preprocess` 升到 `6.0.3`
- `typescript` 升到 `5.x`
- 如果不再需要 patch，删除：
  - `patch-package`
  - `postinstall`

### `src/index.ts`

建议变更：

- 删除旧 `configSchema` 方案
- 改造插件启用条件
- 对 Taro 4 明确设置：
  - `opts.framework = 'svelte'`
  - `opts.frameworkExts = ['.svelte']`
- 保留 `prebundle.enable = false` 的保守策略，待 Svelte 5 稳定后再评估是否开启

### `src/taroSvelteLoader.ts`

建议变更：

- 不再依赖 `svelte/internal`
- 不再依赖 `element(...)` / `listen(...)`
- 改成 preprocess 级别的标签与事件转换
- 继续收集 `componentConfig.includes`

### `src/webpack.h5.ts`

建议变更：

- 补充 Svelte 5 编译选项
- 继续注入 `loaderMeta`

### `src/webpack.mini.ts`

建议变更：

- 补充 Svelte 5 编译选项
- 继续注入 `loaderMeta`

### `src/runtime/connect.ts`

建议变更：

- 第一阶段可以不改，仅靠兼容层过渡
- 最终阶段应切换为 `mount` / `unmount`

### `example/package.json`

建议变更：

- 所有 Taro 依赖对齐到 `4.2.0`
- 清理不再必要的旧模板残留依赖
- 重新验证 `weapp` 与 `h5` 两条链路

### `README.md`

建议变更：

- 更新安装要求
- 更新 Node 版本要求
- 更新 Taro 4 配置方式
- 如果 Taro 4 不再推荐用户写 `framework: 'svelte'`，文档必须同步调整

---

## 7. 风险清单

## 高风险

1. `taroSvelteLoader.ts` 当前实现与 Svelte 5 编译内部强耦合
2. `patch-package` 当前只适配 `svelte@4.0.0`
3. Taro 4 的配置校验与 `framework: 'svelte'` 冲突

## 中风险

1. `connect.ts` 从类组件 API 迁到函数组件 API
2. `svelte-preprocess@6` 带来的 TypeScript 5 升级影响
3. 示例工程版本过旧，升级后可能出现额外问题

## 低风险

1. Taro 4 的 `modifyWebpackChain` / `modifyRunnerOpts` / `loaderMeta` 仍可沿用
2. `mainPlugin` / `miniPlugin` 仍然可用
3. Node 版本门槛本项目已满足

---

## 8. 最终结论

### 可行性判断

可以升级到 Svelte 5 + 最新 Taro 4.x，但不能只做依赖版本号升级，必须同步改造以下三块：

1. Taro 4 配置与插件激活机制
2. Svelte 编译前后的标签/事件转换机制
3. Svelte 4 旧组件实例 API 到 Svelte 5 新运行时 API 的过渡

### 推荐实施策略

最稳妥的做法是分阶段推进：

1. 先完成 Taro 4 迁移
2. 再切到 Svelte 5 兼容模式
3. 最后重写 Loader 与 Runtime，落到真正的 Svelte 5 原生实现

### 一句话总结

这次升级的真正难点，不是"改版本号"，而是把当前插件从"依赖 Svelte 4 编译内部细节的方案"升级成"依赖官方编译选项 + preprocess + Svelte 5 官方运行时 API 的方案"。

---

## 9. 升级落地后的复核与修正（2026-05-14）

本节记录在首版方案被实际应用到代码上之后，对仓库进行的全面复核：哪些改造是到位的、哪些存在隐性 bug、对应修复方式与最终验证结果。

### 9.1 目标版本再确认

通过 svelte 官方文档与本地 `npm` 实测，确认以下版本可作为目标基线：

| 依赖                | 目标版本 | 关键信息                                                                                                                                                    |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte`            | `5.55.5` | 编译产物从 `element/listen` 迁移到 `from_html`/`from_tree` + `$.event`；`fragments: 'tree'` 自 `5.33` 起可用；`compatibility.componentApi` 仍可用作过渡选项 |
| `svelte-loader`     | `3.2.4`  | 兼容 Svelte 5；编译警告会通过 `this.emitWarning` 上抛                                                                                                       |
| `svelte-preprocess` | `6.0.3`  | 仍为 CommonJS（`package.json` 中 `"type": "commonjs"`），可直接 `require`                                                                                   |
| `@tarojs/*` 全家桶  | `4.2.0`  | Node 要求 `>= 18`；webpack5 runner 的 `componentConfig` 在 `dist/utils/component` 中暴露                                                                    |
| `typescript`        | `^5.5.4` | 满足 `svelte-preprocess@6` 的 peer 要求                                                                                                                     |

实测：`require('svelte-preprocess/package.json')` 返回 `version=6.0.3, type=commonjs`，沿用 `require()` 是安全的。

### 9.2 已正确落地的改造

代码复核后，下列改造均与首版方案一致并可用：

1. `package.json`
   - 主版本号升到 `3.0.0`，`engines.node >= 18`。
   - Taro 全家桶（`runtime/service/shared/webpack5-runner`）peer 与 dev 均 `^4.2.0`。
   - `svelte` peer `^5.55.5`，`svelte-loader@^3.2.4`，`svelte-preprocess@^6.0.3`，`typescript@^5.5.4`。
   - `patch-package` 与 `postinstall` 钩子已经移除；仓库内不再存在 `patches/` 目录。
2. `src/index.ts`
   - 不再 monkey-patch `@tarojs/cli/dist/doctor/configSchema`。
   - 改为插件被加载时主动接管 runner：`opts.framework = 'svelte'`，`opts.frameworkExts = ['.svelte']`。
   - `frameworkExts` 始终归一化为去重后的数组，兼容 Taro 4 内部按数组消费的写法。
   - `compiler.prebundle.enable = false` 的保守策略沿用。
3. `src/taroSvelteLoader.ts`
   - 完全脱离 Svelte 私有编译产物结构，不再读 `svelte/internal` AST。
   - 通过 `markup` preprocess 在编译前做平台改写，再交给 `svelte-loader`。
   - 显式注入 `compilerOptions.fragments = 'tree'`，避免在小程序端走 `innerHTML` 路径，替代旧的 `patch-package`。
4. `src/svelte-markup.ts`
   - 基于 `parse(source)` 的 legacy AST，找到 `Element` 节点。
   - `t-*` → 小程序端裸标签 / H5 端 `taro-*-core`。
   - 小程序端把命中的标签写入 `componentConfig.includes`。
5. `src/runtime/connect.ts`
   - 已切换到 Svelte 5 原生 API：`mount(Page, { target })` + `unmount(instance)`。
   - 用 `Promise.resolve(unmount(...))` 兼容 Svelte 5.13+ 返回 Promise 的行为。
   - H5 容器 `taro_page` 节点的创建与回收逻辑保留。
6. `src/webpack.h5.ts` / `src/webpack.mini.ts`
   - 沿用 `mainPlugin` / `miniPlugin` 的 `loaderMeta` 注入。
   - 补全 `resolve.mainFields` 和 `resolve.conditionNames` 的 `svelte` 入口，兼容 Svelte 5 生态包。
7. `example/`
   - Taro 全家桶 + svelte 已对齐 `4.2.0 / 5.55.5`。
   - `config/index.js` 改为 `framework: 'none'`，由插件接管。
   - `build:weapp` / `build:h5` 使用 `--no-check` 绕过 Taro 4 doctor 的框架枚举校验。

### 9.3 复核中发现的问题与修正

以下问题在首版改造里没有暴露出来，但会在真实运行时（或更严格的测试断言下）出问题，本次一并修复。

#### 问题 1：H5 端 `on:tap` → `click` 改写区间错误（最高优先级）

**现象**

原始 `src/svelte-markup.ts` 写法：

```ts
magic.overwrite(
  attribute.name_loc.start.character,
  attribute.name_loc.end.character,
  "click",
);
```

经过实测，Svelte 5 legacy AST 中 `EventHandler` 的 `name_loc` 覆盖的是整个 `on:tap` 前缀（而非事件名本身）：

```text
char:    0         1         2         3
         0123456789012345678901234567890123456
source:  <t-view on:tap={() => {}}>x</t-view>
                 ^^^^^^                       <- attribute.start..end of "on:" prefix range
                 ^^^                          <- 'on:' (length 3)
                    ^^^                       <- event name 'tap'
attribute.start = 8
attribute.name = "tap"
attribute.name_loc = { start: char 8, end: char 14 }   ← 覆盖 'on:tap' 整段
```

因此原写法会把 `on:tap` 整体替换为 `click`，最终产物变成普通属性 `click={fn}`，Svelte 5 编译器对它的处理是：

```js
$.set_attribute(button, 'click', () => {});   // ← 普通属性赋值，不会绑定监听器
```

而我们期望的是事件绑定：

```js
$.event('click', button, () => {});           // ← 真正的事件监听
```

**影响**：H5 端所有 `on:tap` 都不会触发，例如示例中 `handleTap` 永远不会被调用。原测试仅断言 `code` 中包含 `'click'`，因此即使产物是错误的属性赋值，单测也会通过——bug 被掩盖。

**修复**：改成只覆盖事件名所在区间，并对源码内容做一次防御性校验，保证我们改写的就是事件名：

```ts
const attributeStart = attribute.start;
const eventNameStart = attributeStart + "on:".length;
const eventNameEnd   = eventNameStart + attribute.name.length;

if (source.slice(eventNameStart, eventNameEnd) === attribute.name) {
  magic.overwrite(eventNameStart, eventNameEnd, "click");
}
```

**强化测试**：把 H5 测试从"输出中包含 `'click'`"改成"输出中包含 `$.event('click'` 且不存在 `set_attribute(..., 'click', ...)`"，从断言层面禁止类似的退化。

**实测验证**：在 `example` 项目 `npm run build:h5` 后，`dist/chunk/810.js` 中可以观测到（去 minify 重命名前的内容形如）：

```text
r.f0J("click", f, function handleTap(){...})
```

即 `$.event('click', node, handleTap)`，确认 H5 端事件回调真正生效。

#### 问题 2：H5 a11y 警告导致构建失败（次要 + 干扰用户）

**现象**：升级到 Svelte 5 后，对 `<t-view on:click={fn}>`（preprocess 后形态）会触发：

- `a11y_click_events_have_key_events`
- `a11y_no_static_element_interactions`

`svelte-loader` 会调用 `this.emitWarning(...)`。在测试中，loader context 没有 `emitWarning`，直接抛 `TypeError`，导致升级后的"H5 tap→click"测试根本跑不通；在真实 Taro 构建中，这些警告也会污染日志。

这些警告对 Taro 自定义标签没有实际意义（小程序端没有 DOM 键盘事件、H5 端的可访问性由 `taro-*-core` Web Component 自行处理）。

**修复**

1. 在 `src/taroSvelteLoader.ts` 的 `mergeCompilerOptions` 中注入默认的 `warningFilter`，静音以下警告代码：
   - `a11y_click_events_have_key_events`
   - `a11y_no_static_element_interactions`
   - `a11y_no_noninteractive_element_interactions`
   - `a11y_mouse_events_have_key_events`
   并保留用户自定义的 `warningFilter`（先走我们的静音列表，剩下交给用户决定）。
2. 测试 mock context 补齐 `emitWarning` / `emitError`，避免未来再有警告时测试再次"假失败"。

#### 问题 3：`installGlobalShims()` 在真实浏览器下可能抛错

**现象**：原实现无条件地重写 `document.createEvent` 返回事件对象上的 `initCustomEvent`，并在内部赋值 `e.type = eventType`。在真实浏览器中：

- `CustomEvent.prototype.initCustomEvent` 已经原生存在，本来无需 polyfill。
- `Event.type` 是只读属性，赋值会在严格模式下抛 `TypeError`。

只是因为 Taro 的 mini DOM 是宽松对象，问题在 H5 上才有可能触发；一旦上游依赖在 H5 上走到 `createEvent` 链路，事件初始化就会崩溃。

**修复**：

- 仅当返回的事件对象上确实缺少 `initCustomEvent` 时再做兜底。
- 对 `e.type = eventType` 做 try/catch，避免在只读属性上抛错。

代码已落在 `src/runtime/dom.ts`。

### 9.4 验证

#### 单元测试

```text
PASS test/loader.spec.ts
  taro svelte loader
    √ should transform mini-program tags and collect used components
    √ should transform h5 tags into taro custom elements
    √ should keep tap events on mini-program builds
    √ should rewrite tap events to click on h5 builds   ← 已强化为真正的事件断言
```

#### 插件本体构建

`npm run build` 三个 rollup 入口（`lib/index.js`、`lib/runtime.js`、`lib/taroSvelteLoader.js`）全部生成成功。

#### 示例工程构建

- `npm run build:h5` ：webpack5 编译成功，输出 H5 产物，事件回调编译为 `$.event('click', ...)`。
- `npm run build:weapp` ：mini 端 webpack 编译成功，生成 `app.js`/`pages/*.js`/`*.wxml` 等微信小程序产物。

### 9.5 仍存在的限制与建议

升级到 Svelte 5 + Taro 4.2.0 后，下列项目作为已知前置条件保留（非缺陷，但用户文档需要明确）：

1. **构建脚本必须带 `--no-check`**
   Taro 4 的 `plugin-doctor` 仍只识别官方 framework 枚举，本插件通过 `framework: 'none'` + runner 改写的方式接入，因此必须用 `--no-check` 绕过 doctor 框架枚举校验。
2. **`prebundle.enable = false` 保留**
   Svelte 5 在 webpack5 prebundle 链路的稳定性还需要更长时间观察，先关闭以保证构建可重复。后续验证稳定后可以开放为用户可配项。
3. **`installGlobalShims` 仅在 Taro mini DOM 上生效**
   真实浏览器侧不再修改原生 Event；如果未来某个 H5 依赖需要老 `initCustomEvent`，再补一个针对性的 shim 即可。
4. **a11y 警告的静音范围有限**
   仅静音了 4 条最常见的、和 `t-*` 标签场景明显冲突的规则。用户在自己的 `<button>` / `<a>` 等真实可交互元素上仍会得到 a11y 警告，与原生 Svelte 行为一致。

### 9.6 改动文件清单（本次复核）

| 文件                      | 改动类型 | 说明                                                                             |
| ------------------------- | -------- | -------------------------------------------------------------------------------- |
| `src/svelte-markup.ts`    | 修 bug   | 修正 H5 `on:tap → on:click` 改写区间，使其生成真正的事件绑定                     |
| `src/taroSvelteLoader.ts` | 增强     | 注入默认 `warningFilter`，静音 Taro 自定义标签上的 a11y 噪声警告                 |
| `src/runtime/dom.ts`      | 加固     | `installGlobalShims` 仅在缺失 `initCustomEvent` 时介入，并防御只读 `type` 抛错   |
| `test/loader.spec.ts`     | 测试强化 | H5 事件用例改为断言 `$.event('click'`；mock context 补齐 `emitWarning/emitError` |
| `UPGRADE_REPORT.md`       | 文档     | 新增本节：升级落地后的复核与修正记录                                             |

### 9.7 结论

首版升级方案在方向上正确，所有版本依赖、激活机制、loader 重写思路、运行时切到 `mount/unmount` 的改造都已经到位。复核阶段定位并修复了一个会让 H5 事件全部失效的隐性 bug、一个会污染构建日志并阻塞测试的 a11y 噪声问题，以及一个在真实浏览器下可能抛错的运行时 shim 问题。修复后：

- 单元测试 4 / 4 通过；
- `tarojs-plugin-svelte` 本体可成功构建；
- `example` 工程的 `weapp` 与 `h5` 两条链路均可成功构建，且 H5 端 `on:tap` 真正绑定为 `click` 事件监听。

至此，本仓库针对 Svelte 5.55.5 + Taro 4.2.0 的升级可视为 **已完成且经过验证**。
