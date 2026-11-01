import { ipcMain } from 'electron'

/**
 * Long jobs a person starts (an export, saving files, an import, a scan) and
 * can give up on with "Stop" or Esc, as Transcribe can. Each job takes a
 * signal by its name; "Stop" aborts it. The job checks the signal between
 * steps, takes back what it had written so far, and says it stopped, so
 * nothing is left half-written.
 */
const running = new Map<string, AbortController>()

/** Thrown by a job that was stopped, once it has taken back what it wrote. */
export class Stopped extends Error {
  constructor() {
    super('stopped')
  }
}

/** A job starting: its signal, the one before of the same name stopped. */
export function begin(name: string): AbortSignal {
  running.get(name)?.abort()
  const control = new AbortController()
  running.set(name, control)
  return control.signal
}

/** A job over, stopped or not: its name is free again. */
export function end(name: string, signal: AbortSignal): void {
  if (running.get(name)?.signal === signal) running.delete(name)
}

/** Stop the job of this name, if one is running. */
export function stop(name: string): void {
  running.get(name)?.abort()
}

export function registerJobs(): void {
  ipcMain.handle('haligtree:job-stop', (_event, name: unknown) => stop(String(name ?? '')))
}
