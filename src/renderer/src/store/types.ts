import type { RepoSlice } from './slices/repos'
import type { WorktreeSlice } from './slices/worktrees'
import type { TerminalSlice } from './slices/terminals'
import type { UISlice } from './slices/ui'
import type { SettingsSlice } from './slices/settings'
import type { GitHubSlice } from './slices/github'

export type AppState = RepoSlice &
  WorktreeSlice &
  TerminalSlice &
  UISlice &
  SettingsSlice &
  GitHubSlice
