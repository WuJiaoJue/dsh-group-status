/**
 * Fork-owned: aggregated live-status computation for collapsed workspace groups.
 *
 * Extracted from `tree.ts` so the upstream diff surface is minimal — the
 * vendored file only needs one import line and one field assignment to wire
 * the badge aggregation in. Everything fork-specific lives here.
 *
 * @module
 */
import type { SessionNode } from './tree.ts';
/**
 * One session's waiting-review fact, as published by dsh-gitea-dispatch's
 * `useWaitingSummary()` (issue: dsh-gitea-dispatch#16).
 */
export interface WaitingReviewSummaryEntry {
    readonly prNumber: number;
    readonly state: 'waiting' | 'overdue';
}
/** Session id → that session's waiting-review fact (no entry = not waiting). */
export type WaitingReviewSummaryMap = ReadonlyMap<string, WaitingReviewSummaryEntry>;
/**
 * One session's schedule fact, as published by dsh-later's `useScheduleSummary()`.
 */
export interface ScheduleSummaryEntry {
    readonly count: number;
    readonly pausedCount: number;
    readonly nextAt?: number;
    readonly state: 'scheduled' | 'urgent' | 'overdue';
}
/** Session id → that session's schedule fact (no entry = no scheduled tasks). */
export type ScheduleSummaryMap = ReadonlyMap<string, ScheduleSummaryEntry>;
/**
 * Aggregated live-session counts for one group, computed over all members so a
 * folded folder row can hint at hidden activity.
 */
export interface GroupLiveStatus {
    /** Members currently running. */
    running: number;
    /** Members awaiting tool approval. */
    approval: number;
    /** Members awaiting plan review. */
    planReview: number;
    /** Members awaiting a question answer. */
    question: number;
    /** Members finished and not yet opened (the green "done" reminder). */
    done: number;
    /** Running direct children across members. */
    subagents: number;
    /** Members with scheduled tasks (from dsh-later). */
    scheduledSessions: number;
    /** Total scheduled tasks across members (including paused). */
    scheduledCount: number;
    /** Highest-priority schedule state: overdue > urgent > scheduled. */
    scheduleState: 'scheduled' | 'urgent' | 'overdue' | undefined;
    /** Members waiting for CI review of their PR (from dsh-gitea-dispatch). */
    waitingReviewCount: number;
    /** Highest-priority waiting state across members: overdue > waiting. */
    waitingReviewState: 'waiting' | 'overdue' | undefined;
}
/**
 * Zero-valued sentinel for {@link GroupLiveStatus}.
 *
 * Used when a group is expanded (badge is hidden, so aggregation is wasted
 * work) or when no cross-plugin data is available. Kept as a frozen constant
 * so the reference is stable across renders — `Object.is` comparisons in
 * React selectors never trigger spurious re-renders on it.
 */
export declare const EMPTY_LIVE_STATUS: GroupLiveStatus;
/**
 * Fold every member row of a group into counts so a collapsed folder can hint at
 * hidden live sessions. Mirrors the session-row status priority (pending
 * outranks running outranks completed) at the counting level; labels resolve with
 * locale at render time.
 * @param nodes - member rows of the group.
 * @param sessionIds - the same members' Session ids (schedule and waiting facts are keyed by id).
 * @param waitingReviewSummary - dsh-gitea-dispatch waiting map, when that plugin is loaded.
 * @param scheduleSummary - dsh-later schedule map, when that plugin is loaded.
 */
export declare function summarizeGroupStatus(nodes: readonly SessionNode[], sessionIds: readonly string[], waitingReviewSummary?: WaitingReviewSummaryMap, scheduleSummary?: ScheduleSummaryMap): GroupLiveStatus;
//# sourceMappingURL=group-status.d.ts.map