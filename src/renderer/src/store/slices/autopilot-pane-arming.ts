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
function pushToMain(paneKey: string, armed: boolean, onFailed: () => void): void {
  try {
    const push = window.api?.autopilot?.setPaneArmed?.(paneKey, armed)
    if (!push) {
      // Why: no bridge means main can never learn about this pane, so claiming
      // it is armed in the UI would be a lie. Only arming needs the bridge —
      // disarming is already main's default.
      if (armed) {
        onFailed()
      }
      return
    }
    void push.catch((error: unknown) => {
      console.warn('[autopilot] could not sync pane arming', error)
      if (armed) {
        onFailed()
      }
    })
  } catch (error) {
    console.warn('[autopilot] pane arming bridge unavailable', error)
    if (armed) {
      onFailed()
    }
  }
}

export const createAutopilotPaneArmingSlice: StateCreator<
  AppState,
  [],
  [],
  AutopilotPaneArmingSlice
> = (set) => ({
  autopilotArmedByPaneKey: {},
  setAutopilotPaneArmed: (paneKey, armed) => {
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
    // Why: after the optimistic update, so a failed push can roll it back and
    // the UI never claims a session is armed that main will refuse to answer.
    pushToMain(paneKey, armed, () =>
      set((s) => {
        const { [paneKey]: _removed, ...rest } = s.autopilotArmedByPaneKey
        return { autopilotArmedByPaneKey: rest }
      })
    )
  },
  forgetAutopilotPaneArming: (paneKey) => {
    try {
      void window.api?.autopilot?.forgetPane?.(paneKey)?.catch?.(() => {})
    } catch {
      // Forgetting is best-effort; main drops unknown panes anyway.
    }
    set((s) => {
      if (!(paneKey in s.autopilotArmedByPaneKey)) {
        return s
      }
      const { [paneKey]: _removed, ...rest } = s.autopilotArmedByPaneKey
      return { autopilotArmedByPaneKey: rest }
    })
  }
})
