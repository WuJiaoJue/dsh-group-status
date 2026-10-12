/**
 * Fork-owned: aggregated live-status computation for collapsed workspace groups.
 *
 * Extracted from `tree.ts` so the upstream diff surface is minimal — the
 * vendored file only needs one import line and one field assignment to wire
 * the badge aggregation in. Everything fork-specific lives here.
 *
 * @module
 */
import type { SessionNode } from './tree.ts'

// ── Types (structurally typed to avoid compile-time dependency on cross-plugin packages) ──

/**
 * One session's waiting-review fact, as published by dsh-gitea-dispatch's
 * `useWaitingSummary()` (issue: dsh-gitea-dispatch#16).
 */
export interface WaitingReviewSummaryEntry {
  readonly prNumber: number
  readonly state: 'waiting' | 'overdue'
}

/** Session id → that session's waiting-review fact (no entry = not waiting). */
export type WaitingReviewSummaryMap = ReadonlyMap<string, WaitingReviewSummaryEntry>

/**
 * One session's schedule fact, as published by dsh-later's `useScheduleSummary()`.
 */
export interface ScheduleSummaryEntry {
  readonly count: number
  readonly pausedCount: number
  readonly nextAt?: number
  readonly state: 'scheduled' | 'urgent' | 'overdue'
}

/** Session id → that session's schedule fact (no entry = no scheduled tasks). */
export type ScheduleSummaryMap = ReadonlyMap<string, ScheduleSummaryEntry>

// ── Aggregated status ──

/**
 * Aggregated live-session counts for one group, computed over all members so a
 * folded folder row can hint at hidden activity.
 */
export interface GroupLiveStatus {
  /** Members currently running. */
  running: number
  /** Members awaiting tool approval. */
  approval: number
  /** Members awaiting plan review. */
  planReview: number
  /** Members awaiting a question answer. */
  question: number
  /** Members finished and not yet opened (the green "done" reminder). */
  done: number
  /** Running direct children across members. */
  subagents: number
  /** Members with scheduled tasks (from dsh-later). */
  scheduledSessions: number
  /** Total scheduled tasks across members (including paused). */
  scheduledCount: number
  /** Highest-priority schedule state: overdue > urgent > scheduled. */
  scheduleState: 'scheduled' | 'urgent' | 'overdue' | undefined
  /** Members waiting for CI review of their PR (from dsh-gitea-dispatch). */
  waitingReviewCount: number
  /** Highest-priority waiting state across members: overdue > waiting. */
  waitingReviewState: 'waiting' | 'overdue' | undefined
}

/**
 * Zero-valued sentinel for {@link GroupLiveStatus}.
 *
 * Used when a group is expanded (badge is hidden, so aggregation is wasted
 * work) or when no cross-plugin data is available. Kept as a frozen constant
 * so the reference is stable across renders — `Object.is` comparisons in
 * React selectors never trigger spurious re-renders on it.
 */
export const EMPTY_LIVE_STATUS: GroupLiveStatus = Object.freeze({
  running: 0, approval: 0, planReview: 0, question: 0, done: 0, subagents: 0,
  scheduledSessions: 0, scheduledCount: 0, scheduleState: undefined,
  waitingReviewCount: 0, waitingReviewState: undefined,
}) as GroupLiveStatus

// ── Helpers ──

/**
 * Strip the `session-` / `webhook-` prefix from a Session id.
 *
 * dsh-gitea-dispatch publishes its waiting map keyed by the host SessionId, but
 * its HTTP endpoints key by this normalized form. Accepting both here keeps the
 * badge working across that publisher's conventions without knowing which is in
 * play.
 */
function stripSessionPrefix(id: string): string {
  return id.replace(/^(?:session|webhook)-/, '')
}

// ── Main computation ──

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
export function summarizeGroupStatus(
  nodes: readonly SessionNode[],
  sessionIds: readonly string[],
  waitingReviewSummary?: WaitingReviewSummaryMap,
  scheduleSummary?: ScheduleSummaryMap,
): GroupLiveStatus {
  let running = 0
  let approval = 0
  let planReview = 0
  let question = 0
  let done = 0
  let subagents = 0
  for (const n of nodes) {
    if (n.blank || n.archived) continue
    if (n.pendingInteraction === 'approval') { approval += 1; continue }
    if (n.pendingInteraction === 'plan-review') { planReview += 1; continue }
    if (n.pendingInteraction === 'question') { question += 1; continue }
    if (n.running) running += 1
    else if (n.completed) done += 1
    subagents += n.runningSubagentCount
  }

  // Aggregate schedule summary from dsh-later
  let scheduledSessions = 0
  let scheduledCount = 0
  let scheduleState: 'scheduled' | 'urgent' | 'overdue' | undefined = undefined

  if (scheduleSummary && sessionIds.length > 0) {
    let totalSessions = 0
    let totalCount = 0
    let highestPriority = 0 // 0=none, 1=scheduled, 2=urgent, 3=overdue

    for (const id of sessionIds) {
      const entry = scheduleSummary.get(id)
      if (entry) {
        totalSessions += 1
        totalCount += entry.count
        const priority = entry.state === 'overdue' ? 3 : entry.state === 'urgent' ? 2 : 1
        if (priority > highestPriority) highestPriority = priority
      }
    }

    scheduledSessions = totalSessions
    scheduledCount = totalCount
    scheduleState = highestPriority === 3 ? 'overdue' : highestPriority === 2 ? 'urgent' : highestPriority === 1 ? 'scheduled' : undefined
  }

  // Aggregate waiting-review summary from dsh-gitea-dispatch (its #16).
  //
  // Counts **members**, not PRs: one session waits on exactly one PR, and the
  // badge's number must mean "how many sessions in this folder need attention".
  // `overdue` outranks `waiting` for the dot color, mirroring the schedule rule.
  let waitingReviewCount = 0
  let waitingReviewState: 'waiting' | 'overdue' | undefined = undefined
  if (waitingReviewSummary && sessionIds.length > 0) {
    for (const id of sessionIds) {
      const entry = waitingReviewSummary.get(id) ?? waitingReviewSummary.get(stripSessionPrefix(id))
      if (entry === undefined) continue
      waitingReviewCount += 1
      if (entry.state === 'overdue') waitingReviewState = 'overdue'
      else if (waitingReviewState === undefined) waitingReviewState = 'waiting'
    }
  }

  return {
    running, approval, planReview, question, done, subagents,
    scheduledSessions, scheduledCount, scheduleState,
    waitingReviewCount, waitingReviewState,
  }
}
