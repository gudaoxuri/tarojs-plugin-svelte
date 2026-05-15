<h1 align="center">Taro Plugin Svelte</h1>

<p align="center">使用 Svelte 5 开发 Taro 小程序与 H5。</p>

<img alt="" src="https://github.com/SyMind/tarojs-plugin-svelte/blob/main/screenshots/weapp.png">

> 请 Star 🌟 这个项目来表达你的喜爱 ❤️ 和支持。

# 版本要求

- Node.js >= 18
- Taro 4.x
- Svelte 5.x

# 示例项目

仓库自带 `example` 示例，可直接用于验证 `weapp` 与 `h5` 构建。
当前版本也主要围绕这两条标准页面构建链路完成验证。

# 安装与使用

你需要先拥有一个 Taro 项目，如果你还不知该如何创建一个 Taro 项目，请先从这里开始：[Taro 安装及使用](https://docs.taro.zone/docs/GETTING-STARTED)。

## 安装

请在你的 Taro 项目中安装 **Svelte 运行时** 与 **本插件**。

```/dev/null/install.sh#L1-1
npm install svelte tarojs-plugin-svelte
```

## 配置

### Taro 4 推荐配置

从 Taro 4 开始，CLI 配置校验不再容易扩展新的 `framework` 枚举值。
因此推荐在 `config/index.js` 中使用 `framework: 'none'`，再由插件在 runner 阶段切换到 Svelte 模式。

同时，当前 Taro 4 的 doctor 校验仍无法识别该自定义框架方案，因此构建脚本需要带上 `--no-check`。

```/dev/null/config-index.js#L1-8
const config = {
  framework: 'none',
  compiler: 'webpack5',
  plugins: [
    'tarojs-plugin-svelte'
  ]
}
```

### Babel 配置

如果项目保留了 `babel.config.js`，建议显式声明 `compiler: 'webpack5'`。

```/dev/null/babel-config.js#L1-8
module.exports = {
  presets: [
    ['taro', {
      framework: 'none',
      compiler: 'webpack5'
    }]
  ]
}
```

### 构建脚本示例

```/dev/null/package.json#L1-7
{
  "scripts": {
    "build:weapp": "taro build --type weapp --no-check",
    "build:h5": "taro build --type h5 --no-check"
  }
}
```

## Svelte 语法说明

- 支持 Svelte 5。
- 支持继续使用 Svelte 传统组件语法。
- 小程序标签请继续使用 `t-*` 形式，例如：`t-view`、`t-text`。
- 插件会在编译阶段自动完成平台转换：
  - 小程序端：`t-view` -> `view`
  - H5 端：`t-view` -> `taro-view-core`
- H5 端会自动把 DOM 事件 `tap` 转成 `click`。

# License

[MIT](./LICENSE)
