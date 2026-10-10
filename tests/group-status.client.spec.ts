/**
 * Fork-owned coverage for the one thing this package adds: the aggregated status
 * of a *folded* workspace group (`liveStatus` on every group row).
 *
 * The vendored upstream specs cannot run here — `@deepseek-ai/dsh-client-test-runtime`
 * deep-imports sources that DSH does not publish (see `vitest.config.ts`) — and
 * the vendored `tests/rows.client.spec.tsx` is therefore excluded. This spec
 * covers the same derivation through `deriveGroups`, which is the module's public
 * surface and needs no renderer runtime.
 */
import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  SessionPendingInteraction, SessionStatus, SessionStatusSnapshot,
} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { deriveGroups, type GroupLiveStatus, type GroupNode } from '../src/client/tree.ts'

const sid = (id: string): SessionId => id as SessionId
const wid = (id: string): WorkspaceId => id as WorkspaceId

const summary = (id: string, updatedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: sid(id), title: id, displayTitle: id, running: false, blank: false,
  updatedAt, retainedBy: {}, ...overrides,
})

const list = (
  items: readonly SessionSummary[],
  projectionsBySession: SessionListState['projectionsBySession'] = {},
): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready',
  projectionsBySession,
})

/** Subagent catalog projection: the parent's running direct children. */
const children = (parent: string, childIds: readonly string[]): SessionListState['projectionsBySession'] => ({
  [parent]: {
    values: {
      subagentCatalog: childIds.map(id => ({ id: sid(id), mode: 'continuable', label: id, createdAt: 1 })),
    },
  } as SessionListState['projectionsBySession'][string],
})

const workspace = (id: string, sessionIds: readonly string[]): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title: id,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const rowState = (options: { pinned?: readonly string[]; archived?: readonly string[] } = {}) => ({
  pinnedSessionIds: (options.pinned ?? []).map(sid),
  archivedSessionIds: (options.archived ?? []).map(sid),
  archivedFilter: 'default' as const,
})

const status = (
  pendingInteraction: SessionPendingInteraction | undefined,
  overrides: Partial<SessionStatus> = {},
): SessionStatus => ({ running: undefined, pendingInteraction, completionUnread: false, ...overrides })

const pending = (kind: 'approval' | 'plan-review' | 'question', sessionId: string): SessionPendingInteraction => (
  { key: `${kind}:1`, kind, sessionId: sid(sessionId) } as SessionPendingInteraction
)

const EMPTY: GroupLiveStatus = {
  running: 0, approval: 0, planReview: 0, question: 0, done: 0, subagents: 0,
  scheduledSessions: 0, scheduledCount: 0, scheduleState: undefined,
  waitingReviewCount: 0, waitingReviewState: undefined,
}

/** Fold (or expand) the single fixture workspace and return its group row. */
const groupOf = (
  state: SessionListState,
  statuses: SessionStatusSnapshot,
  options: {
    expanded?: boolean
    archived?: readonly string[]
    schedule?: ReadonlyMap<string, { count: number; pausedCount: number; nextAt?: number; state: 'scheduled' | 'urgent' | 'overdue' }>
    waiting?: ReadonlyMap<string, { prNumber: number; state: 'waiting' | 'overdue' }>
  } = {},
): GroupNode => {
  const [group] = deriveGroups(
    state,
    [workspace('alpha', state.ids)],
    rowState({ archived: options.archived }),
    statuses,
    { expandedGroups: options.expanded === true ? ['alpha'] : [] },
    options.waiting,
    options.schedule,
  )
  return group!
}

