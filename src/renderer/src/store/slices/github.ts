import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { PRInfo, IssueInfo } from '../../../../shared/types'

export interface GitHubSlice {
  prCache: Record<string, PRInfo | null>
  issueCache: Record<number, IssueInfo | null>
  fetchPRForBranch: (repoPath: string, branch: string) => Promise<PRInfo | null>
  fetchIssue: (repoPath: string, number: number) => Promise<IssueInfo | null>
}

export const createGitHubSlice: StateCreator<AppState, [], [], GitHubSlice> = (set, get) => ({
  prCache: {},
  issueCache: {},

  fetchPRForBranch: async (repoPath, branch) => {
    const cacheKey = `${repoPath}::${branch}`
    const cached = get().prCache[cacheKey]
    if (cached !== undefined) return cached

    try {
      const pr = await window.api.gh.prForBranch({ repoPath, branch })
      set((s) => ({
        prCache: { ...s.prCache, [cacheKey]: pr }
      }))
      return pr
    } catch (err) {
      console.error('Failed to fetch PR:', err)
      set((s) => ({
        prCache: { ...s.prCache, [cacheKey]: null }
      }))
      return null
    }
  },

  fetchIssue: async (repoPath, number) => {
    const cached = get().issueCache[number]
    if (cached !== undefined) return cached

    try {
      const issue = await window.api.gh.issue({ repoPath, number })
      set((s) => ({
        issueCache: { ...s.issueCache, [number]: issue }
      }))
      return issue
    } catch (err) {
      console.error('Failed to fetch issue:', err)
      set((s) => ({
        issueCache: { ...s.issueCache, [number]: null }
      }))
      return null
    }
  }
})
