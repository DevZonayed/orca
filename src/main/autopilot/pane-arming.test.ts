import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetPaneArmingForTests,
  countArmedPanes,
  forgetPaneArming,
  isPaneArmed,
  setPaneArmed
} from './pane-arming'

beforeEach(() => {
  _resetPaneArmingForTests()
})

describe('pane arming', () => {
  it('defaults to not armed, so main failing to hear about a pane is safe', () => {
    expect(isPaneArmed('pane-1')).toBe(false)
  })

  it('arms and disarms a single pane', () => {
    setPaneArmed('pane-1', true)
    expect(isPaneArmed('pane-1')).toBe(true)
    setPaneArmed('pane-1', false)
    expect(isPaneArmed('pane-1')).toBe(false)
  })

  it('leaves other panes alone', () => {
    setPaneArmed('pane-1', true)
    expect(isPaneArmed('pane-2')).toBe(false)
  })

  it('is idempotent', () => {
    setPaneArmed('pane-1', true)
    setPaneArmed('pane-1', true)
    expect(countArmedPanes()).toBe(1)
  })

  it('forgets a pane so a recycled key cannot inherit its arming', () => {
    setPaneArmed('pane-1', true)
    forgetPaneArming('pane-1')
    expect(isPaneArmed('pane-1')).toBe(false)
  })

  it('refuses to arm past the bound rather than evicting an armed pane', () => {
    // Why: evicting would silently disarm a pane the human armed. Doing less
    // than asked is the safe failure; doing it to the wrong pane is not.
    for (let index = 0; index < 505; index += 1) {
      setPaneArmed(`pane-${index}`, true)
    }
    expect(countArmedPanes()).toBe(500)
    expect(isPaneArmed('pane-0')).toBe(true)
    expect(isPaneArmed('pane-504')).toBe(false)
  })

  it('disarming still works when the bound is reached', () => {
    for (let index = 0; index < 500; index += 1) {
      setPaneArmed(`pane-${index}`, true)
    }
    setPaneArmed('pane-0', false)
    expect(isPaneArmed('pane-0')).toBe(false)
    expect(countArmedPanes()).toBe(499)
  })
})
