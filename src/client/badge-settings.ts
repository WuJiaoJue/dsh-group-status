/**
 * 插件设置读取（折叠徽标显示偏好）。
 *
 * 数据流：apply 时先建一个**稳定**的标准 props 源并经 `provideRoot` 挂上（此时还不知道
 * 设置面在不在），再用 `ctx.inject(['configForms'], …)` 等宿主设置服务就绪——就绪后
 * 订阅本条目设置面，把快照推给源。设置页保存 → 宿主替换快照 → 源通知 → 徽标即时重渲染。
 *
 * 为什么不在 apply 里直接 `ctx.get('configForms')`：服务可能在**本插件之后**才注册，
 * 那时读到的 undefined 会永久生效（设置被静默忽略，直到刷新）。`ctx.inject` 是非阻塞的
 * 嵌套插件，服务永不到达也不会影响本插件其余功能。
 *
 * 为什么源必须一开始就存在：标准 props 的 hook 调用顺序必须稳定——挂上/摘掉
 * `useBadgeSettings` 会改变调用顺序而崩渲染。故源恒在，只有它的**值**随设置变化。
 *
 * 稳定性约定（React 外部存储，见 dsh-later 的同名 hook）：`getSnapshot` 必须返回稳定
 * 引用——每次都构造新对象会让选择器的 `Object.is` 比较永不成立，触发
 * 「Maximum update depth exceeded」死循环（React #185），折叠行徽标会整块崩掉。
 *
 * 设置面缺席或未就绪时，回落到**默认显示已完成**，与 `Config.showCompletedInBadge` 的
 * schema 默认值同源：读不到配置不是「关掉」。
 */

/** Loader 条目 id —— 设置页的寻址键，也是宿主 `describe()` 的 ns。 */
export const ENTRY_ID = 'dsh-group-status'

/** 设置面快照的最小结构面（与宿主 `ConfigFormSnapshot` 兼容）。 */
export interface SettingsSnapshotLike {
  readonly status: string
  readonly value?: unknown
}

/** 设置面的最小结构面（与宿主 `ConfigForm` 兼容）。 */
export interface SettingsScopeLike {
  getSnapshot(): SettingsSnapshotLike
  subscribe(listener: () => void): () => void
}

/** 本插件在浏览器半关心的设置项。 */
export interface ResolvedBadgeSettings {
  /** 折叠徽标是否显示「已完成」绿点；缺失/非法一律回落 true。 */
  showCompletedInBadge: boolean
}

/** 标准 props 源的结构面（与 `HostObservable<ResolvedBadgeSettings>` 兼容）。 */
export interface BadgeSettingsSource {
  getSnapshot(): ResolvedBadgeSettings
  subscribe(listener: () => void): () => void
}

/** 始终存在的源：由 {@link createBadgeSettingsSource} 创建。 */
export interface MutableBadgeSettingsSource extends BadgeSettingsSource {
  /**
   * 采纳一条新快照（设置面就绪或宿主变更时推入）。
   *
   * 引用或取值都没变则**不通知**：宿主会为无关变更替换快照，无谓通知会让折叠行整列
   * 重渲染。
   * @param snapshot - 设置面快照；undefined 表示设置面缺失/收回。
   */
  publish(snapshot: SettingsSnapshotLike | undefined): void
}

/** 默认值：与 `Config.showCompletedInBadge` 的 schema 默认同源（true）。 */
export const DEFAULT_BADGE_SETTINGS: ResolvedBadgeSettings = Object.freeze({
  showCompletedInBadge: true,
})

/** 从原始快照派生：只有**显式 false** 才隐藏，缺失/非法一律显示。 */
function resolveFromSnapshot(snap: SettingsSnapshotLike | undefined): ResolvedBadgeSettings {
  if (snap === undefined || snap.status !== 'ready') return DEFAULT_BADGE_SETTINGS
  const value = snap.value as Record<string, unknown> | undefined
  if (value === undefined || value === null || typeof value !== 'object') return DEFAULT_BADGE_SETTINGS
  return { showCompletedInBadge: value['showCompletedInBadge'] !== false }
}

/**
 * 建一个恒在、取值稳定的徽标设置源。
 *
 * `getSnapshot` 是**纯读**（无副作用、无订阅），因此可以安全地在渲染期间被反复调用，
 * 也满足外部存储的引用稳定要求；订阅只由 {@link MutableBadgeSettingsSource.publish}
 * 在取值真正变化时触发。
 * @returns 源；调用方持有它并在设置面就绪后 `publish`。
 */
export function createBadgeSettingsSource(): MutableBadgeSettingsSource {
  const listeners = new Set<() => void>()
  let resolved: ResolvedBadgeSettings = DEFAULT_BADGE_SETTINGS
  let seen: SettingsSnapshotLike | undefined
  let seenSet = false
  return {
    getSnapshot: () => resolved,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish: (snapshot) => {
      // 同一快照引用重复推入（含 undefined ↔ undefined）直接丢弃。
      if (seenSet && snapshot === seen) return
      seen = snapshot
      seenSet = true
      const next = resolveFromSnapshot(snapshot)
      // 取值没变就不替换引用、不通知：宿主为无关字段替换快照时不该惊动折叠行。
      if (next.showCompletedInBadge === resolved.showCompletedInBadge) return
      resolved = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** 旧口径的纯解析函数，保留给测试与 `publish` 复用。 */
export function resolveBadgeSettings(snapshot: SettingsSnapshotLike | undefined): ResolvedBadgeSettings {
  return resolveFromSnapshot(snapshot)
}