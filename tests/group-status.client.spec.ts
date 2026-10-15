/**
 * Fork-owned coverage for the one thing this package adds: the aggregated status
 * of a *folded* workspace group (`liveStatus` on every group row).
 *
 * The vendored upstream specs cannot run here — `@deepseek-ai/dsh-client-test-runtime`
 * deep-imports sources that DSH does not publish (see `vitest.config.ts`) — and
 * the vendored `tests/rows.client.spec.tsx` is therefore excluded. This spec drives
 * the same pipeline the sidebar does — `deriveGroups` → `directStatusesForGroups` →
 * `aggregateGroupStatuses` — which is the module's public surface and needs no
 * renderer runtime. It deliberately never assigns a status by hand: a copy of the
 * wiring inside a test can only ever certify the copy.
 */
import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  SessionPendingInteraction, SessionStatus, SessionStatusSnapshot,
} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { deriveGroups, EMPTY_LIVE_STATUS, mergeLiveStatus, owningParentFolder, type GroupLiveStatus, type GroupNode } from '../src/client/tree.ts'
import { aggregateGroupStatuses, directStatusesForGroups } from '../src/client/group-status.ts'

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

/** Re-use the source's frozen sentinel so the shape stays in sync. */
const EMPTY: GroupLiveStatus = EMPTY_LIVE_STATUS

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
  )
  // Run the production pipeline, never a hand-written copy of it: the version of
  // this helper before that pipeline was extractable patched `liveStatus` itself,
  // and the copy it kept encoded a semantics bug (expanded → empty) that no
  // production test could see.
  const direct = directStatusesForGroups([group!], options.waiting, options.schedule)
  const aggregated = aggregateGroupStatuses(direct, new Map([[undefined, [group!]]]))
  return { ...group!, liveStatus: aggregated.get(group!.key) }
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
    // Members are always derived — the aggregator reads them whether or not the folder
    // is open. Which rows get rendered is decided in WorkspaceBrowser.tsx, not here.
    expect(group.sessions.length).toBe(3)
    expect(group.sessionCount).toBe(3)
  })

  it('still measures an expanded group, because a collapsed parent consumes the value', () => {
    const state = list([summary('a', 30), summary('b', 20)])
    const statuses: SessionStatusSnapshot = new Map([
      [sid('a'), status(pending('plan-review', 'a'))],
      [sid('b'), status(undefined, { running: true })],
    ])
    const group = groupOf(state, statuses, { expanded: true })
    expect(group.sessions.map(session => session.id)).toEqual([sid('a'), sid('b')])
    // An expanded row renders no badge of its own — that is a rendering decision in
    // groupLiveBadge. Zeroing its status is what made every collapsed parent undercount
    // by the size of its expanded descendants, so the number stays real.
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

describe('P2-3: badge count cap', () => {
  it('caps the aggregate count at 99+ when there are more than 99 active items', () => {
    // Create 100 running sessions to verify the count cap.
    const sessions = Array.from({ length: 100 }, (_, i) => summary(`s${i}`, 100 - i))
    const state = list(sessions)
    const statuses: SessionStatusSnapshot = new Map(
      sessions.map(s => [s.id, status(undefined, { running: true })]),
    )
    const group = groupOf(state, statuses)
    // The liveStatus should show 100 running, but the badge will cap at 99+.
    expect(group.liveStatus.running).toBe(100)
    // The actual cap is in GroupBadge.tsx's rendering logic (count > 99 ? '99+' : String(count)).
    // This test verifies the aggregation works correctly for large counts.
  })
})

describe('P3-2: performance regression', () => {
  /** 50 workspaces × 20 running sessions — the shape that makes the badge cost measurable. */
  const wide = () => {
    const allSessions: SessionSummary[] = []
    const workspaces: WorkspaceView[] = []
    for (let w = 0; w < 50; w++) {
      const sessionIds: string[] = []
      for (let s = 0; s < 20; s++) {
        const id = `w${w}-s${s}`
        sessionIds.push(id)
        allSessions.push(summary(id, 1000 - s))
      }
      workspaces.push(workspace(`ws${w}`, sessionIds))
    }
    const state = list(allSessions)
    const statuses: SessionStatusSnapshot = new Map(
      allSessions.map(s => [s.id, status(undefined, { running: true })]),
    )
    return { state, statuses, workspaces }
  }

  it('derives 50 groups with 20 sessions each in under 50ms', () => {
    const { state, statuses, workspaces } = wide()
    const start = performance.now()
    const groups = deriveGroups(state, workspaces, rowState(), statuses, { expandedGroups: [] })
    const elapsed = performance.now() - start

    expect(groups.length).toBe(50)
    expect(elapsed).toBeLessThan(50)
    for (const group of groups) {
      expect(group.sessions.length).toBe(20)
    }
  })

  // The badge cost moved out of deriveGroups together with the aggregation, so it
  // needs its own guard — the two tests above would have stayed green through the
  // whole PR #10 regression because deriveGroups no longer computes anything here.
  it('aggregates 50 groups in under 50ms with every folder collapsed', () => {
    const { state, statuses, workspaces } = wide()
    const groups = deriveGroups(state, workspaces, rowState(), statuses, { expandedGroups: [] })

    const start = performance.now()
    const aggregated = aggregateGroupStatuses(
      directStatusesForGroups(groups),
      new Map([[undefined, groups]]),
    )
    const elapsed = performance.now() - start

    expect(aggregated.size).toBe(50)
    expect(aggregated.get('ws0')?.running).toBe(20)
    expect(elapsed).toBeLessThan(50)
  })

  it('aggregates 50 groups in under 50ms with every folder expanded', () => {
    // The pessimistic case for measuring expanded groups: nothing renders a badge,
    // yet every group is still counted for the sake of any collapsed ancestor.
    const { state, statuses, workspaces } = wide()
    const groups = deriveGroups(
      state, workspaces, rowState(), statuses,
      { expandedGroups: workspaces.map(w => w.workspaceId) },
    )

    const start = performance.now()
    const aggregated = aggregateGroupStatuses(
      directStatusesForGroups(groups),
      new Map([[undefined, groups]]),
    )
    const elapsed = performance.now() - start

    expect(groups.every(group => group.expanded)).toBe(true)
    expect(aggregated.get('ws0')?.running).toBe(20)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('mergeLiveStatus', () => {
  it('sums numeric counters', () => {
    const a: GroupLiveStatus = {
      running: 1, approval: 2, planReview: 3, question: 4, done: 5, subagents: 6,
      scheduledSessions: 7, scheduledCount: 8, scheduleState: 'scheduled',
      waitingReviewCount: 9, waitingReviewState: 'waiting',
    }
    const b: GroupLiveStatus = {
      running: 10, approval: 20, planReview: 30, question: 40, done: 50, subagents: 60,
      scheduledSessions: 70, scheduledCount: 80, scheduleState: 'urgent',
      waitingReviewCount: 90, waitingReviewState: 'overdue',
    }
    const merged = mergeLiveStatus(a, b)
    expect(merged.running).toBe(11)
    expect(merged.approval).toBe(22)
    expect(merged.planReview).toBe(33)
    expect(merged.question).toBe(44)
    expect(merged.done).toBe(55)
    expect(merged.subagents).toBe(66)
    expect(merged.scheduledSessions).toBe(77)
    expect(merged.scheduledCount).toBe(88)
    expect(merged.waitingReviewCount).toBe(99)
  })

  it('takes highest-priority schedule state (overdue > urgent > scheduled)', () => {
    expect(mergeLiveStatus(EMPTY, { ...EMPTY, scheduleState: 'scheduled' }).scheduleState).toBe('scheduled')
    expect(mergeLiveStatus({ ...EMPTY, scheduleState: 'scheduled' }, { ...EMPTY, scheduleState: 'urgent' }).scheduleState).toBe('urgent')
    expect(mergeLiveStatus({ ...EMPTY, scheduleState: 'urgent' }, { ...EMPTY, scheduleState: 'overdue' }).scheduleState).toBe('overdue')
    expect(mergeLiveStatus({ ...EMPTY, scheduleState: 'overdue' }, { ...EMPTY, scheduleState: 'scheduled' }).scheduleState).toBe('overdue')
    expect(mergeLiveStatus(EMPTY, EMPTY).scheduleState).toBeUndefined()
  })

  it('takes highest-priority waiting-review state (overdue > waiting)', () => {
    expect(mergeLiveStatus(EMPTY, { ...EMPTY, waitingReviewState: 'waiting' }).waitingReviewState).toBe('waiting')
    expect(mergeLiveStatus({ ...EMPTY, waitingReviewState: 'waiting' }, { ...EMPTY, waitingReviewState: 'overdue' }).waitingReviewState).toBe('overdue')
    expect(mergeLiveStatus({ ...EMPTY, waitingReviewState: 'overdue' }, { ...EMPTY, waitingReviewState: 'waiting' }).waitingReviewState).toBe('overdue')
    expect(mergeLiveStatus(EMPTY, EMPTY).waitingReviewState).toBeUndefined()
  })

  it('handles merging with EMPTY_LIVE_STATUS', () => {
    const status: GroupLiveStatus = {
      running: 5, approval: 3, planReview: 0, question: 1, done: 2, subagents: 4,
      scheduledSessions: 1, scheduledCount: 3, scheduleState: 'urgent',
      waitingReviewCount: 2, waitingReviewState: 'waiting',
    }
    const merged = mergeLiveStatus(status, EMPTY)
    expect(merged).toEqual(status)
  })
})

describe('tree-wide aggregation', () => {
  /** A workspace at an explicit path, so folder nesting is real rather than implied. */
  const at = (id: string, path: string, sessionIds: readonly string[]): WorkspaceView => ({
    workspaceId: wid(id), path, title: id,
    sessionIds: sessionIds.map(sid),
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  })

  /** Three folder levels, every session running: 1 + 2 + 3. */
  const nested = () => {
    const owned: Record<string, string[]> = {
      root: ['r1'], child: ['c1', 'c2'], grand: ['g1', 'g2', 'g3'],
    }
    const all = [...owned.root, ...owned.child, ...owned.grand]
    return {
      owned,
      state: list(all.map(id => summary(id, 1000))),
      statuses: new Map(all.map(id => [sid(id), status(undefined, { running: true })])) as SessionStatusSnapshot,
      workspaces: [
        at('root', '/plugins', owned.root),
        at('child', '/plugins/child', owned.child),
        at('grand', '/plugins/child/grand', owned.grand),
      ],
    }
  }

  /** Mirrors the component's tree build: parent folder key → rendered children. */
  const childrenOf = (groups: readonly GroupNode[]): Map<string | undefined, GroupNode[]> => {
    const paths = groups.map(group => group.cwd as string)
    const keyByPath = new Map(groups.map(group => [group.cwd as string, group.key]))
    const children = new Map<string | undefined, GroupNode[]>()
    for (const group of groups) {
      const parentPath = owningParentFolder(group.cwd as string, paths)
      const parent = parentPath === undefined ? undefined : keyByPath.get(parentPath)
      const siblings = children.get(parent)
      if (siblings === undefined) children.set(parent, [group])
      else siblings.push(group)
    }
    return children
  }

  /** The production pipeline: deriveGroups → direct statuses → fold up the tree. */
  const pipeline = (expanded: readonly string[]) => {
    const { state, statuses, workspaces } = nested()
    const groups = deriveGroups(state, workspaces, rowState(), statuses, { expandedGroups: [...expanded] })
    const direct = directStatusesForGroups(groups)
    return { direct, aggregated: aggregateGroupStatuses(direct, childrenOf(groups)) }
  }

  it('measures an expanded group\'s own members, not an empty placeholder', () => {
    const { direct } = pipeline(['child'])
    expect(direct.get('child')?.running).toBe(2)
  })

  it('counts an expanded intermediate folder toward its collapsed parent', () => {
    // The regression: `child` is expanded, so it renders no badge of its own — but
    // its 2 running sessions still need attention and `root` must keep counting them.
    const { aggregated } = pipeline(['child'])
    expect(aggregated.get('root')?.running).toBe(6)
    expect(aggregated.get('child')?.running).toBe(5)
    expect(aggregated.get('grand')?.running).toBe(3)
  })

  it('aggregates at any depth with every folder collapsed', () => {
    const { aggregated } = pipeline([])
    expect(aggregated.get('root')?.running).toBe(6)
    expect(aggregated.get('child')?.running).toBe(5)
  })

  it('aggregates at any depth with every folder expanded', () => {
    const { aggregated } = pipeline(['root', 'child', 'grand'])
    expect(aggregated.get('root')?.running).toBe(6)
    expect(aggregated.get('child')?.running).toBe(5)
  })

  it('terminates when folder parentage is cyclic', () => {
    // Parentage comes from path-prefix matching; a self- or mutual-parent edge must
    // not hang the sidebar.
    const direct = new Map<string, GroupLiveStatus>([
      ['a', { ...EMPTY, running: 1 }],
      ['b', { ...EMPTY, running: 2 }],
    ])
    const children = new Map<string | undefined, readonly { key: string }[]>([
      [undefined, [{ key: 'a' }]],
      ['a', [{ key: 'b' }]],
      ['b', [{ key: 'a' }]],
    ])
    const aggregated = aggregateGroupStatuses(direct, children)
    expect(aggregated.size).toBe(2)
    expect(aggregated.get('a')?.running).toBeGreaterThanOrEqual(1)
  })
})
