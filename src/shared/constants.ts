import type { GlobalSettings, PersistedState } from './types'

export const SCHEMA_VERSION = 1

export const REPO_COLORS = [
  '#737373', // neutral
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#8b5cf6', // purple
  '#ec4899' // pink
] as const

export function getDefaultSettings(homedir: string): GlobalSettings {
  return {
    workspaceDir: `${homedir}/orca/workspaces`,
    nestWorkspaces: true,
    branchPrefix: 'git-username',
    branchPrefixCustom: '',
    theme: 'system',
    terminalFontSize: 14,
    terminalFontFamily: 'SF Mono'
  }
}

export function getDefaultPersistedState(homedir: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    repos: [],
    worktreeMeta: {},
    settings: getDefaultSettings(homedir),
    ui: {
      lastActiveRepoId: null,
      lastActiveWorktreeId: null,
      sidebarWidth: 280
    },
    githubCache: { pr: {}, issue: {} }
  }
}
