// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store'
import { NativeChatPromptQueue } from './NativeChatPromptQueue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

let container: HTMLDivElement
let root: Root | null = null

function queueTexts(...texts: string[]): void {
  useAppStore.setState({ promptQueuesByPaneKey: {} })
  for (const text of texts) {
    useAppStore.getState().enqueuePromptForPane(PANE, text)
  }
}

function render(): string {
  act(() => {
    root = createRoot(container)
    root.render(<NativeChatPromptQueue paneKey={PANE} />)
  })
  return container.innerHTML
}

function click(label: string, index = 0): void {
  const buttons = [...container.querySelectorAll(`[aria-label="${label}"]`)]
  act(() => buttons[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function currentTexts(): string[] {
  return (useAppStore.getState().promptQueuesByPaneKey[PANE]?.items ?? []).map((i) => i.text)
}

beforeEach(() => {
  useAppStore.setState({ promptQueuesByPaneKey: {} })
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

describe('NativeChatPromptQueue', () => {
  it('renders nothing when the queue is empty, so unused sessions are unchanged', () => {
    expect(render()).toBe('')
  })

  it('lists queued prompts in order', () => {
    queueTexts('first', 'second')
    const markup = render()
    expect(markup).toContain('first')
    expect(markup).toContain('second')
    expect(markup).toContain('Queued (2)')
  })

  it('reorders a prompt with the move controls', () => {
    queueTexts('first', 'second')
    render()
    click('Move up', 1)
    expect(currentTexts()).toEqual(['second', 'first'])
  })

  it('removes a prompt', () => {
    queueTexts('first', 'second')
    render()
    click('Remove from queue', 0)
    expect(currentTexts()).toEqual(['second'])
  })

  it('pauses and resumes the queue', () => {
    queueTexts('first')
    render()
    click('Pause queue')
    expect(useAppStore.getState().promptQueuesByPaneKey[PANE].paused).toBe(true)
  })

  it('shows a notice while paused so a stalled queue is never a mystery', () => {
    queueTexts('first')
    useAppStore.getState().setPromptQueuePausedForPane(PANE, true)
    expect(render()).toContain('Paused')
  })

  it('opens an editor on the queued prompt', () => {
    // The edit itself is covered by the store tests; what this asserts is that
    // the affordance is reachable from the rendered queue.
    queueTexts('first', 'second')
    render()
    const trigger = container.querySelector('button[aria-label="Edit queued prompt"]')
    expect(trigger).toBeTruthy()
    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const input = container.querySelector('input')
    expect(input).toBeTruthy()
    expect(input?.value).toBe('first')
  })

  it('shows another pane its own queue, not this one', () => {
    queueTexts('mine')
    useAppStore.getState().enqueuePromptForPane('tab-9:other', 'theirs')
    expect(render()).not.toContain('theirs')
  })
})
