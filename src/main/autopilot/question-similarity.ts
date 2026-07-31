/** Words too common to be evidence that two questions are about the same thing. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'be',
  'do',
  'does',
  'should',
  'would',
  'we',
  'you',
  'it',
  'this',
  'that',
  'what',
  'which',
  'how',
  'use',
  'used',
  'using',
  'go',
  'ahead',
  'want',
  'need'
])

/** Content words of a question, lowercased and de-duplicated. */
export function tokenizeQuestion(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  return new Set(tokens)
}

export function countSharedTokens(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0
  for (const token of right) {
    if (left.has(token)) {
      count += 1
    }
  }
  return count
}

/** One candidate prior decision, reduced to what ranking needs. */
export type RankableQuestion = {
  id: number
  question_text: string
  question_header: string | null
}

/**
 * Rank prior questions by how much they look like this one.
 *
 * A shared header outweighs word overlap, because a shared header means the
 * agent itself treated the two as the same topic — stronger evidence than
 * incidental vocabulary. Ties break toward the most recent decision.
 */
export function rankRelatedQuestions<T extends RankableQuestion>(
  rows: readonly T[],
  questionText: string,
  options: { header?: string; limit: number }
): T[] {
  const wanted = tokenizeQuestion(questionText)
  if (wanted.size === 0) {
    return []
  }
  return rows
    .map((row) => {
      const overlap = countSharedTokens(wanted, tokenizeQuestion(row.question_text))
      const headerBonus = options.header && row.question_header === options.header ? wanted.size : 0
      return { row, score: overlap + headerBonus }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.row.id - a.row.id)
    .slice(0, options.limit)
    .map((entry) => entry.row)
}
