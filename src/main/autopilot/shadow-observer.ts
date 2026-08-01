import {
  readAskUserQuestionPrompt,
  type AskUserQuestionPrompt
} from '../../shared/agent-question-answered-option'
import type { PriorAnswerExample } from '../../shared/autopilot-answer-prompt'
import { decideAutopilotAnswer, type GenerateAnswerResult } from './answer-decider'
import type { AutopilotSendRequest, AutopilotSendResult } from './answer-sender'
import type { AutopilotDecisionStore } from './decision-store'

/** The subset of an enriched hook payload the observer reads. */
export type ObservedAgentStatus = {
  paneKey: string
  worktreeId?: string
  /** Null for a local pane; anything else means the pane lives over SSH. */
  connectionId?: string | null
  payload: {
    state: string
    prompt?: string
    agentType?: string
    toolName?: string
    interactivePrompt?: string
    lastAssistantMessage?: string
  }
}

export type ShadowObserverDeps = {
  getStore: () => AutopilotDecisionStore
  /** Null when no generation agent is configured; the decider abstains. */
  createGenerator: () => ((prompt: string) => Promise<GenerateAnswerResult>) | null
  getCwdForPane?: (status: ObservedAgentStatus) => string | undefined
  /** Absent in shadow-only builds and tests, where no send path exists at all. */
  send?: (request: AutopilotSendRequest) => AutopilotSendResult
}

const MAX_TRACKED_PANES = 200

function toPriorAnswers(
  store: AutopilotDecisionStore,
  questionText: string,
  cwd: string | undefined
): PriorAnswerExample[] {
  // Why: same-project answers first, then anything on this machine. The corpus
  // is machine-wide on purpose, but a project-local precedent is stronger.
  const scoped = cwd ? store.findPriorAnswers(questionText, { provenance: 'human', cwd }) : []
  const global = store.findPriorAnswers(questionText, { provenance: 'human' })
  const seen = new Set<string>()
  const priors: PriorAnswerExample[] = []
  for (const row of [...scoped, ...global]) {
    if (!row.answer || seen.has(row.answer)) {
      continue
    }
    seen.add(row.answer)
    priors.push({ question: row.questionText, answer: row.answer })
  }
  return priors
}

function toRelatedAnswers(
  store: AutopilotDecisionStore,
  questionText: string,
  header: string | undefined
): PriorAnswerExample[] {
  const rows = store.findRelatedAnswers(questionText, header ? { header } : {})
  return rows.flatMap((row) =>
    row.answer ? [{ question: row.questionText, answer: row.answer }] : []
  )
}

/**
 * Watch for questions and record what Autopilot would have answered.
 *
 * Shadow mode: this class has no send path and holds no terminal handle, so
 * "it cannot type into a pane" is a property of its dependencies, not of a
 * flag someone could flip. M3 introduces sending, behind its own gate.
 */
export class AutopilotShadowObserver {
  private readonly deps: ShadowObserverDeps
  /** Last question proposed on each pane, so re-delivered status events for the
   *  same waiting question do not re-propose (and re-spend a generation call). */
  private readonly lastProposedByPane = new Map<string, string>()
  private inFlight = new Set<string>()

  constructor(deps: ShadowObserverDeps) {
    this.deps = deps
  }

  /** Fire-and-forget: hook delivery must never wait on a generation call. */
  observe(status: ObservedAgentStatus): void {
    void this.observeAsync(status)
  }

  async observeAsync(status: ObservedAgentStatus): Promise<void> {
    const { paneKey, payload } = status
    if (payload.state !== 'waiting' || !payload.interactivePrompt) {
      // Why: the pane moved on, so the next question on it is genuinely new.
      this.lastProposedByPane.delete(paneKey)
      return
    }
    const prompt = readAskUserQuestionPrompt(payload.interactivePrompt)
    if (!prompt) {
      return
    }
    if (this.lastProposedByPane.get(paneKey) === payload.interactivePrompt) {
      return
    }
    if (this.inFlight.has(paneKey)) {
      return
    }
    this.lastProposedByPane.set(paneKey, payload.interactivePrompt)
    this.forgetOldestWhenFull()
    this.inFlight.add(paneKey)
    try {
      await this.propose(status, prompt, payload.interactivePrompt)
    } catch (error) {
      console.warn('[autopilot] shadow proposal failed', error)
    } finally {
      this.inFlight.delete(paneKey)
    }
  }

  private async propose(
    status: ObservedAgentStatus,
    prompt: AskUserQuestionPrompt,
    interactivePrompt: string
  ): Promise<void> {
    const questionText = prompt.question
    const store = this.deps.getStore()
    const cwd = this.deps.getCwdForPane?.(status)
    const priorAnswers = toPriorAnswers(store, questionText, cwd)
    const generate = this.deps.createGenerator()
    const proposal = await decideAutopilotAnswer({
      prompt,
      priorAnswers,
      // Why: answers to *different* questions. Evidence for generation only —
      // the decider must never recall-and-send one, because it answers something else.
      relatedAnswers: toRelatedAnswers(store, questionText, prompt.header),
      context: {
        ...(status.payload.prompt ? { taskPrompt: status.payload.prompt } : {}),
        ...(status.payload.lastAssistantMessage
          ? { lastAssistantMessage: status.payload.lastAssistantMessage }
          : {}),
        ...(cwd ? { cwd } : {})
      },
      ...(generate ? { generate } : {})
    })
    // Why: recorded before any send is attempted, and unconditionally. Turning
    // Autopilot on must not blind the audit that justifies turning it on.
    store.recordProposal({
      paneKey: status.paneKey,
      agentType: status.payload.agentType ?? 'unknown',
      questionText,
      promptJson: interactivePrompt,
      source: proposal.source,
      reason: proposal.reason,
      ...(prompt.header ? { questionHeader: prompt.header } : {}),
      ...(proposal.answer ? { proposedAnswer: proposal.answer } : {}),
      ...(status.worktreeId ? { worktreeId: status.worktreeId } : {}),
      ...(cwd ? { cwd } : {})
    })

    if (!proposal.answer || !this.deps.send) {
      return
    }
    const result = this.deps.send({
      paneKey: status.paneKey,
      decidedInteractivePrompt: interactivePrompt,
      answer: proposal.answer,
      agentType: status.payload.agentType,
      toolName: status.payload.toolName,
      connectionId: status.connectionId ?? null
    })
    if (!result.sent) {
      return
    }
    // Why: provenance 'autopilot'. This row must never be recalled as evidence
    // of what the human wants — that is the whole reason the column exists.
    store.recordDecision({
      paneKey: status.paneKey,
      agentType: status.payload.agentType ?? 'unknown',
      questionText,
      promptJson: interactivePrompt,
      provenance: 'autopilot',
      answer: proposal.answer,
      ...(prompt.header ? { questionHeader: prompt.header } : {}),
      ...(status.worktreeId ? { worktreeId: status.worktreeId } : {}),
      ...(cwd ? { cwd } : {})
    })
  }

  /** Bound the dedupe map so a long-lived session cannot grow it without limit. */
  private forgetOldestWhenFull(): void {
    while (this.lastProposedByPane.size > MAX_TRACKED_PANES) {
      const oldest = this.lastProposedByPane.keys().next()
      if (oldest.done) {
        return
      }
      this.lastProposedByPane.delete(oldest.value)
    }
  }
}
