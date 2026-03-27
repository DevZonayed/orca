import { detectAgentStatusFromTitle } from '@/lib/agent-status'
import type { Worktree, Repo, TerminalTab } from '../../../../shared/types'

type SortBy = 'name' | 'recent' | 'repo'

/**
 * Build a comparator for sorting worktrees based on the current sort mode.
 */
export function buildWorktreeComparator(
  sortBy: SortBy,
  tabsByWorktree: Record<string, TerminalTab[]> | null,
  repoMap: Map<string, Repo>,
  now: number = Date.now()
): (a: Worktree, b: Worktree) => number {
  return (a, b) => {
    switch (sortBy) {
      case 'name':
        return a.displayName.localeCompare(b.displayName)
      case 'recent': {
        // Recent means meaningful recent work, not selection time.
        return (
          computeSmartScore(b, tabsByWorktree, now) - computeSmartScore(a, tabsByWorktree, now) ||
          b.lastActivityAt - a.lastActivityAt ||
          a.displayName.localeCompare(b.displayName)
        )
      }
      case 'repo': {
        const ra = repoMap.get(a.repoId)?.displayName ?? ''
        const rb = repoMap.get(b.repoId)?.displayName ?? ''
        const cmp = ra.localeCompare(rb)
        return cmp !== 0 ? cmp : a.displayName.localeCompare(b.displayName)
      }
      default:
        return 0
    }
  }
}

/**
 * Compute a recent-work score for a worktree.
 * Higher score = higher in the list.
 *
 * Scoring:
 *   running AI job    → +60
 *   needs attention   → +35
 *   unread            → +18
 *   open terminal     → +12
 *   linked PR         → +10
 *   linked issue      → +6
 *   recent activity   → +24 (decays over 24 hours)
 */
export function computeSmartScore(
  worktree: Worktree,
  tabsByWorktree: Record<string, TerminalTab[]> | null,
  now: number = Date.now()
): number {
  const tabs = tabsByWorktree?.[worktree.id] ?? []
  const liveTabs = tabs.filter((t) => t.ptyId)

  let score = 0

  // Running: any live PTY with an AI agent actively working
  const isRunning = liveTabs.some((t) => detectAgentStatusFromTitle(t.title) === 'working')
  if (isRunning) {
    score += 60
  }

  // Needs attention: permission prompt in a live agent terminal
  const needsAttention = liveTabs.some((t) => detectAgentStatusFromTitle(t.title) === 'permission')
  if (needsAttention) {
    score += 35
  }

  // Unread
  if (worktree.isUnread) {
    score += 18
  }

  // Live terminals are a strong sign of ongoing work, even if no agent title is detected.
  if (liveTabs.length > 0) {
    score += 12
  }

  if (worktree.linkedPR !== null) {
    score += 10
  }

  if (worktree.linkedIssue !== null) {
    score += 6
  }

  // Recent meaningful activity should stay relevant for the rest of the day,
  // not vanish after an hour.
  const activityAge = now - (worktree.lastActivityAt || 0)
  if (worktree.lastActivityAt > 0) {
    const ONE_DAY = 24 * 60 * 60 * 1000
    score += 24 * Math.max(0, 1 - activityAge / ONE_DAY)
  }

  return score
}
