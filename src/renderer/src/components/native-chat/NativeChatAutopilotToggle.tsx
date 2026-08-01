import { useAppStore } from '../../store'
import { PaneAutopilotArmToggle } from '../terminal-pane/PaneAutopilotArmToggle'

/**
 * Arm Autopilot for this chat session, from the composer bar.
 *
 * Self-contained so it needs only a paneKey. The terminal pane header and the
 * chat composer are different surfaces, and building the control into one prop
 * chain is exactly how it ended up reachable from only one of them.
 *
 * Renders nothing when the global switch is off, because arming a session while
 * Autopilot is globally off would look armed and never act.
 */
export function NativeChatAutopilotToggle({
  paneKey
}: {
  paneKey: string
}): React.JSX.Element | null {
  const available = useAppStore((store) => store.settings?.autopilotAutoAnswerEnabled === true)
  const armed = useAppStore((store) => store.autopilotArmedByPaneKey[paneKey] === true)
  const setArmed = useAppStore((store) => store.setAutopilotPaneArmed)
  if (!available) {
    return null
  }
  return <PaneAutopilotArmToggle armed={armed} onToggle={(next) => setArmed(paneKey, next)} />
}
