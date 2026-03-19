import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  TerminalLayoutSnapshot,
  TerminalTab,
  WorkspaceSessionState
} from '../../../../shared/types'

export interface TerminalSlice {
  tabsByWorktree: Record<string, TerminalTab[]>
  activeTabId: string | null
  expandedPaneByTabId: Record<string, boolean>
  canExpandPaneByTabId: Record<string, boolean>
  terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot>
  workspaceSessionReady: boolean
  createTab: (worktreeId: string) => TerminalTab
  closeTab: (tabId: string) => void
  reorderTabs: (worktreeId: string, tabIds: string[]) => void
  setActiveTab: (tabId: string) => void
  updateTabTitle: (tabId: string, title: string) => void
  setTabCustomTitle: (tabId: string, title: string | null) => void
  setTabColor: (tabId: string, color: string | null) => void
  updateTabPtyId: (tabId: string, ptyId: string) => void
  setTabPaneExpanded: (tabId: string, expanded: boolean) => void
  setTabCanExpandPane: (tabId: string, canExpand: boolean) => void
  setTabLayout: (tabId: string, layout: TerminalLayoutSnapshot | null) => void
  hydrateWorkspaceSession: (session: WorkspaceSessionState) => void
}

export const createTerminalSlice: StateCreator<AppState, [], [], TerminalSlice> = (set) => ({
  tabsByWorktree: {},
  activeTabId: null,
  expandedPaneByTabId: {},
  canExpandPaneByTabId: {},
  terminalLayoutsByTabId: {},
  workspaceSessionReady: false,

  createTab: (worktreeId) => {
    const id = globalThis.crypto.randomUUID()
    let tab!: TerminalTab
    set((s) => {
      const existing = s.tabsByWorktree[worktreeId] ?? []
      tab = {
        id,
        ptyId: null,
        worktreeId,
        title: `Terminal ${existing.length + 1}`,
        customTitle: null,
        color: null,
        sortOrder: existing.length,
        createdAt: Date.now()
      }
      return {
        tabsByWorktree: {
          ...s.tabsByWorktree,
          [worktreeId]: [...existing, tab]
        },
        activeTabId: tab.id,
        terminalLayoutsByTabId: { ...s.terminalLayoutsByTabId, [tab.id]: emptyLayoutSnapshot() }
      }
    })
    return tab
  },

  closeTab: (tabId) => {
    set((s) => {
      const next = { ...s.tabsByWorktree }
      for (const wId of Object.keys(next)) {
        const before = next[wId]
        const after = before.filter((t) => t.id !== tabId)
        if (after.length !== before.length) {
          next[wId] = after
        }
      }
      const nextExpanded = { ...s.expandedPaneByTabId }
      delete nextExpanded[tabId]
      const nextCanExpand = { ...s.canExpandPaneByTabId }
      delete nextCanExpand[tabId]
      const nextLayouts = { ...s.terminalLayoutsByTabId }
      delete nextLayouts[tabId]
      return {
        tabsByWorktree: next,
        activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
        expandedPaneByTabId: nextExpanded,
        canExpandPaneByTabId: nextCanExpand,
        terminalLayoutsByTabId: nextLayouts
      }
    })
  },

  reorderTabs: (worktreeId, tabIds) => {
    set((s) => {
      const tabs = s.tabsByWorktree[worktreeId] ?? []
      const tabMap = new Map(tabs.map((t) => [t.id, t]))
      const reordered = tabIds
        .map((id, i) => {
          const tab = tabMap.get(id)
          return tab ? { ...tab, sortOrder: i } : undefined
        })
        .filter((t): t is TerminalTab => t !== undefined)
      return {
        tabsByWorktree: { ...s.tabsByWorktree, [worktreeId]: reordered }
      }
    })
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabTitle: (tabId, title) => {
    set((s) => {
      const next = { ...s.tabsByWorktree }
      for (const wId of Object.keys(next)) {
        next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, title } : t))
      }
      return { tabsByWorktree: next }
    })
  },

  setTabCustomTitle: (tabId, title) => {
    set((s) => {
      const next = { ...s.tabsByWorktree }
      for (const wId of Object.keys(next)) {
        next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, customTitle: title } : t))
      }
      return { tabsByWorktree: next }
    })
  },

  setTabColor: (tabId, color) => {
    set((s) => {
      const next = { ...s.tabsByWorktree }
      for (const wId of Object.keys(next)) {
        next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, color } : t))
      }
      return { tabsByWorktree: next }
    })
  },

  updateTabPtyId: (tabId, ptyId) => {
    set((s) => {
      const next = { ...s.tabsByWorktree }
      for (const wId of Object.keys(next)) {
        next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, ptyId } : t))
      }
      return { tabsByWorktree: next }
    })
  },

  setTabPaneExpanded: (tabId, expanded) => {
    set((s) => ({
      expandedPaneByTabId: { ...s.expandedPaneByTabId, [tabId]: expanded }
    }))
  },

  setTabCanExpandPane: (tabId, canExpand) => {
    set((s) => ({
      canExpandPaneByTabId: { ...s.canExpandPaneByTabId, [tabId]: canExpand }
    }))
  },

  setTabLayout: (tabId, layout) => {
    set((s) => {
      const next = { ...s.terminalLayoutsByTabId }
      if (layout) next[tabId] = layout
      else delete next[tabId]
      return { terminalLayoutsByTabId: next }
    })
  },

  hydrateWorkspaceSession: (session) => {
    set((s) => {
      const validWorktreeIds = new Set(
        Object.values(s.worktreesByRepo)
          .flat()
          .map((worktree) => worktree.id)
      )
      const tabsByWorktree: Record<string, TerminalTab[]> = Object.fromEntries(
        Object.entries(session.tabsByWorktree)
          .filter(([worktreeId]) => validWorktreeIds.has(worktreeId))
          .map(([worktreeId, tabs]) => [
            worktreeId,
            [...tabs]
              .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
              .map((tab, index) => ({
                ...tab,
                ptyId: null,
                sortOrder: index
              }))
          ])
          .filter(([, tabs]) => tabs.length > 0)
      )

      const validTabIds = new Set(
        Object.values(tabsByWorktree)
          .flat()
          .map((tab) => tab.id)
      )
      const activeWorktreeId =
        session.activeWorktreeId && validWorktreeIds.has(session.activeWorktreeId)
          ? session.activeWorktreeId
          : null
      const activeTabId =
        session.activeTabId && validTabIds.has(session.activeTabId) ? session.activeTabId : null
      const activeRepoId =
        session.activeRepoId && s.repos.some((repo) => repo.id === session.activeRepoId)
          ? session.activeRepoId
          : null

      return {
        activeRepoId,
        activeWorktreeId,
        activeTabId,
        tabsByWorktree,
        terminalLayoutsByTabId: Object.fromEntries(
          Object.entries(session.terminalLayoutsByTabId).filter(([tabId]) => validTabIds.has(tabId))
        ),
        workspaceSessionReady: true
      }
    })
  }
})

function emptyLayoutSnapshot(): TerminalLayoutSnapshot {
  return {
    root: null,
    activeLeafId: null,
    expandedLeafId: null
  }
}
