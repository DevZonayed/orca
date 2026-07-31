import type { AskUserQuestionPrompt } from './agent-question-answered-option'

/** What the human chose last time a question like this came up. */
export type PriorAnswerExample = {
  question: string
  answer: string
}

export type AutopilotAnswerContext = {
  prompt: AskUserQuestionPrompt
  /** What the human was working on: the agent's own prompt for this turn. */
  taskPrompt?: string
  /** The agent's last message, which usually contains the reasoning behind the question. */
  lastAssistantMessage?: string
  /** Working directory, so the model can tell projects apart. */
  cwd?: string
  priorAnswers?: PriorAnswerExample[]
}

const MAX_CONTEXT_CHARS = 2000
const MAX_PRIOR_ANSWERS = 5

function excerpt(text: string | undefined, limit = MAX_CONTEXT_CHARS): string | null {
  const trimmed = text?.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length > limit ? `${trimmed.slice(0, limit).trimEnd()}…` : trimmed
}

function renderOptions(prompt: AskUserQuestionPrompt): string {
  return prompt.options
    .map((option, index) => {
      const description = option.description ? ` — ${option.description}` : ''
      return `${index + 1}. ${option.label}${description}`
    })
    .join('\n')
}

function renderPriorAnswers(priorAnswers: PriorAnswerExample[]): string | null {
  const recent = priorAnswers.slice(0, MAX_PRIOR_ANSWERS)
  if (recent.length === 0) {
    return null
  }
  const lines = recent.map((prior) => `- Asked "${prior.question}" → chose "${prior.answer}"`)
  return `How this human has answered before:\n${lines.join('\n')}`
}

/**
 * Ask a generation agent to pick the option this human would pick.
 *
 * Deliberately asks for a bare label and nothing else: the reply is matched
 * against the declared options, and anything unmatched becomes an abstention.
 * Prose, hedging, or a new suggestion all fail that match, which is the
 * intended outcome — an unparseable answer must never become a sent keystroke.
 */
export function buildAutopilotAnswerPrompt(context: AutopilotAnswerContext): string {
  const { prompt } = context
  const sections: string[] = [
    'You are answering an interactive question on behalf of a software engineer who is away from the keyboard.',
    'Choose the option they would most likely choose, based on the context and their past choices.',
    '',
    prompt.header ? `Topic: ${prompt.header}` : null,
    `Question: ${prompt.question}`,
    '',
    'Options:',
    renderOptions(prompt),
    ''
  ].filter((section): section is string => section !== null)

  const cwd = excerpt(context.cwd, 200)
  if (cwd) {
    sections.push(`Working directory: ${cwd}`, '')
  }
  const task = excerpt(context.taskPrompt)
  if (task) {
    sections.push(`What they asked the agent to do:\n${task}`, '')
  }
  const assistant = excerpt(context.lastAssistantMessage)
  if (assistant) {
    sections.push(`What the agent said just before asking:\n${assistant}`, '')
  }
  const priors = context.priorAnswers ? renderPriorAnswers(context.priorAnswers) : null
  if (priors) {
    sections.push(priors, '')
  }

  sections.push(
    'Reply with the exact text of one option label and nothing else.',
    'If you cannot tell which option they would pick, reply with exactly: UNSURE'
  )
  return sections.join('\n')
}

/** Sentinel the prompt asks for when the model cannot choose. */
export const AUTOPILOT_ANSWER_UNSURE = 'UNSURE'

function normalize(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Match a generated reply back to a declared option label.
 *
 * Returns null for anything that is not unambiguously one of the options —
 * including the UNSURE sentinel, a number, or a label that prefixes two
 * different options. Null means abstain.
 */
export function parseAutopilotAnswerReply(
  raw: string,
  optionLabels: readonly string[]
): string | null {
  // Why: agents often prepend reasoning; the label is what survives on the last
  // non-empty line far more often than on the first.
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const candidates = lines.length > 0 ? [lines.at(-1) ?? raw, lines[0], raw] : [raw]

  for (const candidate of candidates) {
    const normalized = normalize(candidate)
    if (!normalized || normalized === normalize(AUTOPILOT_ANSWER_UNSURE)) {
      continue
    }
    const exact = optionLabels.filter((label) => normalize(label) === normalized)
    if (exact.length === 1) {
      return exact[0]
    }
    // Why: a bare number is not accepted. Option order is the agent's, and a
    // model that answers "2" may well be counting a list it reordered itself.
    if (/^\d+$/.test(normalized)) {
      continue
    }
    const contained = optionLabels.filter((label) => {
      const normalizedLabel = normalize(label)
      return normalizedLabel.length > 0 && normalized.includes(normalizedLabel)
    })
    if (contained.length === 1) {
      return contained[0]
    }
  }
  return null
}
