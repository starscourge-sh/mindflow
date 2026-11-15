import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * An error main did not expect is written to the app's log (main-errors.log beside the freeze logs) and the app goes on,
 * as it did before: never Electron's raw box ("A JavaScript error occurred in the main process" and a stack) in front of
 * a person (the user, 15 Nov 2026: "i dont want the users getting such errors"). Test runs keep their own handlers
 * (sandbox.ts: into the run's output, where the checks read it).
 */
const kept = (kind: string, error: unknown): void => {
  console.error(kind, error)
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'main-errors.log'), `${new Date().toISOString()} ${kind}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n\n`)
  } catch {
    // No log folder to write to: the console above still has it.
  }
}

// HALIGTREE_QA_MAIN_ERRORS: a test run that checks this keeper itself (qa/main-errors.mjs).
if (!process.env.HALIGTREE_QA_AWAY || process.env.HALIGTREE_QA_MAIN_ERRORS) {
  process.on('uncaughtException', (error) => kept('Uncaught exception', error))
  process.on('unhandledRejection', (reason) => kept('Unhandled rejection', reason))
}
