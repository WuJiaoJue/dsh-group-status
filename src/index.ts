/**
 * Workspace picker plugin, node half. Pure UI plugin: no host-side behavior —
 * the empty apply exists so the plugin appears in the host cordis.yml / Loader
 * (load and lifecycle follow the host; the browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration).
 *
 * The `Config` below is the **only** host-side surface, and it exists purely so
 * the settings page has something to project: it drives browser-half display
 * preferences, so the plugin never reads it here. DSH ≥0.2.0 builds that page
 * straight off `entry.fiber.runtime.Config` (ns = this entry's Loader id,
 * `dsh-group-status`), which is why a client-only plugin needs a Config export
 * and an otherwise-empty apply.
 */
import Schema from '@deepseek-ai/schemastery'

/** Loader entry id — also the settings namespace the Host projects onto. */
export const name = 'dsh-group-status'

/**
 * 插件配置（单一事实来源）。
 *
 * `.volatile()` 标记这些字段为「用户可调」：内核据此把 Config 投影成设置页表单，
 * 并把保存结果回灌到条目配置。浏览器半通过 `configForms.get('dsh-group-status')`
 * 读取同一份文档，改完即时生效、无需刷新。
 *
 * 全部可选且带默认值：未配置时即开箱即用（所有来源默认显示）。
 */
export const Config = Schema.object({
  /**
   * 折叠分组徽标是否显示「已完成」绿点。
   *
   * 关闭后 `done` 既不画绿点，也不计入徽标数字与 hover 明细里的分组聚合行
   * （会话行自身的绿点不受影响——那是行级状态，不是分组提示）。
   */
  showCompletedInBadge: Schema.boolean().default(true),
  /** 折叠分组徽标是否显示「进行中」转圈（含子智能体）。 */
  showRunningInBadge: Schema.boolean().default(true),
  /** 折叠分组徽标是否显示「待审批」黄点（approval / plan-review / question）。 */
  showPendingInBadge: Schema.boolean().default(true),
  /** 折叠分组徽标是否显示「定时任务」时钟图标（数据来自 dsh-later）。 */
  showScheduledInBadge: Schema.boolean().default(true),
  /** 折叠分组徽标是否显示「等待评审」列表笔图标（数据来自 dsh-gitea-dispatch）。 */
  showWaitingReviewInBadge: Schema.boolean().default(true),
  /** 悬停卡里是否显示聚合明细行（"1 等待回答 · 1 进行中…"）。 */
  showHoverDetails: Schema.boolean().default(true),
  /** 徽标数字显示阈值：数量 >= 此值时才显示数字（默认 2，即 count=1 时省略）。 */
  countThreshold: Schema.number().default(2),
}).volatile()

/** The resolved shape {@link Config} projects into. */
export interface Config {
  showCompletedInBadge: boolean
  showRunningInBadge: boolean
  showPendingInBadge: boolean
  showScheduledInBadge: boolean
  showWaitingReviewInBadge: boolean
  showHoverDetails: boolean
  countThreshold: number
}

/**
 * Host plugin body. Cordis passes `(ctx, config)`; only the Config matters here
 * and even that is read by the browser half, not here — the body stays empty so
 * this plugin keeps its "pure UI plugin" shape.
 * @param _ctx - host context (unused: no host-side behavior).
 * @param _config - resolved {@link Config} (unused: the browser half reads it).
 */
export function apply(_ctx: unknown, _config: Config): void {}