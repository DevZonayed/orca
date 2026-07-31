import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from '../sqlite/sync-database'
import { rankRelatedQuestions } from './question-similarity'
import { AUTOPILOT_SCHEMA_VERSION, createAutopilotTables } from './autopilot-schema'
import {
  toRow,
  type AutopilotDecisionInput,
  type AutopilotDecisionRow,
  type DecisionDbRow,
  type DecisionProvenance
} from './decision-rows'

export type {
  AutopilotDecisionInput,
  AutopilotDecisionRow,
  DecisionProvenance
} from './decision-rows'
import {
  toProposalRow,
  type ShadowAgreement,
  type ShadowProposalDbRow,
  type ShadowProposalInput,
  type ShadowProposalRow
} from './shadow-proposal-rows'

export type {
  ProposalSource,
  ShadowAgreement,
  ShadowProposalInput,
  ShadowProposalRow
} from './shadow-proposal-rows'

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
    createAutopilotTables(this.db)
  }

  private migrate(): void {
    const current = Number(this.db.pragma('user_version', { simple: true }) ?? 0)
    if (current >= AUTOPILOT_SCHEMA_VERSION) {
      return
    }
    this.db.exec(`PRAGMA user_version = ${AUTOPILOT_SCHEMA_VERSION}`)
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

  /** True when this transcript has already been mined at this exact size+mtime. */
  isFileMined(path: string, fingerprint: string): boolean {
    const row = this.db.prepare('SELECT fingerprint FROM mined_files WHERE path = ?').get(path) as
      | { fingerprint: string }
      | undefined
    return row?.fingerprint === fingerprint
  }

  /** Every already-mined transcript, so a re-scan can skip unchanged files. */
  getMinedFingerprints(): Record<string, string> {
    const rows = this.db.prepare('SELECT path, fingerprint FROM mined_files').all() as {
      path: string
      fingerprint: string
    }[]
    return Object.fromEntries(rows.map((row) => [row.path, row.fingerprint]))
  }

  markFileMined(path: string, fingerprint: string, found: number): void {
    this.db
      .prepare(
        `INSERT INTO mined_files (path, fingerprint, found, mined_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(path) DO UPDATE
           SET fingerprint = excluded.fingerprint,
               found = excluded.found,
               mined_at = excluded.mined_at`
      )
      .run(path, fingerprint, found)
  }

  /**
   * Insert answers recovered from history, skipping ones already seeded.
   *
   * Mined rows carry `provenance: 'human'` because they *are* the human's real
   * choices, and an empty `pane_key` because no pane produced them — which is
   * also what the partial unique index keys on. Returns how many were new.
   */
  seedMinedDecisions(
    seeds: readonly { questionText: string; answer: string; cwd?: string }[]
  ): number {
    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO decisions
         (pane_key, agent_type, cwd, question_text, prompt_json, answer, provenance)
       VALUES ('', 'claude', ?, ?, '', ?, 'human')`
    )
    let inserted = 0
    for (const seed of seeds) {
      const result = statement.run(seed.cwd ?? null, seed.questionText, seed.answer)
      inserted += Number(result.changes ?? 0)
    }
    return inserted
  }

  /**
   * Human answers to *different* questions that look related to this one.
   *
   * Evidence for a generated answer, never a decision in itself: an answer to
   * another question says how this person tends to choose, not what they chose
   * here. `findPriorAnswers` remains the only exact-match path, and only that
   * one may drive a recall send.
   *
   * ponytail: linear scan + word overlap, no embeddings. The corpus is tens of
   * rows; revisit only past a few thousand.
   */
  findRelatedAnswers(
    questionText: string,
    options: { header?: string; limit?: number } = {}
  ): AutopilotDecisionRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM decisions
          WHERE provenance = 'human' AND answer IS NOT NULL AND question_text <> ?
          ORDER BY id DESC LIMIT 500`
      )
      .all(questionText) as DecisionDbRow[]
    return rankRelatedQuestions(rows, questionText, {
      ...(options.header ? { header: options.header } : {}),
      limit: options.limit ?? 5
    }).map(toRow)
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
