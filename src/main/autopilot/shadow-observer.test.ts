import { describe, expect, it, vi } from 'vitest'
import { AutopilotShadowObserver, type ObservedAgentStatus } from './shadow-observer'
import { AutopilotDecisionStore } from './decision-store'

const interactivePrompt = JSON.stringify({
  questions: [
    {
      header: 'Auth method',
      question: 'Which auth should the API use?',
      multiSelect: false,
      options: [{ label: 'OAuth 2.0' }, { label: 'API keys' }]
    }
  ]
})

function waitingStatus(overrides: Partial<ObservedAgentStatus['payload']> = {}) {
  return {
    paneKey: 'pane-1',
    worktreeId: 'wt-1',
    payload: {
      state: 'waiting',
      agentType: 'claude',
      prompt: 'wire up the API',
      interactivePrompt,
      ...overrides
    }
  } satisfies ObservedAgentStatus
}

function setup(generator: ((prompt: string) => Promise<never>) | null = null) {
  const store = new AutopilotDecisionStore(':memory:')
  const observer = new AutopilotShadowObserver({
    getStore: () => store,
    createGenerator: () => generator,
    getCwdForPane: () => '/repo'
  })
  return { store, observer }
}

describe('AutopilotShadowObserver', () => {
  it('records an abstention when nothing can answer the question', async () => {
    const { store, observer } = setup()
    await observer.observeAsync(waitingStatus())
    const agreement = store.shadowAgreement()
    expect(agreement).toMatchObject({ abstained: 1, resolved: 0, matched: 0 })
  })

  it('recalls a prior human answer and proposes it', async () => {
    const { store, observer } = setup()
    store.recordDecision({
      paneKey: 'pane-0',
      agentType: 'claude',
      questionText: 'Which auth should the API use?',
      promptJson: interactivePrompt,
      provenance: 'human',
      answer: 'API keys',
      cwd: '/repo'
    })
    await observer.observeAsync(waitingStatus())
    const agreement = store.shadowAgreement()
    expect(agreement).toMatchObject({ abstained: 0, pending: 1 })
  })

  it('does not record autopilot answers as human evidence', async () => {
    const { store, observer } = setup()
    store.recordDecision({
      paneKey: 'pane-0',
      agentType: 'claude',
      questionText: 'Which auth should the API use?',
      promptJson: interactivePrompt,
      provenance: 'autopilot',
      answer: 'API keys'
    })
    await observer.observeAsync(waitingStatus())
    // Autopilot's own past answer must not become a recall, so this abstains.
    expect(store.shadowAgreement().abstained).toBe(1)
  })

  it('proposes once per question no matter how many status events arrive', async () => {
    const generate = vi.fn().mockResolvedValue({ success: true, reply: 'API keys' })
    const { store, observer } = setup(generate as never)
    await observer.observeAsync(waitingStatus())
    await observer.observeAsync(waitingStatus())
    await observer.observeAsync(waitingStatus())
    expect(generate).toHaveBeenCalledOnce()
    expect(store.shadowAgreement().pending).toBe(1)
  })

  it('proposes again for a genuinely new question on the same pane', async () => {
    const { store, observer } = setup()
    await observer.observeAsync(waitingStatus())
    const second = JSON.stringify({
      questions: [{ question: 'Ship it?', multiSelect: false, options: [{ label: 'Yes' }] }]
    })
    await observer.observeAsync(waitingStatus({ interactivePrompt: second }))
    expect(store.shadowAgreement().abstained).toBe(2)
  })

  it('ignores panes that are not waiting on a question', async () => {
    const { store, observer } = setup()
    await observer.observeAsync(waitingStatus({ state: 'working' }))
    await observer.observeAsync(waitingStatus({ interactivePrompt: undefined }))
    expect(store.shadowAgreement()).toMatchObject({ abstained: 0, pending: 0 })
  })

  it('ignores a malformed interactive prompt', async () => {
    const { store, observer } = setup()
    await observer.observeAsync(waitingStatus({ interactivePrompt: 'not json' }))
    expect(store.shadowAgreement().pending).toBe(0)
  })

  it('swallows a throwing store so hook delivery is never affected', async () => {
    const observer = new AutopilotShadowObserver({
      getStore: () => {
        throw new Error('db locked')
      },
      createGenerator: () => null
    })
    await expect(observer.observeAsync(waitingStatus())).resolves.toBeUndefined()
  })

  it('exposes no way to send input into a pane', () => {
    const { observer } = setup()
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(observer)),
      ...Object.getOwnPropertyNames(observer)
    ]
    expect(surface.filter((name) => /send|write|inject|paste|type/i.test(name))).toEqual([])
  })
})
