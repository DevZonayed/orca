import type Database from '../sqlite/sync-database'

// Schema versions: v1 initial decisions table. v2 adds shadow_proposals.
// v3 adds mined_files so a re-scan skips unchanged transcripts.
export const AUTOPILOT_SCHEMA_VERSION = 3

/** Every table Autopilot owns. Additive DDL only, so opening an older
 *  database upgrades it in place without a migration step. */
export function createAutopilotTables(db: Database.Database): void {
  db.exec(`
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

      CREATE TABLE IF NOT EXISTS mined_files (
        path        TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        mined_at    TEXT NOT NULL DEFAULT (datetime('now')),
        found       INTEGER NOT NULL DEFAULT 0
      );

      -- Why: seeding is idempotent by construction. A transcript re-read after an
      -- edit must not double every answer it already contributed.
      CREATE UNIQUE INDEX IF NOT EXISTS decisions_seed_idx
        ON decisions (question_text, answer, provenance)
        WHERE answer IS NOT NULL AND pane_key = '';
  `)
}
