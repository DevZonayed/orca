import { describe, expect, it } from 'vitest'
import { AutopilotDecisionStore } from './decision-store'
import { agreementRate } from '../../shared/autopilot-activity'

function store(): AutopilotDecisionStore {
  return new AutopilotDecisionStore(':memory:')
}

const QUESTION = 'Which auth method should we use?'

function proposalInput(overrides: Record<string, unknown> = {}) {
  return {
    paneKey: 'pane-1',
    agentType: 'claude',
    questionText: QUESTION,
    promptJson: '{"questions":[]}',
    source: 'generated' as const,
    proposedAnswer: 'JWT',
    ...overrides
  }
}

describe('readAutopilotActivity', () => {
  it('reports an explicit empty state before anything is observed', () => {
    const db = store()
    const activity = db.readActivity()
    expect(activity.hasData).toBe(false)
    expect(activity).toMatchObject({ resolved: 0, matched: 0, sent: 0, decisions: 0 })
    expect(activity.recent).toEqual([])
    db.close()
  })

  it('stops being empty once a question is recorded', () => {
    const db = store()
    db.recordProposal(proposalInput())
    expect(db.readActivity().hasData).toBe(true)
    db.close()
  })

  it('counts what Autopilot proposed, sent, and declined separately', () => {
    const db = store()
    db.recordProposal(proposalInput())
    db.recordProposal(
      proposalInput({ source: 'abstain', proposedAnswer: undefined, reason: 'multi-select' })
    )
    db.recordDecision({
      paneKey: 'pane-1',
      agentType: 'claude',
      questionText: QUESTION,
      promptJson: '{}',
      provenance: 'autopilot',
      answer: 'JWT'
    })
    db.recordDecision({
      paneKey: 'pane-1',
      agentType: 'claude',
      questionText: QUESTION,
      promptJson: '{}',
      provenance: 'human',
      answer: 'JWT'
    })
    const activity = db.readActivity()
    expect(activity).toMatchObject({ abstained: 1, sent: 1, decisions: 1 })
    db.close()
  })

  it('groups abstention reasons by frequency, most common first', () => {
    const db = store()
    for (let index = 0; index < 3; index += 1) {
      db.recordProposal(
        proposalInput({
          source: 'abstain',
          proposedAnswer: undefined,
          reason: 'no generation agent configured'
        })
      )
    }
    db.recordProposal(
      proposalInput({ source: 'abstain', proposedAnswer: undefined, reason: 'multi-select' })
    )
    expect(db.readActivity().abstentionReasons).toEqual([
      { reason: 'no generation agent configured', count: 3 },
      { reason: 'multi-select', count: 1 }
    ])
    db.close()
  })

  it('lists recent proposals newest first, with both answers', () => {
    const db = store()
    db.recordProposal(proposalInput())
    db.resolveProposal('pane-1', QUESTION, 'Session cookies')
    db.recordProposal(proposalInput({ questionText: 'Which database?' }))
    const recent = db.readActivity().recent
    expect(recent[0].question).toBe('Which database?')
    expect(recent[1]).toMatchObject({
      question: QUESTION,
      proposedAnswer: 'JWT',
      humanAnswer: 'Session cookies',
      matched: false
    })
    db.close()
  })

  it('omits fields that have no value rather than reporting nulls', () => {
    const db = store()
    db.recordProposal(proposalInput())
    const [recent] = db.readActivity().recent
    expect('humanAnswer' in recent).toBe(false)
    expect('matched' in recent).toBe(false)
    db.close()
  })
})

describe('agreementRate', () => {
  it('is null when nothing has been scored, not zero', () => {
    // Why: "never tested" and "always wrong" are different facts, and only one
    // of them is a reason not to enable Autopilot.
    expect(agreementRate({ resolved: 0, matched: 0 })).toBeNull()
  })

  it('excludes abstentions, which proposed nothing to be judged', () => {
    const db = store()
    db.recordProposal(
      proposalInput({ source: 'abstain', proposedAnswer: undefined, reason: 'multi-select' })
    )
    db.resolveProposal('pane-1', QUESTION, 'JWT')
    const activity = db.readActivity()
    expect(activity.abstained).toBe(1)
    expect(agreementRate(activity)).toBeNull()
    db.close()
  })

  it('is the share of scored proposals that matched', () => {
    const db = store()
    db.recordProposal(proposalInput())
    db.resolveProposal('pane-1', QUESTION, 'JWT')
    db.recordProposal(proposalInput({ questionText: 'Which database?' }))
    db.resolveProposal('pane-1', 'Which database?', 'Postgres')
    const activity = db.readActivity()
    expect(activity).toMatchObject({ resolved: 2, matched: 1 })
    expect(agreementRate(activity)).toBe(0.5)
    db.close()
  })
})
