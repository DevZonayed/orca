import React, { useMemo, useCallback, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '@/store'
import WorktreeCard from './WorktreeCard'
import type { Worktree, Repo } from '../../../../shared/types'

function branchName(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

// ── Row types for the virtualizer ───────────────────────────────
type GroupHeaderRow = { type: 'header'; label: string; count: number }
type WorktreeRow = { type: 'item'; worktree: Worktree; repo: Repo | undefined }
type Row = GroupHeaderRow | WorktreeRow

const WorktreeList = React.memo(function WorktreeList() {
  // ── Granular selectors (each is a primitive or shallow-stable ref) ──
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const repos = useAppStore((s) => s.repos)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const groupBy = useAppStore((s) => s.groupBy)
  const sortBy = useAppStore((s) => s.sortBy)
  const showActiveOnly = useAppStore((s) => s.showActiveOnly)
  const filterRepoId = useAppStore((s) => s.filterRepoId)

  // Only read tabsByWorktree when showActiveOnly is on (avoid subscription otherwise)
  const tabsByWorktree = useAppStore((s) => (showActiveOnly ? s.tabsByWorktree : null))

  // PR cache only when grouping by pr-status
  const prCache = useAppStore((s) => (groupBy === 'pr-status' ? s.prCache : null))

  const scrollRef = useRef<HTMLDivElement>(null)

  const repoMap = useMemo(() => {
    const m = new Map<string, Repo>()
    for (const r of repos) m.set(r.id, r)
    return m
  }, [repos])

  // Flatten, filter, sort
  const worktrees = useMemo(() => {
    let all: Worktree[] = Object.values(worktreesByRepo).flat()

    // Filter archived
    all = all.filter((w) => !w.isArchived)

    // Filter by repo
    if (filterRepoId) {
      all = all.filter((w) => w.repoId === filterRepoId)
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      all = all.filter(
        (w) =>
          w.displayName.toLowerCase().includes(q) ||
          branchName(w.branch).toLowerCase().includes(q) ||
          (repoMap.get(w.repoId)?.displayName ?? '').toLowerCase().includes(q)
      )
    }

    // Filter active only
    if (showActiveOnly && tabsByWorktree) {
      all = all.filter((w) => {
        const tabs = tabsByWorktree[w.id] ?? []
        return tabs.some((t) => t.ptyId)
      })
    }

    // Sort
    all.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.displayName.localeCompare(b.displayName)
        case 'recent':
          return b.sortOrder - a.sortOrder
        case 'repo': {
          const ra = repoMap.get(a.repoId)?.displayName ?? ''
          const rb = repoMap.get(b.repoId)?.displayName ?? ''
          const cmp = ra.localeCompare(rb)
          return cmp !== 0 ? cmp : a.displayName.localeCompare(b.displayName)
        }
        default:
          return 0
      }
    })

    return all
  }, [worktreesByRepo, filterRepoId, searchQuery, showActiveOnly, sortBy, repoMap, tabsByWorktree])

  // Collapsed group state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  // Build flat row list for virtualizer
  const rows: Row[] = useMemo(() => {
    const result: Row[] = []

    if (groupBy === 'none') {
      for (const w of worktrees) {
        result.push({ type: 'item', worktree: w, repo: repoMap.get(w.repoId) })
      }
      return result
    }

    // Group items
    const grouped = new Map<string, Worktree[]>()
    for (const w of worktrees) {
      let label: string
      if (groupBy === 'repo') {
        label = repoMap.get(w.repoId)?.displayName ?? 'Unknown'
      } else {
        // pr-status
        const repo = repoMap.get(w.repoId)
        const branch = branchName(w.branch)
        const cacheKey = repo ? `${repo.path}::${branch}` : ''
        const prEntry = cacheKey && prCache ? prCache[cacheKey] : undefined
        const pr = prEntry !== undefined ? prEntry.data : undefined
        label = pr ? pr.state.charAt(0).toUpperCase() + pr.state.slice(1) : 'No PR'
      }
      if (!grouped.has(label)) grouped.set(label, [])
      grouped.get(label)!.push(w)
    }

    for (const [label, items] of grouped) {
      const isCollapsed = collapsedGroups.has(label)
      result.push({ type: 'header', label, count: items.length })
      if (!isCollapsed) {
        for (const w of items) {
          result.push({ type: 'item', worktree: w, repo: repoMap.get(w.repoId) })
        }
      }
    }

    return result
  }, [groupBy, worktrees, repoMap, prCache, collapsedGroups])

  // ── TanStack Virtual ──────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index].type === 'header' ? 28 : 56),
    overscan: 10,
    getItemKey: (index) => {
      const row = rows[index]
      return row.type === 'header' ? `hdr:${row.label}` : `wt:${row.worktree.id}`
    }
  })

  if (worktrees.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
        No worktrees found
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto px-1 scrollbar-sleek">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const row = rows[vItem.index]

          if (row.type === 'header') {
            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 right-0"
                style={{ transform: `translateY(${vItem.start}px)` }}
              >
                <button
                  className="flex items-center gap-1 px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-full text-left hover:text-foreground transition-colors"
                  onClick={() => toggleGroup(row.label)}
                >
                  <span
                    className="inline-block transition-transform text-[8px]"
                    style={{
                      transform: collapsedGroups.has(row.label) ? 'rotate(-90deg)' : 'rotate(0deg)'
                    }}
                  >
                    &#9660;
                  </span>
                  {row.label}
                  <span className="ml-auto text-[9px] font-normal tabular-nums">{row.count}</span>
                </button>
              </div>
            )
          }

          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 right-0"
              style={{ transform: `translateY(${vItem.start}px)` }}
            >
              <WorktreeCard
                worktree={row.worktree}
                repo={row.repo}
                isActive={activeWorktreeId === row.worktree.id}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default WorktreeList
