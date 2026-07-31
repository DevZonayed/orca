import type { AskUserQuestionPrompt } from './agent-question-answered-option'

export type QuestionSafety = {
  safe: boolean
  /** The phrase that disqualified the prompt. Recorded so a refusal is auditable. */
  matched?: string
}

/**
 * Phrases that make a choice consequential enough that a human should make it.
 *
 * This is a deny-list, chosen deliberately: the requested scope is "everything
 * non-destructive", which is an open set. A deny-list therefore misses novel
 * phrasings by construction, and two things blunt that — the whole question is
 * refused when *any* option matches (not merely the chosen one), and the send is
 * a single digit, which does nothing if the pane is not showing that prompt.
 *
 * Grouped by what goes wrong, so an addition lands next to its siblings.
 */
/** Every inflection of a verb, because "removing" is as destructive as "remove"
 *  and a deny-list that only knows the infinitive is a deny-list with holes. */
function verb(stem: string): RegExp {
  return new RegExp(String.raw`\b${stem}(?:e|es|ed|ing|s)?\b`)
}

const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  // Data loss
  verb('delet'),
  verb('remov'),
  /\brm\s+-[rf]/,
  // Allow a noun between the verb and the object: "drop the users table".
  /\bdrop(?:s|ped|ping)?\s+(?:\w+\s+){0,3}(?:table|database|db|schema|column|index|collection)\b/,
  verb('destroy'),
  verb('wip'),
  verb('eras'),
  verb('purg'),
  verb('truncat'),
  verb('overwrit'),
  verb('discard'),
  verb('revok'),

  // History rewriting and irreversible git
  /\bforce[- ]push(?:es|ed|ing)?\b/,
  /\bpush\s+--force\b/,
  /\breset\s+--hard\b/,
  verb('rebas'),
  /\bsquash(?:es|ed|ing)?\b/,
  verb('revert'),
  verb('merg'),

  // Anything the outside world sees
  /\bdeploy(?:s|ed|ing|ment|ments)?\b/,
  /\bpublish(?:es|ed|ing)?\b/,
  verb('releas'),
  /\bproduction\b/,
  /\bprod\b/,
  /\bsend(?:s|ing)?\s+(?:an?\s+|the\s+)?(?:email|message|invite|notification)/,
  /\bpost(?:s|ed|ing)?\s+to\b/,

  // Money
  /\bpay(?:s|ing|ment|ments)?\b/,
  verb('charg'),
  verb('purchas'),
  verb('refund'),
  verb('invoic'),
  /\btransfer(?:s|red|ring)?\s+funds\b/,

  // Secrets
  /\bcredential[s]?\b/,
  /\bpassword[s]?\b/,
  /\bsecret[s]?\b/,
  /\bapi[- ]key[s]?\b/,
  /\bssh\s+key[s]?\b/,
  /\baccess\s+token[s]?\b/,
  verb('rotat'),

  // Availability and privilege
  /\bshut\s?down\b/,
  verb('terminat'),
  /\buninstall(?:s|ed|ing)?\b/,
  verb('downgrad'),
  /\bmigrat(?:e|es|ed|ing|ion|ions)\b/,
  /\balter\s+table\b/,
  /\bsudo\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bgrant(?:s|ed|ing)?\s+(?:access|permission)/,

  // Permission escalation: turning future questions off is itself the damage
  /\ballow\s+always\b/,
  /\balways\s+allow\b/,
  /\bdon'?t\s+ask\s+again\b/,
  /\byes\s+to\s+all\b/,
  /\bbypass(?:es|ed|ing)?\b/,
  /\bskip(?:s|ped|ping)?\s+(?:the\s+)?(?:permission|confirmation)/,
  /\bdisable(?:s|d)?\s+(?:the\s+)?(?:check|guard|safety|confirmation)/
]

function findMatch(text: string | undefined): string | null {
  if (!text) {
    return null
  }
  const normalized = text.toLowerCase()
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    const found = normalized.match(pattern)
    if (found) {
      return found[0]
    }
  }
  return null
}

/**
 * Decide whether Autopilot may answer this question at all.
 *
 * Scans the question, its header, and **every** option's label and description.
 * One consequential-looking option disqualifies the whole prompt: picking the
 * wrong row of a question that offers to delete something is the failure this
 * exists to prevent, and Autopilot's confidence in its own choice is not
 * evidence it picked right.
 */
export function classifyQuestionSafety(prompt: AskUserQuestionPrompt): QuestionSafety {
  const candidates = [
    prompt.header,
    prompt.question,
    ...prompt.options.flatMap((option) => [option.label, option.description])
  ]
  for (const candidate of candidates) {
    const matched = findMatch(candidate)
    if (matched) {
      return { safe: false, matched }
    }
  }
  return { safe: true }
}
