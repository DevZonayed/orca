import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { WorkspaceSessionState } from '../../shared/types'

export function registerSessionHandlers(store: Store): void {
  ipcMain.handle('session:get', () => {
    return store.getWorkspaceSession()
  })

  ipcMain.handle('session:set', (_event, args: WorkspaceSessionState) => {
    store.setWorkspaceSession(args)
  })
}
