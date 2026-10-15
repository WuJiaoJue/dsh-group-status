/**
 * 折叠徽标设置项的字段定义（纯逻辑，不碰 React / 宿主组件）。
 *
 * 官方设置卡片的模型（`SettingsFormModel`）把每个字段都当**草稿文本**处理：控件读
 * `format(存储值)` 得到文本，用户编辑后 `parse(文本)` 决定这次保存写什么。布尔字段
 * 没有现成的官方 spec（官方只提供 `settingsTextField` / `settingsNumberField`），所以
 * 这里按同一契约写一份：文本就是 schema 的布尔字面量。
 *
 * 单独成文件是为了可测：`parse` 必须对非法草稿返回 `undefined`（模型据此把该字段标为
 * invalid 并挡住保存，而不是把畸形值写下去），`format` 必须把缺失值读成默认 `true`
 * ——与 `Config` 各字段的 schema 默认、`badge-settings.ts` 的解析同源。
 *
 * 类型从 primitives **type-only** 引入：编译期接住官方契约，运行时不留依赖，
 * 测试里也就不必把那个包（及其整棵依赖闭包）拉进来。
 */
import type { SettingsFieldSpec } from '@deepseek-ai/dsh-client-ui-primitives'

/** 卡片字段名（与 `src/index.ts` 的 `Config` 同名同义）。 */
export const BADGE_FIELDS = {
  showCompletedInBadge: 'showCompletedInBadge',
  showRunningInBadge: 'showRunningInBadge',
  showPendingInBadge: 'showPendingInBadge',
  showScheduledInBadge: 'showScheduledInBadge',
  showWaitingReviewInBadge: 'showWaitingReviewInBadge',
  showHoverDetails: 'showHoverDetails',
  countThreshold: 'countThreshold',
} as const

/** 存储值解析成开关状态：只有显式 false 才是「关闭」。 */
export function isFieldEnabled(value: unknown): boolean {
  return value !== false
}

/**
 * 草稿文本解析成开关状态：与 {@link isFieldEnabled} 不同，这里比较的是模型给的
 * **文本**，别把字符串喂给上面那个函数（`'false' !== false` 恒真）。
 */
export function isDraftEnabled(text: string): boolean {
  return text !== 'false'
}

/**
 * 构造一个布尔字段的字段转换规格。
 *
 * `parse` 只接受 `'true'` / `'false'`：空串、任意其它文本都返回 `undefined`，
 * 让模型把字段判为 invalid 并拒绝保存（官方模型的既定行为）。
 *
 * @param field - 字段名（与 Config 同名）。
 * @param defaultValue - 缺失值时的默认（true = 默认显示，false = 默认隐藏）。
 */
function makeBooleanField(field: string, defaultValue: boolean): SettingsFieldSpec {
  return {
    field,
    format: value => {
      const enabled = value === undefined || value === null || typeof value !== 'boolean'
        ? defaultValue
        : value
      return enabled ? 'true' : 'false'
    },
    parse: text =>
      text === 'true' ? { kind: 'set', value: true }
        : text === 'false' ? { kind: 'set', value: false }
          : undefined,
  }
}

/** 各字段的字段转换规格。 */
export const showCompletedField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showCompletedInBadge, true)
export const showRunningField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showRunningInBadge, true)
export const showPendingField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showPendingInBadge, true)
export const showScheduledField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showScheduledInBadge, true)
export const showWaitingReviewField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showWaitingReviewInBadge, true)
export const showHoverDetailsField: SettingsFieldSpec = makeBooleanField(BADGE_FIELDS.showHoverDetails, true)
export const countThresholdField: SettingsFieldSpec = {
  field: BADGE_FIELDS.countThreshold,
  format: value => {
    const n = value === undefined || value === null || typeof value !== 'number' || !Number.isFinite(value)
      ? 2
      : Math.floor(value)
    return String(n < 0 ? 0 : n)
  },
  parse: text => {
    const n = Number(text)
    if (!Number.isFinite(n) || n < 0 || n !== Math.floor(n)) return undefined
    return { kind: 'set', value: n }
  },
}

/** 所有字段规格（按卡片渲染顺序）。 */
export const ALL_BADGE_FIELDS: SettingsFieldSpec[] = [
  showCompletedField,
  showRunningField,
  showPendingField,
  showScheduledField,
  showWaitingReviewField,
  showHoverDetailsField,
  countThresholdField,
]
