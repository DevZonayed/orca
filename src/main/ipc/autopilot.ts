import { ipcMain } from 'electron'
import { getAutopilotDecisionStore } from '../autopilot/decision-recorder'
import { forgetPaneArming, setPaneArmed } from '../autopilot/pane-arming'
import type { AutopilotActivity } from '../autopilot/decision-store'

/** What the panel shows before anything has been observed, and after a failure. */
const EMPTY_ACTIVITY: AutopilotActivity = {
  resolved: 0,
  matched: 0,
  abstained: 0,
  pending: 0,
  sent: 0,
  decisions: 0,
  abstentionReasons: [],
  recent: [],
  hasData: false
}

export function registerAutopilotHandlers(): void {
  ipcMain.removeHandler('autopilot:setPaneArmed')
  ipcMain.handle('autopilot:setPaneArmed', (_event, paneKey: unknown, armed: unknown): void => {
    if (typeof paneKey !== 'string' || paneKey.length === 0) {
      return
    }
    setPaneArmed(paneKey, armed === true)
  })
  ipcMain.removeHandler('autopilot:forgetPane')
  ipcMain.handle('autopilot:forgetPane', (_event, paneKey: unknown): void => {
    if (typeof paneKey === 'string') {
      forgetPaneArming(paneKey)
    }
  })
  ipcMain.removeHandler('autopilot:getActivity')
  ipcMain.handle('autopilot:getActivity', (): AutopilotActivity => {
    try {
      // Why: on demand only. node:sqlite is synchronous, so this must not run on
      // every settings render — the panel asks when it opens and on refresh.
      return getAutopilotDecisionStore().readActivity()
    } catch (error) {
      console.warn('[autopilot] could not read activity', error)
      return EMPTY_ACTIVITY
    }
  })
}
