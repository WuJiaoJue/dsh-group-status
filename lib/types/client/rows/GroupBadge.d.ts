/**
 * Fork-owned: aggregated status badge for collapsed workspace groups.
 *
 * Extracted from `Rows.tsx` so the upstream diff surface is minimal — the
 * vendored file only needs one import and one `<GroupBadge />` call to wire
 * the badge in. Everything fork-specific lives here.
 *
 * @module
 */
import type { ReactNode } from 'react';
import type { WorkspaceBrowserProps } from '../contract/slots.ts';
import type { GroupLiveStatus, GroupNode } from '../tree.ts';
/** The standard locale seat, prop-passed from the browser root. */
type RowTranslate = WorkspaceBrowserProps['t'];
/**
 * Accessible label for a folded group's aggregated status, reusing the
 * session-row locale keys so both surfaces read identically.
 */
export declare function groupLiveLabel(s: GroupLiveStatus, t: RowTranslate): string;
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
export declare function groupLiveBadge(group: GroupNode, t: RowTranslate, showCompleted: boolean): ReactNode;
/**
 * Build the status detail lines for the workspace hover card.
 *
 * Extracted so `WorkspaceHoverContent` in `Rows.tsx` only needs to map the
 * returned array — the fork-specific status→line logic lives here.
 */
export declare function hoverStatusLines(status: GroupLiveStatus | undefined, t: RowTranslate): {
    state: 'warning' | 'ongoing' | 'done';
    text: string;
}[];
export {};
//# sourceMappingURL=GroupBadge.d.ts.map