import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

/**
 * A book's copy for the day (backup.ts, books.ts `copyBook`), written on a thread of its own: `vacuum into` reads
 * the whole book and writes it out again, and on main's one thread it held every window for as long as that took,
 * on the first start of each day, while the main window was coming up. Its own connection, read-only, as the
 * reading thread's is: main stays the book's one writer. No Electron here.
 */
const { from, to } = workerData as { from: string; to: string }
const db = new DatabaseSync(from, { readOnly: true })
// The one moment the book can be shut to a reader is while main folds its log into the file: waited out here.
db.exec('pragma busy_timeout = 2000')
try {
  db.prepare('vacuum into ?').run(to)
  parentPort!.postMessage(null)
} catch (error) {
  // Said as it was: the backup's own words for it are chosen on main (backup.ts `why`).
  parentPort!.postMessage({ message: error instanceof Error ? error.message : String(error), code: (error as { code?: unknown }).code })
} finally {
  db.close()
}
