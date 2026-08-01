import { describe, expect, it, vi } from 'vitest'
import { sendAutopilotAnswer, type AutopilotSendDeps } from './answer-sender'

const interactivePrompt = JSON.stringify({
  questions: [
    {
      header: 'Approach',
      question: 'How should the parser handle unknown tokens?',
      multiSelect: false,
      options: [{ label: 'Skip them' }, { label: 'Raise an error' }]
    }
  ]
})

function request(overrides: Partial<Parameters<typeof sendAutopilotAnswer>[0]> = {}) {
  return {
    paneKey: 'pane-1',
    decidedInteractivePrompt: interactivePrompt,
    answer: 'Raise an error',
    agentType: 'claude',
    connectionId: null,
    ...overrides
  }
}

function deps(overrides: Partial<AutopilotSendDeps> = {}): AutopilotSendDeps {
  return {
    isEnabled: () => true,
    // Armed by default so the existing cases keep testing the rung they name.
    isPaneArmed: () => true,
    readLivePrompt: () => interactivePrompt,
    wasAlreadyAnswered: () => false,
    write: () => ({ sent: true }),
    ...overrides
  }
}

describe('sendAutopilotAnswer', () => {
  it('sends the digit that names the chosen option', () => {
    const write = vi.fn().mockReturnValue({ sent: true })
    const result = sendAutopilotAnswer(request(), deps({ write }))
    expect(result).toEqual({ sent: true, data: '2' })
    expect(write).toHaveBeenCalledWith({
      paneKey: 'pane-1',
      expectedInteractivePrompt: interactivePrompt,
      data: '2'
    })
  })

  it('refuses when the toggle is off', () => {
    const write = vi.fn()
    const result = sendAutopilotAnswer(request(), deps({ isEnabled: () => false, write }))
    expect(result).toMatchObject({ sent: false, refusal: 'disabled' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses an SSH pane', () => {
    const write = vi.fn()
    const result = sendAutopilotAnswer(request({ connectionId: 'ssh-1' }), deps({ write }))
    expect(result).toMatchObject({ refusal: 'not-local' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses a non-Claude agent, whose digit may not submit', () => {
    const result = sendAutopilotAnswer(request({ agentType: 'codex' }), deps())
    expect(result).toMatchObject({ refusal: 'not-claude' })
  })

  it('refuses when the live prompt no longer matches the decided one', () => {
    const write = vi.fn()
    const result = sendAutopilotAnswer(
      request(),
      deps({ readLivePrompt: () => '{"questions":[{"question":"Something else"}]}', write })
    )
    expect(result).toMatchObject({ refusal: 'prompt-changed' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses when the pane is no longer showing any prompt', () => {
    const result = sendAutopilotAnswer(request(), deps({ readLivePrompt: () => undefined }))
    expect(result).toMatchObject({ refusal: 'prompt-changed' })
  })

  it('refuses a destructive question and names the phrase', () => {
    const destructive = JSON.stringify({
      questions: [
        {
          question: 'How should we clean up?',
          multiSelect: false,
          options: [{ label: 'Keep it' }, { label: 'Delete the branch' }]
        }
      ]
    })
    const write = vi.fn()
    const result = sendAutopilotAnswer(
      request({ decidedInteractivePrompt: destructive, answer: 'Keep it' }),
      deps({ readLivePrompt: () => destructive, write })
    )
    expect(result).toMatchObject({ refusal: 'destructive', detail: 'delete' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses to answer a question it already answered on this pane', () => {
    const result = sendAutopilotAnswer(request(), deps({ wasAlreadyAnswered: () => true }))
    expect(result).toMatchObject({ refusal: 'already-answered' })
  })

  it('refuses when the answer is not one of the live options', () => {
    const result = sendAutopilotAnswer(request({ answer: 'Something invented' }), deps())
    expect(result).toMatchObject({ refusal: 'answer-not-an-option' })
  })

  it('re-derives the digit from the live prompt when options were reordered', () => {
    const reordered = JSON.stringify({
      questions: [
        {
          header: 'Approach',
          question: 'How should the parser handle unknown tokens?',
          multiSelect: false,
          options: [{ label: 'Raise an error' }, { label: 'Skip them' }]
        }
      ]
    })
    const write = vi.fn().mockReturnValue({ sent: true })
    const result = sendAutopilotAnswer(
      request({ decidedInteractivePrompt: reordered }),
      deps({ readLivePrompt: () => reordered, write })
    )
    // 'Raise an error' moved to position 1, so the digit must be 1, not 2.
    expect(result).toEqual({ sent: true, data: '1' })
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ data: '1' }))
  })

  it('refuses a multi-select, where a digit toggles instead of submitting', () => {
    const multi = JSON.stringify({
      questions: [
        {
          question: 'Which should we enable?',
          multiSelect: true,
          options: [{ label: 'Skip them' }, { label: 'Raise an error' }]
        }
      ]
    })
    const write = vi.fn()
    const result = sendAutopilotAnswer(
      request({ decidedInteractivePrompt: multi }),
      deps({ readLivePrompt: () => multi, write })
    )
    expect(result.sent).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('reports a refused write rather than claiming it sent', () => {
    const result = sendAutopilotAnswer(
      request(),
      deps({ write: () => ({ sent: false, reason: 'prompt-changed' }) })
    )
    expect(result).toMatchObject({ refusal: 'write-refused', detail: 'prompt-changed' })
  })

  it('refuses an empty answer', () => {
    const result = sendAutopilotAnswer(request({ answer: '' }), deps())
    expect(result).toMatchObject({ refusal: 'no-answer' })
  })

  it('refuses a pane the human never armed, even with the global switch on', () => {
    const write = vi.fn()
    const result = sendAutopilotAnswer(request(), deps({ isPaneArmed: () => false, write }))
    expect(result).toMatchObject({ sent: false, refusal: 'pane-not-armed' })
    expect(write).not.toHaveBeenCalled()
  })

  it('requires both keys: the global switch off disarms an armed pane', () => {
    const write = vi.fn()
    const result = sendAutopilotAnswer(
      request(),
      deps({ isEnabled: () => false, isPaneArmed: () => true, write })
    )
    expect(result).toMatchObject({ refusal: 'disabled' })
    expect(write).not.toHaveBeenCalled()
  })

  it('arms only the pane that asked for it', () => {
    const armed = new Set(['pane-1'])
    const write = vi.fn().mockReturnValue({ sent: true })
    expect(
      sendAutopilotAnswer(
        request({ paneKey: 'pane-1' }),
        deps({
          isPaneArmed: (key) => armed.has(key),
          readLivePrompt: () => interactivePrompt,
          write
        })
      ).sent
    ).toBe(true)
    expect(
      sendAutopilotAnswer(
        request({ paneKey: 'pane-2' }),
        deps({
          isPaneArmed: (key) => armed.has(key),
          readLivePrompt: () => interactivePrompt,
          write
        })
      )
    ).toMatchObject({ refusal: 'pane-not-armed' })
  })
})
