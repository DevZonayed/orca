/** Where a shadow proposal came from. `abstain` carries no answer by construction. */
export type ProposalSource = 'recall' | 'generated' | 'abstain'

export type ShadowProposalInput = {
  paneKey: string
  agentType: string
  questionText: string
  promptJson: string
  source: ProposalSource
  questionHeader?: string
  /** The option Autopilot would have picked. Always absent when abstaining. */
  proposedAnswer?: string
  reason?: string
  worktreeId?: string
  cwd?: string
}

export type ShadowProposalRow = ShadowProposalInput & {
  id: number
  proposedAt: string
  humanAnswer?: string
  /** True when the human picked what Autopilot proposed. Absent until resolved. */
  matched?: boolean
  resolvedAt?: string
}

export type ShadowProposalDbRow = {
  id: number
  proposed_at: string
  pane_key: string
  agent_type: string
  worktree_id: string | null
  cwd: string | null
  question_header: string | null
  question_text: string
  prompt_json: string
  proposed_answer: string | null
  source: string
  reason: string | null
  human_answer: string | null
  matched: number | null
  resolved_at: string | null
}

export type ShadowAgreement = {
  /** Proposals that named an option and have since been resolved. */
  resolved: number
  matched: number
  abstained: number
  pending: number
}

export function toProposalRow(row: ShadowProposalDbRow): ShadowProposalRow {
  return {
    id: row.id,
    proposedAt: row.proposed_at,
    paneKey: row.pane_key,
    agentType: row.agent_type,
    questionText: row.question_text,
    promptJson: row.prompt_json,
    source: row.source as ProposalSource,
    ...(row.question_header === null ? {} : { questionHeader: row.question_header }),
    ...(row.proposed_answer === null ? {} : { proposedAnswer: row.proposed_answer }),
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.worktree_id === null ? {} : { worktreeId: row.worktree_id }),
    ...(row.cwd === null ? {} : { cwd: row.cwd }),
    ...(row.human_answer === null ? {} : { humanAnswer: row.human_answer }),
    ...(row.matched === null ? {} : { matched: row.matched === 1 }),
    ...(row.resolved_at === null ? {} : { resolvedAt: row.resolved_at })
  }
}
