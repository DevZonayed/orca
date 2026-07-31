import type Database from '../sqlite/sync-database'
import type { ShadowAgreement } from './shadow-proposal-rows'
import type { ActivityProposal, AutopilotActivity } from '../../shared/autopilot-activity'

export type {
  AbstentionReason,
  ActivityProposal,
  AutopilotActivity
} from '../../shared/autopilot-activity'

const RECENT_LIMIT = 20
const REASON_LIMIT = 5

type ProposalDbRow = {
  proposed_at: string
  question_text: string
  source: string
  proposed_answer: string | null
  human_answer: string | null
  matched: number | null
  reason: string | null
}

/**
 * Everything the settings panel needs, in one bounded read.
 *
 * Every query is `LIMIT`ed and runs only when the panel asks, because
 * `node:sqlite` is synchronous and this runs on the main thread.
 */
export function readAutopilotActivity(db: Database.Database): AutopilotActivity {
  const agreement = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND proposed_answer IS NOT NULL) AS resolved,
         COUNT(*) FILTER (WHERE matched = 1) AS matched,
         COUNT(*) FILTER (WHERE source = 'abstain') AS abstained,
         COUNT(*) FILTER (WHERE resolved_at IS NULL) AS pending
       FROM shadow_proposals`
    )
    .get() as ShadowAgreement

  const sent = (
    db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE provenance = 'autopilot'").get() as {
      n: number
    }
  ).n
  const decisions = (
    db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE provenance = 'human'").get() as {
      n: number
    }
  ).n

  const abstentionReasons = (
    db
      .prepare(
        `SELECT reason, COUNT(*) AS count
           FROM shadow_proposals
          WHERE source = 'abstain' AND reason IS NOT NULL
          GROUP BY reason
          ORDER BY count DESC
          LIMIT ?`
      )
      .all(REASON_LIMIT) as { reason: string; count: number }[]
  ).map((row) => ({ reason: row.reason, count: row.count }))

  const recent = (
    db
      .prepare(
        `SELECT proposed_at, question_text, source, proposed_answer, human_answer, matched, reason
           FROM shadow_proposals
          ORDER BY id DESC
          LIMIT ?`
      )
      .all(RECENT_LIMIT) as ProposalDbRow[]
  ).map(toActivityProposal)

  const total = agreement.resolved + agreement.abstained + agreement.pending
  return {
    ...agreement,
    sent,
    decisions,
    abstentionReasons,
    recent,
    hasData: total > 0 || decisions > 0
  }
}

function toActivityProposal(row: ProposalDbRow): ActivityProposal {
  return {
    proposedAt: row.proposed_at,
    question: row.question_text,
    source: row.source,
    ...(row.proposed_answer === null ? {} : { proposedAnswer: row.proposed_answer }),
    ...(row.human_answer === null ? {} : { humanAnswer: row.human_answer }),
    ...(row.matched === null ? {} : { matched: row.matched === 1 }),
    ...(row.reason === null ? {} : { reason: row.reason })
  }
}
