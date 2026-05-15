const config = {
  projectName: "example",
  date: "2023-1-16",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  plugins: ["tarojs-plugin-svelte"],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  /**
   * Taro 4 的配置校验已经不再容易扩展新的 framework 枚举值，
   * 因此这里使用 `none`，再由 `tarojs-plugin-svelte` 在 runner 阶段
   * 主动切换到 Svelte 模式。
   */
  framework: "none",
  compiler: "webpack5",
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: "module",
          generateScopedName: "[name]__[local]___[hash:base64:5]",
        },
      },
    },
  },
  h5: {
    publicPath: "/",
    staticDirectory: "static",
    sourceMapType: "source-map",
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: "module",
          generateScopedName: "[name]__[local]___[hash:base64:5]",
        },
      },
    },
  },
};

module.exports = function (merge) {
  if (process.env.NODE_ENV === "development") {
    return merge({}, config, require("./dev"));
  }

  return merge({}, config, require("./prod"));
};
