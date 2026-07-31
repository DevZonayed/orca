import { describe, expect, it, vi } from 'vitest'
import { decideAutopilotAnswer } from './answer-decider'
import type { AskUserQuestionPrompt } from '../../shared/agent-question-answered-option'

const prompt: AskUserQuestionPrompt = {
  header: 'Auth method',
  question: 'Which auth should the API use?',
  multiSelect: false,
  options: [{ label: 'OAuth 2.0' }, { label: 'API keys' }]
}

function inputs(overrides: Partial<Parameters<typeof decideAutopilotAnswer>[0]> = {}) {
  return { prompt, priorAnswers: [], context: {}, ...overrides }
}

describe('decideAutopilotAnswer', () => {
  it('prefers a prior human answer over generating', async () => {
    const generate = vi.fn()
    const decision = await decideAutopilotAnswer(
      inputs({
        priorAnswers: [{ question: prompt.question, answer: 'API keys' }],
        generate
      })
    )
    expect(decision).toMatchObject({ source: 'recall', answer: 'API keys' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('ignores a prior answer that is no longer one of the options', async () => {
    const generate = vi.fn().mockResolvedValue({ success: true, reply: 'OAuth 2.0' })
    const decision = await decideAutopilotAnswer(
      inputs({
        priorAnswers: [{ question: prompt.question, answer: 'Basic auth' }],
        generate
      })
    )
    expect(decision).toMatchObject({ source: 'generated', answer: 'OAuth 2.0' })
    expect(generate).toHaveBeenCalledOnce()
  })

  it('accepts a generated reply that matches a declared option', async () => {
    const decision = await decideAutopilotAnswer(
      inputs({ generate: async () => ({ success: true, reply: 'API keys' }) })
    )
    expect(decision).toMatchObject({ source: 'generated', answer: 'API keys' })
  })

  it('abstains when the generated reply matches no option', async () => {
    const decision = await decideAutopilotAnswer(
      inputs({ generate: async () => ({ success: true, reply: 'mutual TLS' }) })
    )
    expect(decision.source).toBe('abstain')
    expect(decision.answer).toBeUndefined()
  })

  it('abstains when generation fails', async () => {
    const decision = await decideAutopilotAnswer(
      inputs({ generate: async () => ({ success: false, error: 'claude not on PATH' }) })
    )
    expect(decision.source).toBe('abstain')
    expect(decision.reason).toContain('claude not on PATH')
  })

  it('abstains rather than rejecting when generation throws', async () => {
    const decision = await decideAutopilotAnswer(
      inputs({
        generate: async () => {
          throw new Error('spawn EACCES')
        }
      })
    )
    expect(decision.source).toBe('abstain')
    expect(decision.reason).toContain('spawn EACCES')
  })

  it('abstains when no generation agent is configured', async () => {
    const decision = await decideAutopilotAnswer(inputs())
    expect(decision).toMatchObject({ source: 'abstain' })
    expect(decision.reason).toContain('no generation agent')
  })

  it('abstains on multi-select without consulting generation', async () => {
    const generate = vi.fn()
    const decision = await decideAutopilotAnswer(
      inputs({ prompt: { ...prompt, multiSelect: true }, generate })
    )
    expect(decision.source).toBe('abstain')
    expect(generate).not.toHaveBeenCalled()
  })

  it('abstains when the prompt declared no options', async () => {
    const generate = vi.fn()
    const decision = await decideAutopilotAnswer(
      inputs({ prompt: { ...prompt, options: [] }, generate })
    )
    expect(decision.source).toBe('abstain')
    expect(generate).not.toHaveBeenCalled()
  })

  it('never recalls a related answer — it answers a different question', async () => {
    const generate = vi.fn().mockResolvedValue({ success: true, reply: 'UNSURE' })
    const decision = await decideAutopilotAnswer(
      inputs({
        // 'API keys' is a live option, but it was chosen for another question.
        relatedAnswers: [{ question: 'Which auth for the mobile app?', answer: 'API keys' }],
        generate
      })
    )
    expect(decision.source).toBe('abstain')
    expect(decision.answer).toBeUndefined()
  })

  it('passes related answers to generation as evidence', async () => {
    const generate = vi.fn().mockResolvedValue({ success: true, reply: 'API keys' })
    await decideAutopilotAnswer(
      inputs({
        relatedAnswers: [{ question: 'Which auth for the mobile app?', answer: 'API keys' }],
        generate
      })
    )
    expect(generate.mock.calls[0][0]).toContain('Which auth for the mobile app?')
  })

  it('never returns an answer alongside an abstention', async () => {
    const decision = await decideAutopilotAnswer(
      inputs({ generate: async () => ({ success: true, reply: 'UNSURE' }) })
    )
    expect(decision.source).toBe('abstain')
    expect(decision.answer).toBeUndefined()
  })
})
