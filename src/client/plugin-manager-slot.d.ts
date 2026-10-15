/**
 * `plugins.bundle.config` 的本地类型声明（本仓库新增文件）。
 *
 * 为什么手写而不是 `import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'`：
 * 声明该槽位的包是插件管理器，而本仓库**不**把它列为 devDependency（它只宿主的
 * 浏览器运行时产物，装进插件的依赖图只会引入预发布版本的解析噪声）。槽位契约本身
 * 很窄，这里按宿主真实声明（`slot-contract.d.ts` 的 `PluginConfigViewProps`）写出
 * 这份类型；运行时行为由宿主提供，声明只服务编译期。
 *
 * 升级注意：若哪天 `@deepseek-ai/dsh-client-ui-plugin-manager` 进了 devDependencies，
 * 删掉本文件——两份声明会撞成重复成员。
 *
 * @module dsh-group-status/client/plugin-manager-slot
 */
export {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * 一个 bundle 自己的配置：按**包名**寻址，渲染在插件详情页描述与组件行之间
     * （只派发 `view: 'page'`）。
     */
    'plugins.bundle.config': {
      readonly kind: 'keyed'
      readonly scope: 'root'
      readonly owner: { readonly view: 'summary' | 'page' }
    }
  }
}
