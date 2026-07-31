import type { AskUserQuestionPrompt } from '../../shared/agent-question-answered-option'
import {
  buildAutopilotAnswerPrompt,
  parseAutopilotAnswerReply,
  type AutopilotAnswerContext,
  type PriorAnswerExample
} from '../../shared/autopilot-answer-prompt'
import type { ProposalSource } from './decision-store'

export type AutopilotProposal = {
  source: ProposalSource
  /** The option Autopilot would pick. Always absent when abstaining. */
  answer?: string
  /** Why it chose, or why it declined. Recorded verbatim in the audit row. */
  reason: string
}

export type GenerateAnswerResult =
  | { success: true; reply: string }
  | { success: false; error: string }

export type AutopilotDecisionInputs = {
  prompt: AskUserQuestionPrompt
  priorAnswers: PriorAnswerExample[]
  context: Omit<AutopilotAnswerContext, 'prompt' | 'priorAnswers'>
  /** Absent when no generation agent is configured, which is an abstention, not an error. */
  generate?: (generationPrompt: string) => Promise<GenerateAnswerResult>
}

function abstain(reason: string): AutopilotProposal {
  return { source: 'abstain', reason }
}

/**
 * Decide which option Autopilot would pick, or decline to pick one.
 *
 * Abstention is a first-class result, not a failure. Every path that cannot
 * name a declared option returns one, because the alternative — a plausible
 * guess — is exactly what shadow mode exists to keep out of a live pane.
 */
export async function decideAutopilotAnswer(
  inputs: AutopilotDecisionInputs
): Promise<AutopilotProposal> {
  const { prompt, priorAnswers, context, generate } = inputs
  if (prompt.multiSelect) {
    return abstain('multi-select questions need more than one choice')
  }
  if (prompt.options.length === 0) {
    return abstain('prompt declared no options')
  }
  const labels = prompt.options.map((option) => option.label)

  // Why: recall before generation. A label the human already picked for this
  // exact question is evidence; a model's opinion about it is inference.
  const recalled = priorAnswers.find((prior) => labels.includes(prior.answer))
  if (recalled) {
    return {
      source: 'recall',
      answer: recalled.answer,
      reason: `human previously chose "${recalled.answer}" for this question`
    }
  }

  if (!generate) {
    return abstain('no generation agent configured')
  }
  const generationPrompt = buildAutopilotAnswerPrompt({ ...context, prompt, priorAnswers })
  let result: GenerateAnswerResult
  try {
    result = await generate(generationPrompt)
  } catch (error) {
    return abstain(`generation threw: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!result.success) {
    return abstain(`generation failed: ${result.error}`)
  }
  const matched = parseAutopilotAnswerReply(result.reply, labels)
  if (!matched) {
    return abstain('generated reply did not match exactly one option')
  }
  return { source: 'generated', answer: matched, reason: 'generated and matched a declared option' }
}
