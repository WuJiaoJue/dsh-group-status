/**
 * Fork-owned: HOC that wraps ProjectRowItem to inject group status badge externally.
 *
 * This keeps `tree.ts` and `Rows.tsx` identical to upstream — the only vendored
 * change is in `WorkspaceBrowser.tsx` where we use the wrapped version.
 *
 * The HOC computes `liveStatus` from `group.sessions` (which is always populated
 * after the refactor) and renders the badge for collapsed groups.
 *
 * @module
 */
import React, { useMemo } from 'react'
import type { GroupNode } from '../tree.ts'
import { EMPTY_LIVE_STATUS, summarizeGroupStatus } from '../group-status.ts'
import type { ScheduleSummaryMap, WaitingReviewSummaryMap } from '../group-status.ts'
import { groupLiveBadge } from './GroupBadge.tsx'
import type { ResolvedBadgeSettings } from '../badge-settings.ts'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'

/** The standard locale seat, prop-passed from the browser root. */
type RowTranslate = WorkspaceBrowserProps['t']

/**
 * Props that the HOC needs beyond what ProjectRowItem already receives.
 * These are the cross-plugin summaries that upstream doesn't know about.
 */
export interface WithGroupBadgeExtraProps {
  scheduleSummary?: ScheduleSummaryMap | undefined
  waitingReviewSummary?: WaitingReviewSummaryMap | undefined
  badgeSettings: ResolvedBadgeSettings
  t: RowTranslate
}

/**
 * HOC that wraps ProjectRowItem to inject the group status badge.
 *
 * The wrapped component computes `liveStatus` externally (instead of inside
 * `deriveGroups()`) and renders the badge alongside the original row.
 *
 * @param ProjectRowItem - the upstream ProjectRowItem component
 * @returns a wrapped version that renders the badge for collapsed groups
 */
export function withGroupBadge<P extends { group: GroupNode; settings: ResolvedBadgeSettings }>(
  ProjectRowItem: React.ComponentType<P>,
): React.ComponentType<Omit<P, 'settings'> & WithGroupBadgeExtraProps> {
  function WrappedProjectRowItem(props: Omit<P, 'settings'> & WithGroupBadgeExtraProps) {
    const {
      group,
      scheduleSummary,
      waitingReviewSummary,
      badgeSettings,
      t,
      ...restProps
    } = props

    // Compute liveStatus externally — same logic as before, but here instead
    // of inside deriveGroups(). This keeps tree.ts upstream-clean.
    const liveStatus = useMemo(() => {
      if (group.expanded) return EMPTY_LIVE_STATUS
      // Extract member IDs from the sessions list
      const memberIds = group.sessions.map(s => s.id)
      return summarizeGroupStatus(
        group.sessions,
        memberIds,
        waitingReviewSummary,
        scheduleSummary,
      )
    }, [group, scheduleSummary, waitingReviewSummary])

    // Inject liveStatus into the group for the badge renderer and hover content
    const groupWithStatus: GroupNode = { ...group, liveStatus }

    return (
      <>
        <ProjectRowItem {...(restProps as unknown as P)} group={groupWithStatus} settings={badgeSettings} />
        {groupLiveBadge(groupWithStatus, t, badgeSettings)}
      </>
    )
  }

  WrappedProjectRowItem.displayName = `withGroupBadge(${ProjectRowItem.displayName || ProjectRowItem.name || 'ProjectRowItem'})`
  return WrappedProjectRowItem
}
