import { useAppStore } from './index'

// ─── Repos ──────────────────────────────────────────────────────────
export const useRepos = () => useAppStore((s) => s.repos)
export const useActiveRepoId = () => useAppStore((s) => s.activeRepoId)
export const useActiveRepo = () =>
  useAppStore((s) => s.repos.find((r) => r.id === s.activeRepoId) ?? null)

// ─── Worktrees ──────────────────────────────────────────────────────
export const useActiveWorktreeId = () => useAppStore((s) => s.activeWorktreeId)
export const useWorktreesForRepo = (repoId: string | null) =>
  useAppStore((s) => (repoId ? (s.worktreesByRepo[repoId] ?? []) : []))
export const useAllWorktrees = () => useAppStore((s) => Object.values(s.worktreesByRepo).flat())

// ─── Terminals ──────────────────────────────────────────────────────
export const useActiveTerminalTabs = () =>
  useAppStore((s) => (s.activeWorktreeId ? (s.tabsByWorktree[s.activeWorktreeId] ?? []) : []))
export const useActiveTabId = () => useAppStore((s) => s.activeTabId)

// ─── Settings ───────────────────────────────────────────────────────
export const useSettings = () => useAppStore((s) => s.settings)

// ─── UI ─────────────────────────────────────────────────────────────
export const useSidebarOpen = () => useAppStore((s) => s.sidebarOpen)
export const useSidebarWidth = () => useAppStore((s) => s.sidebarWidth)
export const useActiveView = () => useAppStore((s) => s.activeView)
export const useActiveModal = () => useAppStore((s) => s.activeModal)
export const useModalData = () => useAppStore((s) => s.modalData)
export const useSearchQuery = () => useAppStore((s) => s.searchQuery)
export const useGroupBy = () => useAppStore((s) => s.groupBy)
export const useSortBy = () => useAppStore((s) => s.sortBy)
export const useShowActiveOnly = () => useAppStore((s) => s.showActiveOnly)
export const useFilterRepoId = () => useAppStore((s) => s.filterRepoId)

// ─── GitHub ─────────────────────────────────────────────────────────
export const usePRCache = () => useAppStore((s) => s.prCache)
export const useIssueCache = () => useAppStore((s) => s.issueCache)
