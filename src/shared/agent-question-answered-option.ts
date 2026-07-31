import { isPotentialQuestionAnsweredSubmitInput } from './agent-question-answered-intent'

/** A question the human just answered, recovered from the prompt payload. */
export type AnsweredQuestionOption = {
  header?: string
  question: string
  /** Chosen option label. Absent for Enter: the highlighted row lives in the
   *  agent's TUI, not in the prompt payload, so it cannot be recovered here. */
  answer?: string
}

type PromptQuestion = {
  header?: unknown
  question?: unknown
  multiSelect?: unknown
  options?: unknown
}

function readOptionLabel(option: unknown): string | null {
  if (typeof option === 'string') {
    return option.length > 0 ? option : null
  }
  if (option && typeof option === 'object') {
    const label = (option as { label?: unknown }).label
    if (typeof label === 'string' && label.length > 0) {
      return label
    }
  }
  return null
}

function readSingleQuestion(interactivePrompt: string | undefined): PromptQuestion | null {
  if (!interactivePrompt) {
    return null
  }
  let parsed: { questions?: unknown }
  try {
    parsed = JSON.parse(interactivePrompt) as { questions?: unknown }
  } catch {
    return null
  }
  // Why: mirrors isQuestionAnsweredSubmitInput — one keystroke only completes a
  // single-question prompt. Anything else leaves the agent still blocked.
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 1) {
    return null
  }
  const [question] = parsed.questions as PromptQuestion[]
  if (!question || typeof question.question !== 'string' || question.question.length === 0) {
    return null
  }
  return question
}

/**
 * Resolve which option a single submit keystroke selected.
 *
 * Returns the question even when the answer is unknowable (Enter, or a
 * multi-select), because knowing a question was asked is itself worth recording.
 */
export function resolveAnsweredQuestionOption(
  interactivePrompt: string | undefined,
  data: string
): AnsweredQuestionOption | null {
  if (!isPotentialQuestionAnsweredSubmitInput(data)) {
    return null
  }
  const question = readSingleQuestion(interactivePrompt)
  if (!question) {
    return null
  }
  const header = typeof question.header === 'string' ? question.header : undefined
  const text = question.question as string
  const base: AnsweredQuestionOption = header ? { header, question: text } : { question: text }
  if (question.multiSelect === true || !Array.isArray(question.options)) {
    return base
  }
  const index = Number(data) - 1
  if (!Number.isInteger(index) || index < 0 || index >= question.options.length) {
    return base
  }
  const answer = readOptionLabel(question.options[index])
  return answer ? { ...base, answer } : base
}
