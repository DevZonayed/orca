import { join } from 'node:path'
import { getCanonicalUserDataPath } from '../persistence'
import type { QuestionAnsweredRecord } from '../agent-hooks/server'
import { AutopilotDecisionStore } from './decision-store'

let store: AutopilotDecisionStore | null = null

export function autopilotDatabasePath(): string {
  // Why: flat userData, not profile-scoped — Autopilot's memory is meant to span
  // every project on this machine, which is the whole point of the corpus.
  return join(getCanonicalUserDataPath(), 'autopilot', 'autopilot.db')
}

/** Opened on first answered question, so users who never see one pay nothing. */
export function getAutopilotDecisionStore(): AutopilotDecisionStore {
  if (!store) {
    store = new AutopilotDecisionStore(autopilotDatabasePath())
  }
  return store
}

/**
 * Record a question the human just answered.
 *
 * Swallows its own failures: capture must never affect whether the waiting
 * card clears. The hook server also guards this, so a throw here is contained twice.
 */
export function recordAnsweredQuestion(record: QuestionAnsweredRecord): void {
  try {
    const store = getAutopilotDecisionStore()
    store.recordDecision({
      paneKey: record.paneKey,
      agentType: record.agentType,
      questionText: record.answered.question,
      promptJson: record.promptJson,
      provenance: 'human',
      ...(record.answered.header ? { questionHeader: record.answered.header } : {}),
      ...(record.answered.answer ? { answer: record.answered.answer } : {}),
      ...(record.worktreeId ? { worktreeId: record.worktreeId } : {})
    })
    // Why: the human's answer is the grade for any shadow proposal still open on
    // this pane. Skipped when the choice is unknowable (Enter), because scoring
    // against an unknown answer would report a mismatch that never happened.
    if (record.answered.answer) {
      store.resolveProposal(record.paneKey, record.answered.question, record.answered.answer)
    }
  } catch (error) {
    console.warn('[autopilot] failed to record answered question', error)
  }
}

export function closeAutopilotDecisionStore(): void {
  store?.close()
  store = null
}
