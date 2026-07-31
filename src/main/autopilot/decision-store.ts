import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from '../sqlite/sync-database'

// Schema versions: v1 initial decisions table. v2 adds shadow_proposals.
const SCHEMA_VERSION = 2

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

type DecisionDbRow = {
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

type ShadowProposalDbRow = {
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

function hardenDatabaseFiles(dbPath: string): void {
  if (dbPath === ':memory:' || process.platform === 'win32') {
    // Why: Windows relies on Orca's current-user-only userData DACL; POSIX mode bits are inert there.
    return
  }
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) {
      chmodSync(path, 0o600)
    }
  }
}

function toRow(row: DecisionDbRow): AutopilotDecisionRow {
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

function toProposalRow(row: ShadowProposalDbRow): ShadowProposalRow {
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

/**
 * Durable record of questions agents asked and the answers that settled them.
 *
 * This is Autopilot's ground truth: every row is either a decision the human
 * made or one Autopilot made, and the two are never conflated.
 */
export class AutopilotDecisionStore {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.createTables()
    this.migrate()
    hardenDatabaseFiles(dbPath)
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at     TEXT NOT NULL DEFAULT (datetime('now')),
        pane_key        TEXT NOT NULL,
        agent_type      TEXT NOT NULL,
        worktree_id     TEXT,
        cwd             TEXT,
        question_header TEXT,
        question_text   TEXT NOT NULL,
        prompt_json     TEXT NOT NULL,
        answer          TEXT,
        provenance      TEXT NOT NULL CHECK (provenance IN ('human', 'autopilot'))
      );
      CREATE INDEX IF NOT EXISTS decisions_question_idx
        ON decisions (question_text, provenance);

      CREATE TABLE IF NOT EXISTS shadow_proposals (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        proposed_at     TEXT NOT NULL DEFAULT (datetime('now')),
        pane_key        TEXT NOT NULL,
        agent_type      TEXT NOT NULL,
        worktree_id     TEXT,
        cwd             TEXT,
        question_header TEXT,
        question_text   TEXT NOT NULL,
        prompt_json     TEXT NOT NULL,
        proposed_answer TEXT,
        source          TEXT NOT NULL CHECK (source IN ('recall', 'generated', 'abstain')),
        reason          TEXT,
        human_answer    TEXT,
        matched         INTEGER,
        resolved_at     TEXT
      );
      CREATE INDEX IF NOT EXISTS shadow_proposals_open_idx
        ON shadow_proposals (pane_key, question_text, resolved_at);
    `)
  }

  private migrate(): void {
    const current = Number(this.db.pragma('user_version', { simple: true }) ?? 0)
    if (current >= SCHEMA_VERSION) {
      return
    }
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }

  recordDecision(decision: AutopilotDecisionInput): AutopilotDecisionRow {
    const statement = this.db.prepare(`
      INSERT INTO decisions
        (pane_key, agent_type, worktree_id, cwd, question_header, question_text, prompt_json, answer, provenance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
    const row = statement.get(
      decision.paneKey,
      decision.agentType,
      decision.worktreeId ?? null,
      decision.cwd ?? null,
      decision.questionHeader ?? null,
      decision.questionText,
      decision.promptJson,
      decision.answer ?? null,
      decision.provenance
    ) as DecisionDbRow
    return toRow(row)
  }

  /** Prior answers to the same question, newest first. Rows with no resolved
   *  answer are excluded — they record that a question was asked, not how it was settled. */
  findPriorAnswers(
    questionText: string,
    options: { provenance?: DecisionProvenance; cwd?: string; limit?: number } = {}
  ): AutopilotDecisionRow[] {
    const limit = options.limit ?? 10
    const clauses = ['question_text = ?', 'answer IS NOT NULL']
    const params: (string | number)[] = [questionText]
    if (options.provenance) {
      clauses.push('provenance = ?')
      params.push(options.provenance)
    }
    if (options.cwd) {
      clauses.push('cwd = ?')
      params.push(options.cwd)
    }
    params.push(limit)
    const rows = this.db
      .prepare(`SELECT * FROM decisions WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT ?`)
      .all(...params) as DecisionDbRow[]
    return rows.map(toRow)
  }

  countDecisions(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM decisions').get() as { n: number }
    return row.n
  }

  /** Record what Autopilot would have answered. Shadow mode never sends this. */
  recordProposal(proposal: ShadowProposalInput): ShadowProposalRow {
    const row = this.db
      .prepare(
        `INSERT INTO shadow_proposals
           (pane_key, agent_type, worktree_id, cwd, question_header, question_text,
            prompt_json, proposed_answer, source, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(
        proposal.paneKey,
        proposal.agentType,
        proposal.worktreeId ?? null,
        proposal.cwd ?? null,
        proposal.questionHeader ?? null,
        proposal.questionText,
        proposal.promptJson,
        // Why: an abstention has no answer by definition. Enforced here rather
        // than trusted from the caller so a scoring pass can never read one.
        proposal.source === 'abstain' ? null : (proposal.proposedAnswer ?? null),
        proposal.source,
        proposal.reason ?? null
      ) as ShadowProposalDbRow
    return toProposalRow(row)
  }

  /**
   * Score the open proposal for this pane against what the human actually chose.
   *
   * Scores the newest unresolved proposal only: a pane can be asked the same
   * question twice, and the older row was settled by an earlier answer.
   */
  resolveProposal(
    paneKey: string,
    questionText: string,
    humanAnswer: string
  ): ShadowProposalRow | null {
    const row = this.db
      .prepare(
        `UPDATE shadow_proposals
            SET human_answer = ?, matched = (proposed_answer IS NOT NULL AND proposed_answer = ?),
                resolved_at = datetime('now')
          WHERE id = (
            SELECT id FROM shadow_proposals
             WHERE pane_key = ? AND question_text = ? AND resolved_at IS NULL
             ORDER BY id DESC LIMIT 1
          )
          RETURNING *`
      )
      .get(humanAnswer, humanAnswer, paneKey, questionText) as ShadowProposalDbRow | undefined
    return row ? toProposalRow(row) : null
  }

  /** The whole point of shadow mode: how often would Autopilot have been right. */
  shadowAgreement(): ShadowAgreement {
    return this.db
      .prepare(
        `SELECT
           COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND proposed_answer IS NOT NULL) AS resolved,
           COUNT(*) FILTER (WHERE matched = 1) AS matched,
           COUNT(*) FILTER (WHERE source = 'abstain') AS abstained,
           COUNT(*) FILTER (WHERE resolved_at IS NULL) AS pending
         FROM shadow_proposals`
      )
      .get() as ShadowAgreement
  }

  close(): void {
    this.db.close()
  }
}
