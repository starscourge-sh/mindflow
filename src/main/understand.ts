import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { ipcMain } from 'electron'
import helper from '../../resources/understand?asset&asarUnpack'
import { standIn, type Caps } from './needs'

/**
 * What this Mac can do, and the small helper (native/understand.swift) that
 * reads words with Apple's Natural Language framework and, where the Mac has
 * it, writes with Apple Intelligence. Nothing leaves the Mac.
 *
 * The Mac is asked once, at start, off the main path (`--status`); everything
 * that offers a feature reads the answer from here. HALIGTREE_QA_CAPS stands
 * an older Mac in for a probe (needs.ts).
 */

const NONE: Caps = { macos: '0', major: 0, silicon: false, embeddings: [], ai: 'too-old', translation: false }

let asked: Promise<Caps> | null = null

export function caps(): Promise<Caps> {
  asked ??= new Promise<Caps>((done) => {
    if (process.platform !== 'darwin') return done(NONE)
    execFile(helper, ['--status'], { timeout: 15_000 }, (error, out) => {
      let real = NONE
      try {
        if (!error) real = { ...NONE, ...(JSON.parse(String(out).trim()).status as Caps) }
      } catch {
        // Unreadable: this Mac is said to have nothing beyond every Mac's.
      }
      done(process.env.HALIGTREE_QA_CAPS ? standIn(process.env.HALIGTREE_QA_CAPS, real) : real)
    })
  })
  return asked
}

type Answer = Record<string, unknown> & { error?: { code: string; message: string } }

let child: ChildProcessWithoutNullStreams | null = null
let next = 1
const waiting = new Map<number, (answer: Answer) => void>()

function start(): ChildProcessWithoutNullStreams {
  const one = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  let rest = ''
  one.stdout.setEncoding('utf8')
  one.stdout.on('data', (chunk: string) => {
    rest += chunk
    let at: number
    while ((at = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, at)
      rest = rest.slice(at + 1)
      try {
        const answer = JSON.parse(line) as Answer
        const id = Number(answer.id)
        waiting.get(id)?.(answer)
        waiting.delete(id)
      } catch {
        // A line that is not an answer is let go.
      }
    }
  })
  one.stderr.resume()
  const gone = (): void => {
    if (child === one) child = null
    for (const [, answer] of waiting) answer({ error: { code: 'failed', message: 'The helper stopped' } })
    waiting.clear()
  }
  one.on('exit', gone)
  one.on('error', gone)
  return one
}

/** One request to the helper, answered in its own time; never throws. */
export function understand(op: string, body: Record<string, unknown>): Promise<Answer> {
  if (process.platform !== 'darwin') return Promise.resolve({ error: { code: 'unavailable', message: 'Only on a Mac' } })
  child ??= start()
  const id = next++
  return new Promise((done) => {
    waiting.set(id, done)
    child!.stdin.write(`${JSON.stringify({ ...body, id, op })}\n`)
  })
}

export function registerUnderstand(): void {
  ipcMain.handle('haligtree:caps', () => caps())
  // Asked now, so the answer is in hand before any page needs it.
  void caps()
}
