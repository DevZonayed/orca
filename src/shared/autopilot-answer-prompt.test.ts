import { describe, expect, it } from 'vitest'
import {
  AUTOPILOT_ANSWER_UNSURE,
  buildAutopilotAnswerPrompt,
  parseAutopilotAnswerReply
} from './autopilot-answer-prompt'
import type { AskUserQuestionPrompt } from './agent-question-answered-option'

const prompt: AskUserQuestionPrompt = {
  header: 'Auth method',
  question: 'Which auth should the API use?',
  multiSelect: false,
  options: [
    { label: 'OAuth 2.0', description: 'Delegated, needs a provider' },
    { label: 'API keys', description: 'Simplest to ship' }
  ]
}

describe('buildAutopilotAnswerPrompt', () => {
  it('lists every option with its description', () => {
    const built = buildAutopilotAnswerPrompt({ prompt })
    expect(built).toContain('1. OAuth 2.0 — Delegated, needs a provider')
    expect(built).toContain('2. API keys — Simplest to ship')
  })

  it('asks for a bare label and offers the UNSURE escape', () => {
    const built = buildAutopilotAnswerPrompt({ prompt })
    expect(built).toContain('Reply with the exact text of one option label and nothing else.')
    expect(built).toContain(AUTOPILOT_ANSWER_UNSURE)
  })

  it('includes prior answers as evidence of how this human chooses', () => {
    const built = buildAutopilotAnswerPrompt({
      prompt,
      priorAnswers: [{ question: 'Which auth should the API use?', answer: 'API keys' }]
    })
    expect(built).toContain('chose "API keys"')
  })

  it('truncates long context instead of sending an unbounded prompt', () => {
    const built = buildAutopilotAnswerPrompt({
      prompt,
      lastAssistantMessage: 'x'.repeat(50_000)
    })
    expect(built).toContain('…')
    expect(built.length).toBeLessThan(10_000)
  })

  it('omits context sections that were not supplied', () => {
    const built = buildAutopilotAnswerPrompt({ prompt })
    expect(built).not.toContain('What the agent said just before asking')
    expect(built).not.toContain('Working directory')
  })
})

describe('parseAutopilotAnswerReply', () => {
  const labels = ['OAuth 2.0', 'API keys']

  it('matches an exact label', () => {
    expect(parseAutopilotAnswerReply('API keys', labels)).toBe('API keys')
  })

  it('ignores case, surrounding quotes, and whitespace', () => {
    expect(parseAutopilotAnswerReply('  "api KEYS" \n', labels)).toBe('API keys')
  })

  it('reads the label off the last line when the agent reasons first', () => {
    const reply = 'The project already ships a key store, so:\n\nAPI keys'
    expect(parseAutopilotAnswerReply(reply, labels)).toBe('API keys')
  })

  it('returns null for the UNSURE sentinel', () => {
    expect(parseAutopilotAnswerReply('UNSURE', labels)).toBeNull()
  })

  it('returns null for a bare number rather than trusting option order', () => {
    expect(parseAutopilotAnswerReply('2', labels)).toBeNull()
  })

  it('returns null when the reply names no declared option', () => {
    expect(parseAutopilotAnswerReply('Use mutual TLS instead', labels)).toBeNull()
  })

  it('returns null when the reply is ambiguous between two options', () => {
    const ambiguous = ['Keep it', 'Keep it and log']
    expect(parseAutopilotAnswerReply('Keep it and log the choice', ambiguous)).toBeNull()
  })

  it('returns null for an empty reply', () => {
    expect(parseAutopilotAnswerReply('   \n  ', labels)).toBeNull()
  })
})
