/**
 * Zero-valued sentinel for {@link GroupLiveStatus}.
 *
 * Used when a group is expanded (badge is hidden, so aggregation is wasted
 * work) or when no cross-plugin data is available. Kept as a frozen constant
 * so the reference is stable across renders — `Object.is` comparisons in
 * React selectors never trigger spurious re-renders on it.
 */
export const EMPTY_LIVE_STATUS = Object.freeze({
    running: 0, approval: 0, planReview: 0, question: 0, done: 0, subagents: 0,
    scheduledSessions: 0, scheduledCount: 0, scheduleState: undefined,
    waitingReviewCount: 0, waitingReviewState: undefined,
});
/**
 * Merge two {@link GroupLiveStatus} objects by summing counters and taking the
 * highest-priority state (overdue > urgent > scheduled for schedule; overdue > waiting
 * for waiting-review).
 *
 * Used for multi-level aggregation: when a parent group is collapsed, its badge
 * must reflect all descendant sessions, not just direct members.
 */
export function mergeLiveStatus(a, b) {
    // Schedule state: overdue (3) > urgent (2) > scheduled (1) > undefined (0)
    const priorityOf = (s) => s === 'overdue' ? 3 : s === 'urgent' ? 2 : s === 'scheduled' ? 1 : 0;
    const schedulePriorityA = priorityOf(a.scheduleState);
    const schedulePriorityB = priorityOf(b.scheduleState);
    const scheduleState = schedulePriorityA >= schedulePriorityB ? a.scheduleState : b.scheduleState;
    // Waiting-review state: overdue > waiting > undefined
    const waitingPriorityA = a.waitingReviewState === 'overdue' ? 2 : a.waitingReviewState === 'waiting' ? 1 : 0;
    const waitingPriorityB = b.waitingReviewState === 'overdue' ? 2 : b.waitingReviewState === 'waiting' ? 1 : 0;
    const waitingReviewState = waitingPriorityA >= waitingPriorityB ? a.waitingReviewState : b.waitingReviewState;
    return {
        running: a.running + b.running,
        approval: a.approval + b.approval,
        planReview: a.planReview + b.planReview,
        question: a.question + b.question,
        done: a.done + b.done,
        subagents: a.subagents + b.subagents,
        scheduledSessions: a.scheduledSessions + b.scheduledSessions,
        scheduledCount: a.scheduledCount + b.scheduledCount,
        scheduleState,
        waitingReviewCount: a.waitingReviewCount + b.waitingReviewCount,
        waitingReviewState,
    };
}
// ── Helpers ──
/**
 * Strip the `session-` / `webhook-` prefix from a Session id.
 *
 * dsh-gitea-dispatch publishes its waiting map keyed by the host SessionId, but
 * its HTTP endpoints key by this normalized form. Accepting both here keeps the
 * badge working across that publisher's conventions without knowing which is in
 * play.
 */
function stripSessionPrefix(id) {
    return id.replace(/^(?:session|webhook)-/, '');
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
export function summarizeGroupStatus(nodes, sessionIds, waitingReviewSummary, scheduleSummary) {
    let running = 0;
    let approval = 0;
    let planReview = 0;
    let question = 0;
    let done = 0;
    let subagents = 0;
    for (const n of nodes) {
        if (n.blank || n.archived)
            continue;
        if (n.pendingInteraction === 'approval') {
            approval += 1;
            continue;
        }
        if (n.pendingInteraction === 'plan-review') {
            planReview += 1;
            continue;
        }
        if (n.pendingInteraction === 'question') {
            question += 1;
            continue;
        }
        if (n.running)
            running += 1;
        else if (n.completed)
            done += 1;
        subagents += n.runningSubagentCount;
    }
    // Aggregate schedule summary from dsh-later
    let scheduledSessions = 0;
    let scheduledCount = 0;
    let scheduleState = undefined;
    if (scheduleSummary && sessionIds.length > 0) {
        let totalSessions = 0;
        let totalCount = 0;
        let highestPriority = 0; // 0=none, 1=scheduled, 2=urgent, 3=overdue
        for (const id of sessionIds) {
            const entry = scheduleSummary.get(id);
            if (entry) {
                totalSessions += 1;
                totalCount += entry.count;
                const priority = entry.state === 'overdue' ? 3 : entry.state === 'urgent' ? 2 : 1;
                if (priority > highestPriority)
                    highestPriority = priority;
            }
        }
        scheduledSessions = totalSessions;
        scheduledCount = totalCount;
        scheduleState = highestPriority === 3 ? 'overdue' : highestPriority === 2 ? 'urgent' : highestPriority === 1 ? 'scheduled' : undefined;
    }
    // Aggregate waiting-review summary from dsh-gitea-dispatch (its #16).
    //
    // Counts **members**, not PRs: one session waits on exactly one PR, and the
    // badge's number must mean "how many sessions in this folder need attention".
    // `overdue` outranks `waiting` for the dot color, mirroring the schedule rule.
    let waitingReviewCount = 0;
    let waitingReviewState = undefined;
    if (waitingReviewSummary && sessionIds.length > 0) {
        for (const id of sessionIds) {
            const entry = waitingReviewSummary.get(id) ?? waitingReviewSummary.get(stripSessionPrefix(id));
            if (entry === undefined)
                continue;
            waitingReviewCount += 1;
            if (entry.state === 'overdue')
                waitingReviewState = 'overdue';
            else if (waitingReviewState === undefined)
                waitingReviewState = 'waiting';
        }
    }
    return {
        running, approval, planReview, question, done, subagents,
        scheduledSessions, scheduledCount, scheduleState,
        waitingReviewCount, waitingReviewState,
    };
}
//# sourceMappingURL=group-status.js.map