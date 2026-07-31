import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from '../sqlite/sync-database'

// Schema versions: v1 initial decisions table.
const SCHEMA_VERSION = 1

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

  close(): void {
    this.db.close()
  }
}
