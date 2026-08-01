import { describe, expect, it } from 'vitest'
import { planAutopilotAnswerDelivery } from './autopilot-answer-delivery'
import type { AskPrompt } from './native-chat-ask'

const prompt: AskPrompt = {
  questions: [
    {
      question: 'Which auth method should we use?',
      header: 'Auth',
      multiSelect: false,
      options: [{ label: 'JWT' }, { label: 'Session cookies' }, { label: 'mTLS' }]
    }
  ]
}

describe('planAutopilotAnswerDelivery', () => {
  it('plans Claude selector keystrokes', () => {
    const plan = planAutopilotAnswerDelivery('claude', prompt, 1)
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.delivery.keystrokes.length).toBeGreaterThan(0)
      expect(plan.delivery.keystrokes).toContain('2')
    }
  })

  it('plans Codex selector keystrokes — the whole point of the card', () => {
    const plan = planAutopilotAnswerDelivery('codex', prompt, 0)
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.delivery.keystrokes).toContain('1')
    }
  })

  it('treats OpenClaude as Claude, which is the transcript format it writes', () => {
    const plan = planAutopilotAnswerDelivery('openclaude', prompt, 0)
    expect(plan.ok).toBe(true)
  })

  it('can differ between agents for the same choice', () => {
    const claude = planAutopilotAnswerDelivery('claude', prompt, 2)
    const codex = planAutopilotAnswerDelivery('codex', prompt, 2)
    expect(claude.ok && codex.ok).toBe(true)
    // Both must produce a plan; the builders own whether they coincide.
    if (claude.ok && codex.ok) {
      expect(claude.delivery.keystrokes.length).toBeGreaterThan(0)
      expect(codex.delivery.keystrokes.length).toBeGreaterThan(0)
    }
  })

  it('refuses an agent nobody has characterised', () => {
    expect(planAutopilotAnswerDelivery('some-new-cli', prompt, 0)).toMatchObject({
      ok: false,
      refusal: 'unknown-agent'
    })
  })

  it('refuses an undefined agent', () => {
    expect(planAutopilotAnswerDelivery(undefined, prompt, 0)).toMatchObject({ ok: false })
  })

  it('refuses a paste-committing agent rather than half-framing a paste', () => {
    // Grok commits pasted text; its delivery needs bracketed-paste framing that
    // lives in the renderer, so a keystroke-only plan would be wrong.
    expect(planAutopilotAnswerDelivery('grok', prompt, 0)).toMatchObject({
      ok: false,
      refusal: 'not-a-keystroke-agent'
    })
  })

  it('refuses an option index outside the question', () => {
    expect(planAutopilotAnswerDelivery('claude', prompt, 9)).toMatchObject({
      ok: false,
      refusal: 'no-such-option'
    })
    expect(planAutopilotAnswerDelivery('claude', prompt, -1)).toMatchObject({ ok: false })
  })

  it('refuses a prompt with no questions', () => {
    expect(planAutopilotAnswerDelivery('claude', { questions: [] }, 0)).toMatchObject({
      ok: false,
      refusal: 'no-such-option'
    })
  })
})
