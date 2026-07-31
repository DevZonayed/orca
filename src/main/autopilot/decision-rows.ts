/** Who produced an answer. Recorded from the first row so a later mining pass
 *  can never ingest Autopilot's own answers as human decisions. */
export type DecisionProvenance = 'human' | 'autopilot'

export type AutopilotDecisionInput = {
  paneKey: string
  agentType: string
  questionText: string
  promptJson: string
  provenance: DecisionProvenance
  questionHeader?: string
  /** Absent when the answer is unknowable — Enter, or a multi-select. */
  answer?: string
  worktreeId?: string
  cwd?: string
}

export type AutopilotDecisionRow = AutopilotDecisionInput & {
  id: number
  recordedAt: string
}

export type DecisionDbRow = {
  id: number
  recorded_at: string
  pane_key: string
  agent_type: string
  worktree_id: string | null
  cwd: string | null
  question_header: string | null
  question_text: string
  prompt_json: string
  answer: string | null
  provenance: string
}

export function toRow(row: DecisionDbRow): AutopilotDecisionRow {
  return {
    id: row.id,
    recordedAt: row.recorded_at,
    paneKey: row.pane_key,
    agentType: row.agent_type,
    questionText: row.question_text,
    promptJson: row.prompt_json,
    provenance: row.provenance as DecisionProvenance,
    ...(row.question_header === null ? {} : { questionHeader: row.question_header }),
    ...(row.answer === null ? {} : { answer: row.answer }),
    ...(row.worktree_id === null ? {} : { worktreeId: row.worktree_id }),
    ...(row.cwd === null ? {} : { cwd: row.cwd })
  }
}
