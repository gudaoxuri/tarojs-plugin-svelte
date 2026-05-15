/**
 * Taro webpack5 runner 暴露的组件收集配置对象。
 *
 * 插件会在解析 `.svelte` 模板时把用到的小程序标签加入 `includes`，
 * 以便 Taro 在生成小程序模板时正确注册对应组件。
 */
export interface ITaroComponentConfig {
  includes: Set<string>
  exclude: Set<string>
  thirdPartyComponents: Map<string, unknown>
  includeAll: boolean
}

let cachedComponentConfig: ITaroComponentConfig | null = null

/**
 * 尝试从给定模块路径中读取 Taro 的组件配置对象。
 *
 * @param modulePath Taro webpack5 runner 中可能存在的组件配置导出路径。
 * @returns 成功时返回配置对象，否则返回 `null`。
 */
function tryRequireComponentConfig(modulePath: string): ITaroComponentConfig | null {
  try {
    const mod = require(modulePath)
    return mod?.componentConfig ?? null
  } catch {
    return null
  }
}

/**
 * 获取当前 Taro 版本对应的组件配置对象。
 *
 * Taro 4.x 当前使用 `dist/utils/component`，旧版本曾使用过
 * `dist/template/component`。这里统一做兼容查找，避免把路径细节散落在业务代码里。
 *
 * @returns Taro 的组件配置对象。
 * @throws 当当前 Taro 版本没有暴露兼容的组件配置对象时抛错。
 */
export function getTaroComponentConfig(): ITaroComponentConfig {
  if (cachedComponentConfig) {
    return cachedComponentConfig
  }

  cachedComponentConfig =
    tryRequireComponentConfig('@tarojs/webpack5-runner/dist/utils/component') ||
    tryRequireComponentConfig('@tarojs/webpack5-runner/dist/template/component')

  if (!cachedComponentConfig) {
    throw new Error('The plugin does not support the current version of Taro')
  }

  return cachedComponentConfig
}
