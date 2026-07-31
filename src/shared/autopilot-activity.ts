/** One abstention cause, with how often it happened. */
export type AbstentionReason = {
  reason: string
  count: number
}

/** A recent shadow proposal, as the settings panel shows it. */
export type ActivityProposal = {
  proposedAt: string
  question: string
  source: string
  proposedAnswer?: string
  humanAnswer?: string
  matched?: boolean
  reason?: string
}

/** Read-only view of what Autopilot has proposed, sent, and declined. */
export type AutopilotActivity = {
  /** Proposals that named an option and have since been resolved. */
  resolved: number
  matched: number
  abstained: number
  pending: number
  /** Answers Autopilot actually typed, not merely proposed. */
  sent: number
  /** Human decisions on record — the corpus recall draws on. */
  decisions: number
  abstentionReasons: AbstentionReason[]
  recent: ActivityProposal[]
  /** False when nothing has been observed yet, so the panel can say so rather
   *  than render zeroes that look like a measurement. */
  hasData: boolean
}

/**
 * Share of resolved proposals Autopilot got right, or null when there are none.
 *
 * Null rather than zero: "never been tested" and "always wrong" are different
 * facts, and only one of them is a reason not to enable it. Abstentions are
 * excluded because they proposed nothing to be right or wrong about.
 */
export function agreementRate(
  activity: Pick<AutopilotActivity, 'resolved' | 'matched'>
): number | null {
  return activity.resolved === 0 ? null : activity.matched / activity.resolved
}
