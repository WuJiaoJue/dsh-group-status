/**
 * Fork-owned: aggregated status badge for collapsed workspace groups.
 *
 * Extracted from `Rows.tsx` so the upstream diff surface is minimal — the
 * vendored file only needs one import and one `<GroupBadge />` call to wire
 * the badge in. Everything fork-specific lives here.
 *
 * @module
 */
import type { ReactNode } from 'react'
import {
  IconClockOutlineRegular, IconListPenOutlineRegular, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { GroupLiveStatus, GroupNode } from '../tree.ts'
import type { ResolvedBadgeSettings } from '../badge-settings.ts'
import css from './Rows.module.css'

/** The standard locale seat, prop-passed from the browser root. */
type RowTranslate = WorkspaceBrowserProps['t']

// ── Accessible label ──

/**
 * Accessible label for a folded group's aggregated status, reusing the
 * session-row locale keys so both surfaces read identically.
 *
 * 按设置过滤：关掉的来源不出现在标签里（aria-label 与徽标视觉一致）。
 */
export function groupLiveLabel(s: GroupLiveStatus, t: RowTranslate, settings: ResolvedBadgeSettings): string {
  const parts: string[] = []
  if (settings.showPendingInBadge) {
    if (s.approval > 0) parts.push(`${s.approval} ${t('status.waitingApproval')}`)
    if (s.planReview > 0) parts.push(`${s.planReview} ${t('status.planReview')}`)
    if (s.question > 0) parts.push(`${s.question} ${t('status.waitingAnswer')}`)
  }
  if (settings.showRunningInBadge) {
    if (s.running > 0) parts.push(`${s.running} ${t('status.running')}`)
    if (s.subagents > 0) {
      parts.push(t(s.subagents === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: s.subagents }))
    }
  }
  if (settings.showWaitingReviewInBadge && s.waitingReviewCount > 0) parts.push(`${s.waitingReviewCount} ${t('status.waitingReview')}`)
  if (settings.showScheduledInBadge && s.scheduledSessions > 0) parts.push(`${s.scheduledSessions} ${t('status.scheduled')}`)
  if (settings.showCompletedInBadge && s.done > 0) parts.push(`${s.done} ${t('status.completed')}`)
  return parts.join(' · ')
}

// ── Badge ──

/**
 * Aggregated live-status badge for a folded folder row. Dots reuse StateDot so
 * colors match session rows (warning = pending, ongoing = running, done = completed).
 * Renders nothing while expanded or when nothing is pending/active/completed/scheduled/waiting.
 *
 * Count matches the dots: pending + active + completed + waiting-review + scheduled sessions.
 *
 * `settings` 按来源过滤：关掉的来源不画点、不计数、不进 aria-label、不参与「是否显示徽标」
 * 的判断。会话行自身的状态不受影响：那是行级状态，不是分组提示。
 */
