/**
 * 设置项的解析与源契约。
 *
 * 折叠徽标的显示偏好经宿主 `configForms` 面到达浏览器半。本 spec 覆盖纯解析
 * （`resolveBadgeSettings`）与标准 props 源（`createBadgeSettingsSource`）：
 * 后者承担两条硬约束——`getSnapshot` 的**引用稳定**（否则 React 外部存储进入
 * 「Maximum update depth exceeded」死循环），以及无关变更**不通知**。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createBadgeSettingsSource,
  DEFAULT_BADGE_SETTINGS,
  resolveBadgeSettings,
  type SettingsSnapshotLike,
} from '../src/client/badge-settings.ts'

const ready = (value: unknown): SettingsSnapshotLike => ({ status: 'ready', value })

/** 默认设置（7 字段）。 */
const DEFAULTS = {
  showCompletedInBadge: true,
  showRunningInBadge: true,
  showPendingInBadge: true,
  showScheduledInBadge: true,
  showWaitingReviewInBadge: true,
  showHoverDetails: true,
  countThreshold: 2,
}

describe('resolveBadgeSettings', () => {
  it('shows all states by default when the settings face is absent', () => {
    expect(resolveBadgeSettings(undefined)).toEqual(DEFAULTS)
    expect(DEFAULT_BADGE_SETTINGS).toEqual(DEFAULTS)
  })

  it('falls back to showing all states before the namespace is served', () => {
    // `loading` / `unavailable`: 读不到配置不是「关掉」——必须与 schema 默认同源。
    expect(resolveBadgeSettings({ status: 'loading' })).toEqual(DEFAULTS)
    expect(resolveBadgeSettings({ status: 'unavailable' })).toEqual(DEFAULTS)
  })

  it('hides completed only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showCompletedInBadge: false }))).toEqual({ ...DEFAULTS, showCompletedInBadge: false })
    expect(resolveBadgeSettings(ready({ showCompletedInBadge: true }))).toEqual(DEFAULTS)
    // 非法/缺失值一律回落显示，避免把畸形配置读成「用户关掉了」。
    expect(resolveBadgeSettings(ready({}))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ showCompletedInBadge: 'no' }))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ showCompletedInBadge: 0 }))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready(null))).toEqual(DEFAULTS)
  })

  it('hides running only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showRunningInBadge: false }))).toEqual({ ...DEFAULTS, showRunningInBadge: false })
  })

  it('hides pending only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showPendingInBadge: false }))).toEqual({ ...DEFAULTS, showPendingInBadge: false })
  })

  it('hides scheduled only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showScheduledInBadge: false }))).toEqual({ ...DEFAULTS, showScheduledInBadge: false })
  })

  it('hides waiting review only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showWaitingReviewInBadge: false }))).toEqual({ ...DEFAULTS, showWaitingReviewInBadge: false })
  })

  it('hides hover details only on an explicit false', () => {
    expect(resolveBadgeSettings(ready({ showHoverDetails: false }))).toEqual({ ...DEFAULTS, showHoverDetails: false })
  })

  it('respects countThreshold only on a valid non-negative integer', () => {
    expect(resolveBadgeSettings(ready({ countThreshold: 1 }))).toEqual({ ...DEFAULTS, countThreshold: 1 })
    expect(resolveBadgeSettings(ready({ countThreshold: 3 }))).toEqual({ ...DEFAULTS, countThreshold: 3 })
    expect(resolveBadgeSettings(ready({ countThreshold: 0 }))).toEqual({ ...DEFAULTS, countThreshold: 0 })
    // 非法/缺失值一律回落 2，避免把畸形配置读成「用户调过了」。
    expect(resolveBadgeSettings(ready({}))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ countThreshold: 'no' }))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ countThreshold: -1 }))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ countThreshold: Infinity }))).toEqual(DEFAULTS)
    expect(resolveBadgeSettings(ready({ countThreshold: NaN }))).toEqual(DEFAULTS)
    // 小数向下取整也算合法。
    expect(resolveBadgeSettings(ready({ countThreshold: 1.5 }))).toEqual({ ...DEFAULTS, countThreshold: 1 })
    expect(resolveBadgeSettings(ready({ countThreshold: 2.0 }))).toEqual({ ...DEFAULTS, countThreshold: 2 })
  })
})

describe('createBadgeSettingsSource', () => {
  it('starts at the default so the badge works before any settings arrive', () => {
    // 源恒在且先给默认值：标准 props 的 hook 顺序不能因设置面晚到而变化。
    expect(createBadgeSettingsSource().getSnapshot()).toEqual(DEFAULTS)
  })

  it('returns an identical object while nothing is published', () => {
    // React 外部存储约定：引用不变 → 派生值必须同引用，否则选择器每次渲染都判为变更。
    const source = createBadgeSettingsSource()
    expect(source.getSnapshot()).toBe(source.getSnapshot())
  })

  it('publishes an explicit false and notifies subscribers once', () => {
    const source = createBadgeSettingsSource()
    const seen = vi.fn()
    source.subscribe(seen)
    source.publish(ready({ showCompletedInBadge: false }))
    expect(source.getSnapshot()).toEqual({ ...DEFAULTS, showCompletedInBadge: false })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('notifies again only when the resolved value actually changes', () => {
    const source = createBadgeSettingsSource()
    const seen = vi.fn()
    source.subscribe(seen)
    // 宿主会为无关字段替换快照；取值没变就不该惊动折叠行。
    source.publish(ready({ showCompletedInBadge: true }))
    source.publish(ready({ showCompletedInBadge: true, unrelated: 1 }))
    expect(seen).not.toHaveBeenCalled()
    const stable = source.getSnapshot()
    source.publish(ready({ showCompletedInBadge: true, unrelated: 2 }))
    // 取值未变 → 连引用都不换。
    expect(source.getSnapshot()).toBe(stable)
    source.publish(ready({ showCompletedInBadge: false }))
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('ignores a repeated identical snapshot reference', () => {
    const source = createBadgeSettingsSource()
    const seen = vi.fn()
    source.subscribe(seen)
    const snap = ready({ showCompletedInBadge: false })
    source.publish(snap)
    source.publish(snap)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('reverts to the default when the settings face is withdrawn', () => {
    const source = createBadgeSettingsSource()
    source.publish(ready({ showCompletedInBadge: false }))
    expect(source.getSnapshot().showCompletedInBadge).toBe(false)
    // 设置面收回（插件卸载 / 服务消失）：回落默认，而不是停在旧值。
    source.publish(undefined)
    expect(source.getSnapshot().showCompletedInBadge).toBe(true)
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const source = createBadgeSettingsSource()
    const seen = vi.fn()
    const off = source.subscribe(seen)
    source.publish(ready({ showCompletedInBadge: false }))
    expect(seen).toHaveBeenCalledTimes(1)
    off()
    source.publish(ready({ showCompletedInBadge: true }))
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
