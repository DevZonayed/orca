import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { GlobalSettings } from '../../shared/types'

export function registerSettingsHandlers(store: Store): void {
  ipcMain.handle('settings:get', () => {
    return store.getSettings()
  })

  ipcMain.handle('settings:set', (_event, args: Partial<GlobalSettings>) => {
    return store.updateSettings(args)
  })
}
