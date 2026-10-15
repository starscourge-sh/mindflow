import { DatabaseSync } from 'node:sqlite'

/**
 * The database, opened for speed: each save is written to a log beside the
 * file (mindflow.db-wal) and folded into the file in batches, so a save no
 * longer rewrites the file and waits for the disk twice. A crash of the app
 * loses nothing; only a power cut can lose the last moment's saves, never
 * the file itself. Anything that copies the database must read it through
 * SQLite (`vacuum into`, as the backups do) or copy the log with it. A run
 * still ending while a sandbox reset starts again in the same folder is safe:
 * SQLite sees its file was removed and leaves the new run's log alone.
 */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal; pragma synchronous = normal')
  return db
}
