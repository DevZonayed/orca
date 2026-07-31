import { describe, expect, it } from 'vitest'
import {
  AutopilotDecisionStore,
  type AutopilotDecisionInput,
  type ShadowProposalInput
} from './decision-store'

function store(): AutopilotDecisionStore {
  return new AutopilotDecisionStore(':memory:')
}

function decision(overrides: Partial<AutopilotDecisionInput> = {}): AutopilotDecisionInput {
  return {
    paneKey: 'pane-1',
    agentType: 'claude',
    questionText: 'Which auth method should we use?',
    promptJson: '{"questions":[]}',
    provenance: 'human',
    questionHeader: 'Auth method',
    answer: 'JWT',
    cwd: '/repo/orca',
    ...overrides
  }
}

describe('AutopilotDecisionStore', () => {
  it('records a decision and reads it back', () => {
    const db = store()
    const row = db.recordDecision(decision())
    expect(row.id).toBeGreaterThan(0)
    expect(row.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(row.answer).toBe('JWT')
    expect(row.provenance).toBe('human')
    expect(db.countDecisions()).toBe(1)
    db.close()
  })

  it('omits absent optional fields rather than returning nulls', () => {
    const db = store()
    const row = db.recordDecision(
      decision({ answer: undefined, questionHeader: undefined, cwd: undefined })
    )
    expect(row.answer).toBeUndefined()
    expect(row.questionHeader).toBeUndefined()
    expect(row.cwd).toBeUndefined()
    expect('answer' in row).toBe(false)
    db.close()
  })

  it('refuses a provenance outside the allowed set', () => {
    // Why: this CHECK is the guard that stops a later mining pass ingesting
    // Autopilot's own answers as human labels. It must fail closed.
    const db = store()
    expect(() => db.recordDecision(decision({ provenance: 'guessed' as never }))).toThrow()
    expect(db.countDecisions()).toBe(0)
    db.close()
  })

  it('returns prior answers newest first', () => {
    const db = store()
    db.recordDecision(decision({ answer: 'JWT' }))
    db.recordDecision(decision({ answer: 'Session cookies' }))
    const prior = db.findPriorAnswers('Which auth method should we use?')
    expect(prior.map((row) => row.answer)).toEqual(['Session cookies', 'JWT'])
    db.close()
  })

  it('excludes rows with no resolved answer', () => {
    const db = store()
    db.recordDecision(decision({ answer: undefined }))
    expect(db.countDecisions()).toBe(1)
    expect(db.findPriorAnswers('Which auth method should we use?')).toEqual([])
    db.close()
  })

  it('filters by provenance and cwd', () => {
    const db = store()
    db.recordDecision(decision({ answer: 'JWT', provenance: 'human', cwd: '/repo/a' }))
    db.recordDecision(decision({ answer: 'Auto', provenance: 'autopilot', cwd: '/repo/a' }))
    db.recordDecision(decision({ answer: 'Elsewhere', provenance: 'human', cwd: '/repo/b' }))

    const humanOnly = db.findPriorAnswers('Which auth method should we use?', {
      provenance: 'human'
    })
    expect(humanOnly.map((row) => row.answer)).toEqual(['Elsewhere', 'JWT'])

    const scoped = db.findPriorAnswers('Which auth method should we use?', {
      provenance: 'human',
      cwd: '/repo/a'
    })
    expect(scoped.map((row) => row.answer)).toEqual(['JWT'])
    db.close()
  })

  it('honours the limit', () => {
    const db = store()
    for (let index = 0; index < 5; index += 1) {
      db.recordDecision(decision({ answer: `answer-${index}` }))
    }
    expect(db.findPriorAnswers('Which auth method should we use?', { limit: 2 })).toHaveLength(2)
    db.close()
  })

  it('stamps the schema version', () => {
    const db = store()
    expect(db.countDecisions()).toBe(0)
    db.close()
  })
})

function proposal(overrides: Partial<ShadowProposalInput> = {}): ShadowProposalInput {
  return {
    paneKey: 'pane-1',
    agentType: 'claude',
    questionText: 'Which auth method should we use?',
    promptJson: '{"questions":[]}',
    source: 'generated',
    proposedAnswer: 'JWT',
    reason: 'generated and matched a declared option',
    ...overrides
  }
}

describe('AutopilotDecisionStore shadow proposals', () => {
  it('records a proposal as pending until the human answers', () => {
    const db = store()
    const row = db.recordProposal(proposal())
    expect(row.proposedAnswer).toBe('JWT')
    expect(row.matched).toBeUndefined()
    expect(db.shadowAgreement()).toMatchObject({ pending: 1, resolved: 0 })
    db.close()
  })

  it('drops any answer supplied alongside an abstention', () => {
    const db = store()
    const row = db.recordProposal(
      proposal({ source: 'abstain', proposedAnswer: 'JWT', reason: 'multi-select' })
    )
    expect(row.proposedAnswer).toBeUndefined()
    db.close()
  })

  it('rejects an unknown proposal source', () => {
    const db = store()
    expect(() =>
      db.recordProposal(proposal({ source: 'guessed' as ShadowProposalInput['source'] }))
    ).toThrow()
    db.close()
  })

  it('scores a matching human answer', () => {
    const db = store()
    db.recordProposal(proposal())
    const resolved = db.resolveProposal('pane-1', 'Which auth method should we use?', 'JWT')
    expect(resolved?.matched).toBe(true)
    expect(resolved?.humanAnswer).toBe('JWT')
    expect(db.shadowAgreement()).toMatchObject({ resolved: 1, matched: 1, pending: 0 })
    db.close()
  })

  it('scores a differing human answer as a miss', () => {
    const db = store()
    db.recordProposal(proposal())
    const resolved = db.resolveProposal('pane-1', 'Which auth method should we use?', 'Sessions')
    expect(resolved?.matched).toBe(false)
    expect(db.shadowAgreement()).toMatchObject({ resolved: 1, matched: 0 })
    db.close()
  })

  it('never counts an abstention as a match', () => {
    const db = store()
    db.recordProposal(proposal({ source: 'abstain', proposedAnswer: undefined }))
    const resolved = db.resolveProposal('pane-1', 'Which auth method should we use?', 'JWT')
    expect(resolved?.matched).toBe(false)
    // An abstention proposed nothing, so it is not part of the agreement rate.
    expect(db.shadowAgreement()).toMatchObject({ resolved: 0, matched: 0, abstained: 1 })
    db.close()
  })

  it('resolves the newest open proposal when a pane is asked twice', () => {
    const db = store()
    db.recordProposal(proposal({ proposedAnswer: 'JWT' }))
    db.recordProposal(proposal({ proposedAnswer: 'Sessions' }))
    const resolved = db.resolveProposal('pane-1', 'Which auth method should we use?', 'Sessions')
    expect(resolved?.matched).toBe(true)
    expect(db.shadowAgreement()).toMatchObject({ resolved: 1, pending: 1 })
    db.close()
  })

  it('returns null when no proposal is open for the pane', () => {
    const db = store()
    expect(db.resolveProposal('pane-9', 'Which auth method should we use?', 'JWT')).toBeNull()
    db.close()
  })

  it('does not resolve a proposal twice', () => {
    const db = store()
    db.recordProposal(proposal())
    db.resolveProposal('pane-1', 'Which auth method should we use?', 'JWT')
    expect(db.resolveProposal('pane-1', 'Which auth method should we use?', 'Sessions')).toBeNull()
    db.close()
  })

  it('keeps proposals out of the human decision corpus', () => {
    const db = store()
    db.recordProposal(proposal())
    expect(db.countDecisions()).toBe(0)
    expect(db.findPriorAnswers('Which auth method should we use?')).toEqual([])
    db.close()
  })
})