describe('folded group live status', () => {
  it('counts every hidden member while the folder is folded', () => {
    const state = list([summary('a', 30), summary('b', 20), summary('c', 10)])
    const statuses: SessionStatusSnapshot = new Map([
      [sid('a'), status(pending('approval', 'a'))],
      [sid('b'), status(undefined, { running: true })],
      [sid('c'), status(undefined, { completionUnread: true })],
    ])
    const group = groupOf(state, statuses)
    expect(group.expanded).toBe(false)
    // The fork's whole point: the folded row carries the aggregate…
    expect(group.liveStatus).toEqual({ ...EMPTY, approval: 1, running: 1, done: 1 })
    // …while the rows themselves stay unrendered.
    expect(group.sessions).toEqual([])
    expect(group.sessionCount).toBe(3)
  })

  it('computes the same aggregate when the group is expanded', () => {
    const state = list([summary('a', 30), summary('b', 20)])
    const statuses: SessionStatusSnapshot = new Map([
      [sid('a'), status(pending('plan-review', 'a'))],
      [sid('b'), status(undefined, { running: true })],
    ])
    const group = groupOf(state, statuses, { expanded: true })
    expect(group.sessions.map(session => session.id)).toEqual([sid('a'), sid('b')])
    expect(group.liveStatus).toEqual({ ...EMPTY, planReview: 1, running: 1 })
  })

  it('keeps the pending classes exclusive per member, outranking its running flag', () => {
    const state = list([summary('approving', 30), summary('planning', 20), summary('asking', 10)])
    const statuses: SessionStatusSnapshot = new Map([
      [sid('approving'), status(pending('approval', 'approving'), { running: true })],
      [sid('planning'), status(pending('plan-review', 'planning'), { running: true })],
      [sid('asking'), status(pending('question', 'asking'))],
    ])
    expect(groupOf(state, statuses).liveStatus).toEqual({ ...EMPTY, approval: 1, planReview: 1, question: 1 })
  })

  it('counts each member\'s running direct children as subagents', () => {
    const state = list(
      [summary('parent', 30), summary('child-a', 20), summary('child-b', 10), summary('child-stopped', 5)],
      children('parent', ['child-a', 'child-b', 'child-stopped']),
    )
    const statuses: SessionStatusSnapshot = new Map([
      [sid('child-a'), status(undefined, { running: true })],
      [sid('child-b'), status(undefined, { running: true })],
      [sid('child-stopped'), status(undefined, { running: false })],
    ])
    // Children are members here too, so they also count as running rows; the
    // subagent tally is the one that must not double-count the stopped child.
    expect(groupOf(state, statuses).liveStatus).toEqual({ ...EMPTY, running: 2, subagents: 2 })
  })

  it('skips blank, archived and stale members', () => {
    const state = list([
      summary('blank', 40, { blank: true }),
      summary('archived', 30),
      summary('live', 20),
    ])
    const statuses: SessionStatusSnapshot = new Map([
      [sid('blank'), status(pending('approval', 'blank'))],
      [sid('archived'), status(undefined, { running: true })],
      [sid('live'), status(undefined, { running: true })],
    ])
    expect(groupOf(state, statuses, { archived: ['archived'] }).liveStatus).toEqual({ ...EMPTY, running: 1 })
  })

  it('reports an idle group as all-zero', () => {
    const state = list([summary('a', 30), summary('b', 20)])
    expect(groupOf(state, new Map()).liveStatus).toEqual(EMPTY)
  })
})

describe('cross-plugin aggregation', () => {
  it('sums scheduled tasks and keeps the highest-priority schedule state', () => {
    const state = list([summary('a', 30), summary('b', 20), summary('idle', 10)])
    const schedule = new Map([
      ['a', { count: 2, pausedCount: 1, nextAt: 1_000, state: 'scheduled' as const }],
      ['b', { count: 3, pausedCount: 0, nextAt: 500, state: 'overdue' as const }],
    ])
    expect(groupOf(state, new Map(), { schedule }).liveStatus).toEqual({
      ...EMPTY, scheduledSessions: 2, scheduledCount: 5, scheduleState: 'overdue',
    })
  })

  it('counts members waiting for review through both published key conventions', () => {
    const state = list([summary('plain', 30), summary('session-prefixed', 20), summary('idle', 10)])
    const waiting = new Map([
      // dsh-gitea-dispatch publishes host SessionIds; its HTTP endpoints use the
      // normalized form. Both must land on the same member.
      ['plain', { prNumber: 7, state: 'waiting' as const }],
      ['prefixed', { prNumber: 8, state: 'overdue' as const }],
    ])
    expect(groupOf(state, new Map(), { waiting }).liveStatus).toEqual({
      ...EMPTY, waitingReviewCount: 2, waitingReviewState: 'overdue',
    })
  })

  it('degrades to no cross-plugin signal when neither publisher is installed', () => {
    const state = list([summary('a', 30)])
    const group = groupOf(state, new Map([[sid('a'), status(undefined, { running: true })]]))
    expect(group.liveStatus).toEqual({ ...EMPTY, running: 1 })
  })
})
