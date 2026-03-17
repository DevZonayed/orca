import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/types'

export interface RepoSlice {
  repos: Repo[]
  activeRepoId: string | null
  fetchRepos: () => Promise<void>
  addRepo: () => Promise<Repo | null>
  removeRepo: (repoId: string) => Promise<void>
  updateRepo: (
    repoId: string,
    updates: Partial<Pick<Repo, 'displayName' | 'badgeColor'>>
  ) => Promise<void>
  setActiveRepo: (repoId: string | null) => void
}

export const createRepoSlice: StateCreator<AppState, [], [], RepoSlice> = (set) => ({
  repos: [],
  activeRepoId: null,

  fetchRepos: async () => {
    try {
      const repos = await window.api.repos.list()
      set({ repos })
    } catch (err) {
      console.error('Failed to fetch repos:', err)
    }
  },

  addRepo: async () => {
    try {
      const path = await window.api.repos.pickFolder()
      if (!path) return null
      const repo = await window.api.repos.add({ path })
      set((s) => ({ repos: [...s.repos, repo] }))
      return repo
    } catch (err) {
      console.error('Failed to add repo:', err)
      return null
    }
  },

  removeRepo: async (repoId) => {
    try {
      await window.api.repos.remove({ repoId })
      set((s) => ({
        repos: s.repos.filter((r) => r.id !== repoId),
        activeRepoId: s.activeRepoId === repoId ? null : s.activeRepoId
      }))
    } catch (err) {
      console.error('Failed to remove repo:', err)
    }
  },

  updateRepo: async (repoId, updates) => {
    try {
      await window.api.repos.update({ repoId, updates })
      set((s) => ({
        repos: s.repos.map((r) => (r.id === repoId ? { ...r, ...updates } : r))
      }))
    } catch (err) {
      console.error('Failed to update repo:', err)
    }
  },

  setActiveRepo: (repoId) => set({ activeRepoId: repoId })
})
