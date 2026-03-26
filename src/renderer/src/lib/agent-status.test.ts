import { describe, expect, it } from 'vitest'
import { detectAgentStatusFromTitle, clearWorkingIndicators } from './agent-status'

describe('detectAgentStatusFromTitle', () => {
  it('returns null for empty string', () => {
    expect(detectAgentStatusFromTitle('')).toBeNull()
  })

  it('returns null for a title with no agent indicators', () => {
    expect(detectAgentStatusFromTitle('bash')).toBeNull()
    expect(detectAgentStatusFromTitle('vim myfile.ts')).toBeNull()
  })

  // --- Gemini symbols ---
  it('detects Gemini permission symbol ✋', () => {
    expect(detectAgentStatusFromTitle('✋ Gemini CLI')).toBe('permission')
  })

  it('detects Gemini working symbol ✦', () => {
    expect(detectAgentStatusFromTitle('✦ Gemini CLI')).toBe('working')
  })

  it('detects Gemini idle symbol ◇', () => {
    expect(detectAgentStatusFromTitle('◇ Gemini CLI')).toBe('idle')
  })

  it('Gemini permission takes precedence over working', () => {
    expect(detectAgentStatusFromTitle('✋✦ Gemini CLI')).toBe('permission')
  })

  // --- Braille spinner characters ---
  it('detects braille spinner ⠋ as working', () => {
    expect(detectAgentStatusFromTitle('⠋ Codex is thinking')).toBe('working')
  })

  it('detects braille spinner ⠙ as working', () => {
    expect(detectAgentStatusFromTitle('⠙ some task')).toBe('working')
  })

  it('detects braille spinner ⠹ as working', () => {
    expect(detectAgentStatusFromTitle('⠹ aider running')).toBe('working')
  })

  it('detects braille spinner ⠸ as working', () => {
    expect(detectAgentStatusFromTitle('⠸ process')).toBe('working')
  })

  it('detects braille spinner ⠼ as working', () => {
    expect(detectAgentStatusFromTitle('⠼ opencode')).toBe('working')
  })

  it('detects braille spinner ⠴ as working', () => {
    expect(detectAgentStatusFromTitle('⠴ loading')).toBe('working')
  })

  it('detects braille spinner ⠦ as working', () => {
    expect(detectAgentStatusFromTitle('⠦ claude')).toBe('working')
  })

  it('detects braille spinner ⠧ as working', () => {
    expect(detectAgentStatusFromTitle('⠧ task')).toBe('working')
  })

  // --- Agent name keyword combos ---
  it('detects permission requests from agent titles', () => {
    expect(detectAgentStatusFromTitle('Claude Code - action required')).toBe('permission')
  })

  it('detects "permission" keyword with agent name', () => {
    expect(detectAgentStatusFromTitle('codex - permission needed')).toBe('permission')
  })

  it('detects "waiting" keyword with agent name', () => {
    expect(detectAgentStatusFromTitle('gemini waiting for input')).toBe('permission')
  })

  it('detects "ready" keyword as idle', () => {
    expect(detectAgentStatusFromTitle('claude ready')).toBe('idle')
  })

  it('detects "idle" keyword as idle', () => {
    expect(detectAgentStatusFromTitle('codex idle')).toBe('idle')
  })

  it('detects "done" keyword as idle', () => {
    expect(detectAgentStatusFromTitle('aider done')).toBe('idle')
  })

  it('detects "working" keyword as working', () => {
    expect(detectAgentStatusFromTitle('claude working on task')).toBe('working')
  })

  it('detects "thinking" keyword as working', () => {
    expect(detectAgentStatusFromTitle('gemini thinking')).toBe('working')
  })

  it('detects "running" keyword as working', () => {
    expect(detectAgentStatusFromTitle('opencode running tests')).toBe('working')
  })

  // --- Claude Code title prefixes ---
  it('detects ". " prefix as working (Claude Code)', () => {
    expect(detectAgentStatusFromTitle('. claude')).toBe('working')
  })

  it('detects "* " prefix as idle (Claude Code)', () => {
    expect(detectAgentStatusFromTitle('* claude')).toBe('idle')
  })

  // --- Agent name alone defaults to idle ---
  it('returns idle for bare agent name "claude"', () => {
    expect(detectAgentStatusFromTitle('claude')).toBe('idle')
  })

  it('returns idle for bare agent name "codex"', () => {
    expect(detectAgentStatusFromTitle('codex')).toBe('idle')
  })

  it('returns idle for bare agent name "aider"', () => {
    expect(detectAgentStatusFromTitle('aider')).toBe('idle')
  })

  it('returns idle for bare agent name "opencode"', () => {
    expect(detectAgentStatusFromTitle('opencode')).toBe('idle')
  })

  // --- Case insensitivity ---
  it('is case-insensitive for agent names', () => {
    expect(detectAgentStatusFromTitle('CLAUDE')).toBe('idle')
    expect(detectAgentStatusFromTitle('Codex Working')).toBe('working')
  })
})

describe('clearWorkingIndicators', () => {
  it('strips Claude Code ". " working prefix', () => {
    const cleared = clearWorkingIndicators('. claude')
    expect(cleared).toBe('claude')
    expect(detectAgentStatusFromTitle(cleared)).not.toBe('working')
  })

  it('strips braille spinner characters and working keywords', () => {
    const cleared = clearWorkingIndicators('⠋ Codex is thinking')
    expect(cleared).toBe('Codex is')
    expect(detectAgentStatusFromTitle(cleared)).not.toBe('working')
  })

  it('strips Gemini working symbol', () => {
    const cleared = clearWorkingIndicators('✦ Gemini CLI')
    expect(cleared).toBe('Gemini CLI')
    expect(detectAgentStatusFromTitle(cleared)).not.toBe('working')
  })

  it('returns original title if no working indicators found', () => {
    expect(clearWorkingIndicators('* claude')).toBe('* claude')
    expect(clearWorkingIndicators('Terminal 1')).toBe('Terminal 1')
  })
})
