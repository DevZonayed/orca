/** One question the human actually answered, recovered from a transcript. */
export type TranscriptAnswer = {
  question: string
  answer: string
}

const ANSWERED_PREFIX = 'Your questions have been answered:'

/** Pairs are separated by `", "` — the closing quote of an answer, then the
 *  opening quote of the next question. */
const PAIR_SEPARATOR = '", "'
/** The delimiter inside a pair. A question can contain a bare `"` but not this. */
const PAIR_DELIMITER = '"="'
/** Trailing prose the tool appends after the last pair. */
const TRAILING_NOTES = [' selected preview:', '. You can now continue with these answers in mind.']

/**
 * Recover the questions a human answered from Claude's AskUserQuestion result.
 *
 * The result text is the only place the chosen label survives — which makes this
 * strictly better than the live terminal path, where an Enter-submitted answer
 * is unrecoverable because the highlight lives in the agent's TUI.
 *
 * Returns an empty array for the failure results ('Tool permission request
 * failed…', 'The user did not answer the questions.'), which measurement shows
 * are the large majority of real transcripts.
 */
export function parseAnsweredQuestionsResult(resultText: string): TranscriptAnswer[] {
  const start = resultText.indexOf(ANSWERED_PREFIX)
  if (start < 0) {
    return []
  }
  const body = stripTrailingNote(resultText.slice(start + ANSWERED_PREFIX.length).trim())
  const answers: TranscriptAnswer[] = []
  for (const segment of body.split(PAIR_SEPARATOR)) {
    // Why: the FIRST delimiter, not a quote-greedy match. Real questions contain
    // bare quotes — `Your existing calling agent ("green brain") — where…` — and
    // matching on quotes silently starts the question mid-sentence.
    const boundary = segment.indexOf(PAIR_DELIMITER)
    if (boundary < 0) {
      continue
    }
    const question = segment.slice(0, boundary).replace(/^"/, '').trim()
    // Why: only the final pair carries the closing quote (and the sentence period
    // after it). Middle segments end bare, because the separator consumed theirs.
    const answer = segment
      .slice(boundary + PAIR_DELIMITER.length)
      .replace(/"\s*\.?\s*$/, '')
      .trim()
    if (question && answer) {
      answers.push({ question, answer })
    }
  }
  return answers
}

function stripTrailingNote(body: string): string {
  let trimmed = body
  for (const note of TRAILING_NOTES) {
    const index = trimmed.indexOf(note)
    if (index >= 0) {
      trimmed = trimmed.slice(0, index)
    }
  }
  return trimmed.trim()
}

type TranscriptBlock = {
  type?: unknown
  name?: unknown
  id?: unknown
  tool_use_id?: unknown
  content?: unknown
}

function readResultText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''
      )
      .filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : null
  }
  return null
}

/**
 * Recover every answered question from one Claude transcript.
 *
 * A result is only trusted when its `tool_use_id` matches an AskUserQuestion
 * seen earlier in the same file. Without that pairing, any assistant message
 * quoting the phrase would be mined as if it were a real answer.
 */
export function parseAnsweredQuestionsFromTranscript(jsonl: string): TranscriptAnswer[] {
  const askIds = new Set<string>()
  const answers: TranscriptAnswer[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.includes('AskUserQuestion') && !line.includes(ANSWERED_PREFIX)) {
      continue
    }
    let parsed: { message?: { content?: unknown } }
    try {
      parsed = JSON.parse(line) as { message?: { content?: unknown } }
    } catch {
      continue
    }
    const content = parsed.message?.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const raw of content) {
      const block = raw as TranscriptBlock
      if (block?.type === 'tool_use' && block.name === 'AskUserQuestion') {
        if (typeof block.id === 'string') {
          askIds.add(block.id)
        }
        continue
      }
      if (
        block?.type !== 'tool_result' ||
        typeof block.tool_use_id !== 'string' ||
        !askIds.has(block.tool_use_id)
      ) {
        continue
      }
      const text = readResultText(block.content)
      if (text) {
        answers.push(...parseAnsweredQuestionsResult(text))
      }
    }
  }
  return answers
}
