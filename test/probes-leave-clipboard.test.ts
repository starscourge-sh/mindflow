// Run with: node --test test/probes-leave-clipboard.test.ts
// The Mac's clipboard is the person's: a probe never reads or writes it, and never pastes with ⌘V through it (15 Nov
// 2026: every merge check emptied it, and two test lanes raced each other through it). A copy is read from the app's
// stand-in and a paste is a paste event carrying its data, both through qa/pasteboard.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const probes = readdirSync('qa').filter((name) => name.endsWith('.mjs'))

/** Lines a probe may keep, what each does said beside it: none since qa/cal-daymark.mjs went on 18 Nov. */
const KEPT: Record<string, RegExp> = {}

test("no probe reads or writes the Mac's clipboard, or pastes through it", () => {
  const found: string[] = []
  for (const name of probes) {
    readFileSync(join('qa', name), 'utf8').split('\n').forEach((line, at) => {
      // Electron's own clipboard in main (a page's navigator.clipboard reaches the stand-in in a test run), or ⌘V.
      const touches = /(?<!navigator\.)\bclipboard\.(write|read|has|clear|availableFormats)\w*\(|\{[^}]*\bclipboard\b[^}]*\}\s*(,[^)]*)?\)\s*=>|keyboard\.press\(['"](Meta|Control|ControlOrMeta)(\+Shift)?(\+Alt)?\+v['"]\)|execCommand\(['"]paste/.test(line)
      if (touches && !KEPT[name]?.test(line)) found.push(`qa/${name}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], `read a copy with copiedText/copiedKinds and paste with paste/pasteCopied (qa/pasteboard.mjs): ${found.join(', ')}`)
})

test('the stand-in helpers are the only way probes reach a clipboard', () => {
  const helpers = readFileSync('qa/pasteboard.mjs', 'utf8')
  for (const name of ['copiedText', 'copiedKinds', 'copiedTypes', 'clearBoard', 'putOnBoard', 'paste', 'pasteCopied'])
    assert.match(helpers, new RegExp(`export (const|async function) ${name}\\b`), `qa/pasteboard.mjs offers ${name}`)
  assert.doesNotMatch(helpers, /\bclipboard\.(write|read)/, 'the helpers use the stand-in (globalThis.qaPasteboard), never Electron\'s clipboard')
})
