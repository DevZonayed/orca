import { ipcMain } from 'electron'
import { getPRForBranch, getIssue, listIssues } from '../github/client'

export function registerGitHubHandlers(): void {
  ipcMain.handle('gh:prForBranch', (_event, args: { repoPath: string; branch: string }) => {
    return getPRForBranch(args.repoPath, args.branch)
  })

  ipcMain.handle('gh:issue', (_event, args: { repoPath: string; number: number }) => {
    return getIssue(args.repoPath, args.number)
  })

  ipcMain.handle('gh:listIssues', (_event, args: { repoPath: string; limit?: number }) => {
    return listIssues(args.repoPath, args.limit)
  })
}
