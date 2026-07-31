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
function getStore(): AutopilotDecisionStore {
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
    getStore().recordDecision({
      paneKey: record.paneKey,
      agentType: record.agentType,
      questionText: record.answered.question,
      promptJson: record.promptJson,
      provenance: 'human',
      ...(record.answered.header ? { questionHeader: record.answered.header } : {}),
      ...(record.answered.answer ? { answer: record.answered.answer } : {}),
      ...(record.worktreeId ? { worktreeId: record.worktreeId } : {})
    })
  } catch (error) {
    console.warn('[autopilot] failed to record answered question', error)
  }
}

export function closeAutopilotDecisionStore(): void {
  store?.close()
  store = null
}
