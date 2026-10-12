import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconClockOutlineRegular, IconListPenOutlineRegular, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './Rows.module.css';
// ── Accessible label ──
/**
 * Accessible label for a folded group's aggregated status, reusing the
 * session-row locale keys so both surfaces read identically.
 */
export function groupLiveLabel(s, t) {
    const parts = [];
    if (s.approval > 0)
        parts.push(`${s.approval} ${t('status.waitingApproval')}`);
    if (s.planReview > 0)
        parts.push(`${s.planReview} ${t('status.planReview')}`);
    if (s.question > 0)
        parts.push(`${s.question} ${t('status.waitingAnswer')}`);
    if (s.running > 0)
        parts.push(`${s.running} ${t('status.running')}`);
    if (s.subagents > 0) {
        parts.push(t(s.subagents === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: s.subagents }));
    }
    if (s.waitingReviewCount > 0)
        parts.push(`${s.waitingReviewCount} ${t('status.waitingReview')}`);
    if (s.scheduledSessions > 0)
        parts.push(`${s.scheduledSessions} ${t('status.scheduled')}`);
    if (s.done > 0)
        parts.push(`${s.done} ${t('status.completed')}`);
    return parts.join(' · ');
}
// ── Badge ──
/**
 * Aggregated live-status badge for a folded folder row. Dots reuse StateDot so
 * colors match session rows (warning = pending, ongoing = running, done = completed).
 * Renders nothing while expanded or when nothing is pending/active/completed/scheduled/waiting.
 *
 * Count matches the dots: pending + active + completed + waiting-review + scheduled sessions.
 *
 * `showCompleted` (设置项 `showCompletedInBadge`) 关闭时，`done` 完全退出这个聚合
 * 提示——不画绿点、不计入数字、不参与「是否显示徽标」的判断，等价于旧行为。会话行
 * 自身的绿点不受影响：那是行级状态，不是分组提示。
 */
export function groupLiveBadge(group, t, showCompleted) {
    const s = group.liveStatus;
    if (group.expanded || s === undefined)
        return null;
    const pending = s.approval + s.planReview + s.question;
    const active = s.running + s.subagents;
    const scheduled = s.scheduledSessions;
    const hasWaitingReview = s.waitingReviewCount > 0;
    const completed = showCompleted ? s.done : 0;
    // 只在有 pending / active / 已完成 / 定时任务 / 等待评审时显示徽标
    if (pending === 0 && active === 0 && completed === 0 && scheduled === 0 && !hasWaitingReview)
        return null;
    const label = groupLiveLabel(s, t);
    const dots = [];
    if (pending > 0)
        dots.push(_jsx(StateDot, { state: "warning" }, "warn"));
    if (active > 0)
        dots.push(_jsx(StateDot, { state: "ongoing" }, "run"));
    if (completed > 0)
        dots.push(_jsx(StateDot, { state: "done" }, "done"));
    // 定时任务图标（紫色 #8b5cf6 与 dsh-later 定时徽标同源，浅深底对比均 >=3:1；
    // urgent 橙 / overdue 红走宿主 warn/error 语义令牌）。与等待评审**用不同图标**——
    // 两者同属"在等"的语义，只靠颜色区分对色盲用户不可用。
    if (scheduled > 0) {
        const stateColor = s.scheduleState === 'overdue' ? 'var(--dsw-alias-state-error-primary)' : s.scheduleState === 'urgent' ? 'var(--dsw-alias-state-warn-secondary)' : '#8b5cf6';
        dots.push(_jsx("span", { style: { color: stateColor, display: 'inline-flex', alignItems: 'center' }, children: _jsx(IconClockOutlineRegular, { size: 14 }) }, "schedule"));
    }
    // 等待评审图标（琥珀色；超时转红）。数据来自 dsh-gitea-dispatch 的
    // useWaitingSummary()——本插件不自己轮询该端点（其 store 是唯一轮询方）。
    if (hasWaitingReview) {
        const stateColor = s.waitingReviewState === 'overdue' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-secondary)';
        dots.push(_jsx("span", { style: { color: stateColor, display: 'inline-flex', alignItems: 'center' }, children: _jsx(IconListPenOutlineRegular, { size: 14 }) }, "waiting-review"));
    }
    // 数字统计 pending + active + 已完成 + 定时任务会话 + 等待评审会话（与 dot 一致）
    // P2-3: 数字上限 99+，避免大项目组徽标过宽。
    // P3-3: count = 1 时省略数字（点已表达"有东西"，"1"无额外信息）。
    const count = pending + active + completed + scheduled + s.waitingReviewCount;
    const countLabel = count > 99 ? '99+' : count > 1 ? String(count) : '';
    // P2-2: 紧急状态（overdue/urgent）时添加脉冲动画类。
    const isUrgent = s.scheduleState === 'overdue' || s.scheduleState === 'urgent'
        || s.waitingReviewState === 'overdue';
    const badgeClass = isUrgent ? `${css.groupBadge} ${css.groupBadgeUrgent}` : css.groupBadge;
    return (_jsxs("span", { className: badgeClass, role: "img", "aria-label": label, title: label, children: [dots, countLabel && _jsx("span", { className: css.groupBadgeCount, children: countLabel })] }));
}
// ── Hover-card status lines ──
/**
 * Build the status detail lines for the workspace hover card.
 *
 * Extracted so `WorkspaceHoverContent` in `Rows.tsx` only needs to map the
 * returned array — the fork-specific status→line logic lives here.
 */
export function hoverStatusLines(status, t) {
    const lines = [];
    if (status === undefined)
        return lines;
    if (status.approval > 0)
        lines.push({ state: 'warning', text: `${status.approval} ${t('status.waitingApproval')}` });
    if (status.planReview > 0)
        lines.push({ state: 'warning', text: `${status.planReview} ${t('status.planReview')}` });
    if (status.question > 0)
        lines.push({ state: 'warning', text: `${status.question} ${t('status.waitingAnswer')}` });
    if (status.running > 0)
        lines.push({ state: 'ongoing', text: `${status.running} ${t('status.running')}` });
    if (status.subagents > 0) {
        lines.push({
            state: 'ongoing',
            text: t(status.subagents === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: status.subagents }),
        });
    }
    if (status.waitingReviewCount > 0) {
        lines.push({ state: 'warning', text: `${status.waitingReviewCount} ${t('status.waitingReview')}` });
    }
    if (status.scheduledSessions > 0) {
        lines.push({ state: 'warning', text: `${status.scheduledSessions} ${t('status.scheduled')}` });
    }
    if (status.done > 0)
        lines.push({ state: 'done', text: `${status.done} ${t('status.completed')}` });
    return lines;
}
//# sourceMappingURL=GroupBadge.js.map