export function groupLiveBadge(group: GroupNode, t: RowTranslate, settings: ResolvedBadgeSettings): ReactNode {
  const s = group.liveStatus
  if (group.expanded || s === undefined) return null
  const pending = settings.showPendingInBadge ? s.approval + s.planReview + s.question : 0
  const active = settings.showRunningInBadge ? s.running + s.subagents : 0
  const scheduled = settings.showScheduledInBadge ? s.scheduledSessions : 0
  const hasWaitingReview = settings.showWaitingReviewInBadge && s.waitingReviewCount > 0
  const completed = settings.showCompletedInBadge ? s.done : 0
  // 只在有 pending / active / 已完成 / 定时任务 / 等待评审时显示徽标
  if (pending === 0 && active === 0 && completed === 0 && scheduled === 0 && !hasWaitingReview) return null
  const label = groupLiveLabel(s, t, settings)
  const dots: ReactNode[] = []
  if (pending > 0) dots.push(<StateDot key="warn" state="warning" />)
  if (active > 0) dots.push(<StateDot key="run" state="ongoing" />)
  if (completed > 0) dots.push(<StateDot key="done" state="done" />)
  // 定时任务图标（紫色 #8b5cf6 与 dsh-later 定时徽标同源，浅深底对比均 >=3:1；
  // urgent 橙 / overdue 红走宿主 warn/error 语义令牌）。与等待评审**用不同图标**——
  // 两者同属"在等"的语义，只靠颜色区分对色盲用户不可用。
  if (scheduled > 0) {
    const stateColor = s.scheduleState === 'overdue' ? 'var(--dsw-alias-state-error-primary)' : s.scheduleState === 'urgent' ? 'var(--dsw-alias-state-warn-secondary)' : '#8b5cf6'
    dots.push(
      <span key="schedule" style={{ color: stateColor, display: 'inline-flex', alignItems: 'center' }}>
        <IconClockOutlineRegular size={14} />
      </span>
    )
  }
  // 等待评审图标（琥珀色；超时转红）。数据来自 dsh-gitea-dispatch 的
  // useWaitingSummary()——本插件不自己轮询该端点（其 store 是唯一轮询方）。
  if (hasWaitingReview) {
    const stateColor = s.waitingReviewState === 'overdue' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-secondary)'
    dots.push(
      <span key="waiting-review" style={{ color: stateColor, display: 'inline-flex', alignItems: 'center' }}>
        <IconListPenOutlineRegular size={14} />
      </span>
    )
  }
  // 数字统计 pending + active + 已完成 + 定时任务会话 + 等待评审会话（与 dot 一致）
  // P2-3: 数字上限 99+，避免大项目组徽标过宽。
  // P3-3: count < countThreshold 时省略数字（点已表达"有东西"）；设置项 countThreshold 可调。
  const count = pending + active + completed + scheduled + (hasWaitingReview ? s.waitingReviewCount : 0)
  const countLabel = count > 99 ? '99+' : count >= settings.countThreshold ? String(count) : ''
  // P2-2: 紧急状态（overdue/urgent）时添加脉冲动画类。
  const isUrgent = s.scheduleState === 'overdue' || s.scheduleState === 'urgent'
    || s.waitingReviewState === 'overdue'
  const badgeClass = isUrgent ? `${css.groupBadge} ${css.groupBadgeUrgent}` : css.groupBadge
  return (
    <span className={badgeClass} role="img" aria-label={label} title={label}>
      {dots}
      {countLabel && <span className={css.groupBadgeCount}>{countLabel}</span>}
    </span>
  )
}

// ── Hover-card status lines ──

/**
 * Build the status detail lines for the workspace hover card.
 *
 * Extracted so `WorkspaceHoverContent` in `Rows.tsx` only needs to map the
 * returned array — the fork-specific status→line logic lives here.
 *
 * 按设置过滤：关掉的来源不出现在明细行里；`showHoverDetails=false` 时整段返回空。
 */
export function hoverStatusLines(
  status: GroupLiveStatus | undefined,
  t: RowTranslate,
  settings: ResolvedBadgeSettings,
): { state: 'warning' | 'ongoing' | 'done'; text: string }[] {
  const lines: { state: 'warning' | 'ongoing' | 'done'; text: string }[] = []
  if (status === undefined || !settings.showHoverDetails) return lines
  if (settings.showPendingInBadge) {
    if (status.approval > 0) lines.push({ state: 'warning', text: `${status.approval} ${t('status.waitingApproval')}` })
    if (status.planReview > 0) lines.push({ state: 'warning', text: `${status.planReview} ${t('status.planReview')}` })
    if (status.question > 0) lines.push({ state: 'warning', text: `${status.question} ${t('status.waitingAnswer')}` })
  }
  if (settings.showRunningInBadge) {
    if (status.running > 0) lines.push({ state: 'ongoing', text: `${status.running} ${t('status.running')}` })
    if (status.subagents > 0) {
      lines.push({
        state: 'ongoing',
        text: t(status.subagents === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: status.subagents }),
      })
    }
  }
  if (settings.showWaitingReviewInBadge && status.waitingReviewCount > 0) {
    lines.push({ state: 'warning', text: `${status.waitingReviewCount} ${t('status.waitingReview')}` })
  }
  if (settings.showScheduledInBadge && status.scheduledSessions > 0) {
    lines.push({ state: 'warning', text: `${status.scheduledSessions} ${t('status.scheduled')}` })
  }
  if (settings.showCompletedInBadge && status.done > 0) lines.push({ state: 'done', text: `${status.done} ${t('status.completed')}` })
  return lines
}
