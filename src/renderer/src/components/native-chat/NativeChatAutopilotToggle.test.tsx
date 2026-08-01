// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store'
import type { AppState } from '../../store/types'
import { NativeChatAutopilotToggle } from './NativeChatAutopilotToggle'
import { paneAutopilotArmLabel } from '../terminal-pane/PaneAutopilotArmToggle'
import { TooltipProvider } from '../ui/tooltip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

let container: HTMLDivElement
let root: Root | null = null

function setGlobalSwitch(enabled: boolean): void {
  useAppStore.setState((s) => ({
    settings: { ...s.settings, autopilotAutoAnswerEnabled: enabled } as AppState['settings']
  }))
}

beforeEach(() => {
  useAppStore.setState({ autopilotArmedByPaneKey: {} })
  // The bridge to main must exist: arming without it rolls back by design.
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { autopilot: { setPaneArmed: async () => {}, forgetPane: async () => {} } }
  })
  setGlobalSwitch(true)
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

function render(): string {
  act(() => {
    root = createRoot(container)
    root.render(
      <TooltipProvider>
        <NativeChatAutopilotToggle paneKey={PANE} />
      </TooltipProvider>
    )
  })
  return container.innerHTML
}

describe('NativeChatAutopilotToggle', () => {
  it('renders in chat when the global switch is on — the whole point of this card', () => {
    const markup = render()
    expect(markup).toContain('button')
    expect(markup).toContain(paneAutopilotArmLabel(false))
  })

  it('renders nothing when the global switch is off', () => {
    setGlobalSwitch(false)
    expect(render()).toBe('')
  })

  it('shows the armed state for this pane', () => {
    useAppStore.setState({ autopilotArmedByPaneKey: { [PANE]: true } })
    const markup = render()
    expect(markup).toContain(paneAutopilotArmLabel(true))
    expect(markup).toContain('aria-pressed="true"')
  })

  it('arms only this pane, not another chat session', () => {
    useAppStore.setState({ autopilotArmedByPaneKey: { 'tab-9:other': true } })
    expect(render()).toContain('aria-pressed="false"')
  })

  it('clicking arms the session in the shared store', () => {
    render()
    const button = container.querySelector('button')
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(useAppStore.getState().autopilotArmedByPaneKey[PANE]).toBe(true)
  })

  it('clicking again disarms it', () => {
    useAppStore.setState({ autopilotArmedByPaneKey: { [PANE]: true } })
    render()
    const button = container.querySelector('button')
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(useAppStore.getState().autopilotArmedByPaneKey[PANE]).toBeUndefined()
  })

  it('rolls back an arm the main process can never hear about', () => {
    // Why: showing a session as armed when main was not told would be a lie —
    // main defaults unknown panes to disarmed and would refuse to answer.
    Object.defineProperty(window, 'api', { configurable: true, value: {} })
    render()
    const button = container.querySelector('button')
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(useAppStore.getState().autopilotArmedByPaneKey[PANE]).toBeUndefined()
  })
})
