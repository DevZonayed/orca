import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { Store } from '../persistence'
import type { Repo } from '../../shared/types'
import { REPO_COLORS } from '../../shared/constants'
import { isGitRepo, getGitUsername, getRepoName } from '../git/repo'

export function registerRepoHandlers(mainWindow: BrowserWindow, store: Store): void {
  ipcMain.handle('repos:list', () => {
    return store.getRepos()
  })

  ipcMain.handle('repos:add', async (_event, args: { path: string }) => {
    if (!isGitRepo(args.path)) {
      throw new Error(`Not a valid git repository: ${args.path}`)
    }

    // Check if already added
    const existing = store.getRepos().find((r) => r.path === args.path)
    if (existing) return existing

    const repo: Repo = {
      id: randomUUID(),
      path: args.path,
      displayName: getRepoName(args.path),
      badgeColor: REPO_COLORS[store.getRepos().length % REPO_COLORS.length],
      addedAt: Date.now()
    }

    store.addRepo(repo)
    notifyReposChanged(mainWindow)
    return repo
  })

  ipcMain.handle('repos:remove', (_event, args: { repoId: string }) => {
    store.removeRepo(args.repoId)
    notifyReposChanged(mainWindow)
  })

  ipcMain.handle(
    'repos:update',
    (
      _event,
      args: {
        repoId: string
        updates: Partial<Pick<Repo, 'displayName' | 'badgeColor' | 'hookSettings'>>
      }
    ) => {
      const updated = store.updateRepo(args.repoId, args.updates)
      if (updated) notifyReposChanged(mainWindow)
      return updated
    }
  )

  ipcMain.handle('repos:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('repos:getGitUsername', (_event, args: { repoId: string }) => {
    const repo = store.getRepo(args.repoId)
    if (!repo) return ''
    return getGitUsername(repo.path)
  })
}

function notifyReposChanged(mainWindow: BrowserWindow): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('repos:changed')
  }
}
