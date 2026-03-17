import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export interface UISlice {
  sidebarOpen: boolean
  sidebarWidth: number
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  activeView: 'terminal' | 'settings'
  setActiveView: (view: UISlice['activeView']) => void
  activeModal: 'none' | 'create-worktree' | 'link-issue' | 'edit-comment'
  modalData: Record<string, unknown>
  openModal: (modal: UISlice['activeModal'], data?: Record<string, unknown>) => void
  closeModal: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  groupBy: 'none' | 'repo' | 'pr-status'
  setGroupBy: (g: UISlice['groupBy']) => void
  sortBy: 'name' | 'recent' | 'repo'
  setSortBy: (s: UISlice['sortBy']) => void
  showActiveOnly: boolean
  setShowActiveOnly: (v: boolean) => void
  filterRepoId: string | null
  setFilterRepoId: (id: string | null) => void
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set) => ({
  sidebarOpen: true,
  sidebarWidth: 280,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  activeView: 'terminal',
  setActiveView: (view) => set({ activeView: view }),

  activeModal: 'none',
  modalData: {},
  openModal: (modal, data = {}) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: 'none', modalData: {} }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  groupBy: 'none',
  setGroupBy: (g) => set({ groupBy: g }),

  sortBy: 'name',
  setSortBy: (s) => set({ sortBy: s }),

  showActiveOnly: false,
  setShowActiveOnly: (v) => set({ showActiveOnly: v }),

  filterRepoId: null,
  setFilterRepoId: (id) => set({ filterRepoId: id })
})
