import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export type AutopilotPaneArmingSlice = {
  /** Sessions the human armed for Autopilot, this run. Absent means not armed. */
  autopilotArmedByPaneKey: Record<string, boolean>
  setAutopilotPaneArmed: (paneKey: string, armed: boolean) => void
  forgetAutopilotPaneArming: (paneKey: string) => void
}

/**
 * Push every change to main, which owns the send gate.
 *
 * Fire-and-forget: main defaults a pane it has not heard about to *not* armed,
 * so a failed push can only under-arm. Arming is the state that has to be
 * successfully communicated; disarming is the default.
 */
function pushToMain(paneKey: string, armed: boolean): void {
  void window.api.autopilot?.setPaneArmed?.(paneKey, armed)?.catch?.((error: unknown) => {
    console.warn('[autopilot] could not sync pane arming', error)
  })
}

export const createAutopilotPaneArmingSlice: StateCreator<
  AppState,
  [],
  [],
  AutopilotPaneArmingSlice
> = (set) => ({
  autopilotArmedByPaneKey: {},
  setAutopilotPaneArmed: (paneKey, armed) => {
    pushToMain(paneKey, armed)
    set((s) => {
      if ((s.autopilotArmedByPaneKey[paneKey] ?? false) === armed) {
        return s
      }
      if (!armed) {
        const { [paneKey]: _removed, ...rest } = s.autopilotArmedByPaneKey
        return { autopilotArmedByPaneKey: rest }
      }
      return { autopilotArmedByPaneKey: { ...s.autopilotArmedByPaneKey, [paneKey]: true } }
    })
  },
  forgetAutopilotPaneArming: (paneKey) => {
    void window.api.autopilot?.forgetPane?.(paneKey)?.catch?.(() => {})
    set((s) => {
      if (!(paneKey in s.autopilotArmedByPaneKey)) {
        return s
      }
      const { [paneKey]: _removed, ...rest } = s.autopilotArmedByPaneKey
      return { autopilotArmedByPaneKey: rest }
    })
  }
})
