// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutopilotActivity } from '../../../../shared/autopilot-activity'
import { AutopilotActivityPanel } from './AutopilotActivityPanel'
import {
  getAutopilotActivityEmpty,
  getAutopilotAgreementUntested,
  getAutopilotDeclinedHeading
} from './autopilot-activity-copy'

const EMPTY: AutopilotActivity = {
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

function activity(overrides: Partial<AutopilotActivity> = {}): AutopilotActivity {
  return { ...EMPTY, hasData: true, ...overrides }
}

const getActivity = vi.fn<() => Promise<AutopilotActivity>>()
let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  getActivity.mockReset().mockResolvedValue(EMPTY)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { autopilot: { getActivity } }
  })
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
})

async function mount(): Promise<string> {
  await act(async () => {
    root = createRoot(container)
    root.render(<AutopilotActivityPanel />)
  })
  return container.innerHTML
}

describe('AutopilotActivityPanel', () => {
  it('asks main for activity once on mount', async () => {
    await mount()
    expect(getActivity).toHaveBeenCalledOnce()
  })

  it('shows an explicit empty state rather than zeroes', async () => {
    const markup = await mount()
    expect(markup).toContain(getAutopilotActivityEmpty())
    // Zeroes would read as a measurement that has already been taken.
    expect(markup).not.toContain('0%')
  })

  it('reports an unscored rate as not-yet-scored, never 0%', async () => {
    getActivity.mockResolvedValue(activity({ abstained: 3, resolved: 0, matched: 0 }))
    const markup = await mount()
    expect(markup).toContain(getAutopilotAgreementUntested())
    expect(markup).not.toContain('0%')
  })

  it('renders the agreement percentage once proposals have been scored', async () => {
    getActivity.mockResolvedValue(activity({ resolved: 4, matched: 3 }))
    const markup = await mount()
    expect(markup).toContain('75%')
  })

  it('surfaces why it declined, so a missing agent is visible not inferred', async () => {
    getActivity.mockResolvedValue(
      activity({
        abstained: 5,
        abstentionReasons: [{ reason: 'no generation agent configured', count: 5 }]
      })
    )
    const markup = await mount()
    expect(markup).toContain(getAutopilotDeclinedHeading())
    expect(markup).toContain('no generation agent configured')
  })

  it('lists a recent question with both answers', async () => {
    getActivity.mockResolvedValue(
      activity({
        resolved: 1,
        matched: 0,
        recent: [
          {
            proposedAt: '2026-08-01 10:00:00',
            question: 'Which auth method should we use?',
            source: 'generated',
            proposedAnswer: 'JWT',
            humanAnswer: 'Session cookies',
            matched: false
          }
        ]
      })
    )
    const markup = await mount()
    expect(markup).toContain('Which auth method should we use?')
    expect(markup).toContain('JWT')
    expect(markup).toContain('Session cookies')
  })

  it('falls back to the empty state when the read fails', async () => {
    getActivity.mockRejectedValue(new Error('no store'))
    const markup = await mount()
    expect(markup).toContain(getAutopilotActivityEmpty())
  })
})
