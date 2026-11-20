// Run with: node --test test/num-format.test.ts
// Every count a person reads goes through num() or plural() in src/main/dates.ts,
// so 1,204 never shows as 1204 and "1 notes" never happens. This scans every
// template string for a count put in raw (`${list.length}`, `${count}`,
// `${total}`) and for a plural made by hand (`=== 1 ? 'note' : 'notes'`).
// A line that is not shown to people (a key, an id, a width, a log line) or a
// count that can never pass 999 goes in ALLOWED below with its reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/** A file and a piece of the line, and why its count is left as it is. */
const ALLOWED: [file: string, bit: string, why: string][] = [
  ['src/renderer/src/components/note-link/note-embed-view.tsx', 'embed-${link}-${around.length}', 'an id'],
  ['src/renderer/src/components/haligtree/talk.tsx', '${session.levels.length}', 'a change key for a store'],
  ['src/renderer/src/components/haligtree/calendar-view.tsx', 'repeat(${days.length}', 'a CSS grid column count'],
  ['src/renderer/src/components/capture-kinds/capture-kind-picker.tsx', '${CAPTURE_TYPES.length}', 'a key range, ⌘1-9: never past 9'],
  ['src/renderer/src/lib/people.ts', '${used.size}', 'part of an id made from initials'],
  ['src/main/freeze-catch.ts', '${all.length} lines', 'a log line for us, not shown in the app'],
  ['src/main/study-ai.ts', 'Make exactly $', 'words to Apple Intelligence, never shown in the app'],
  ['src/main/celebrate.ts', '${facts.size}', 'a cache key from a file size'],
  ['src/main/book-words.ts', '${raw.length}', 'a key for finding the same capture twice'],
  ['src/main/scenery.ts', '${facts.size}', 'a cache key from a file size'],
  ['src/main/frost.ts', '${file.size}', 'a cache key from a file size'],
  ['src/main/index.ts', '"${stored.size}"', 'a byte count kept in a link title, read back by code'],
  ['src/renderer/src/components/haligtree/calendar-view.tsx', 'span ${days.length}', 'a CSS grid span'],
  ['src/renderer/src/components/haligtree/display.tsx', 'repeat(${views.length}', 'a CSS grid column count'],
  ['src/renderer/src/components/haligtree/study-stats.tsx', 'repeat(${days.length}', 'a CSS grid column count'],
  ['src/renderer/src/components/haligtree/study-stats.tsx', '${total} this year', 'total is already a plural()'],
  ['src/renderer/src/components/haligtree/media-view.tsx', 'data-size="${one.size}"', 'a byte count kept in an attribute, read back by code'],
  ['src/renderer/src/components/haligtree/note-extras.tsx', '${id}-${list.length}', 'a key'],
  ['src/renderer/src/components/haligtree/review-area.tsx', 'only:${only.length}', 'a key'],
  ['src/renderer/src/components/pdf/pdf-rail.tsx', '${folded.size}', 'a change key'],
  ['src/renderer/src/components/haligtree/tour.tsx', 'of ${stops.length}', 'the tour has a handful of stops'],
  ['src/renderer/src/components/haligtree/welcome.tsx', 'of ${CHAPTERS.length}', 'welcome has a handful of chapters'],
  ['src/renderer/src/lib/blanks.ts', '${total} minus', 'a figure quoted from the card, said as it was written'],
  ['src/main/index.ts', 'imported ${made.length} new', 'a terminal line for a quiet import, not shown in the app'],
  ['src/main/old-data.ts', 'Old data: ${found.length}', 'a log line, not shown in the app'],
  ['src/renderer/src/components/haligtree/getting-started.tsx', 'of {STEPS.length}', 'a handful of first steps'],
  ['src/renderer/src/components/haligtree/settings-view.tsx', '{text.length} of 160', 'a bio is at most 160 letters'],
  ['src/renderer/src/components/haligtree/power-demos.tsx', '{group.tasks.length}', 'a demo with its own few made-up tasks'],
  ['src/renderer/src/components/haligtree/usage-stats.tsx', '<N>{SECTIONS.length}</N>', 'N says a number through num()'],
  ['src/renderer/src/components/haligtree/stats-view.tsx', '<N>{opened.size}</N>', 'N says a number through num()'],
  ['src/renderer/src/components/turn-into/spelling.tsx', '${here.word.length}', 'a key for what the spellchecker said of a word where it stood'],
]

/** The template strings in a line of code, comments left out. */
const templates = (line: string): string[] => {
  const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
  return [...code.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1])
}

// A count put in raw: `${things.length}`, `${count}`, `${total}`, `${n}` (alone, not inside num(), plural(), brief()).
const RAW = /\$\{\s*(?:[\w$.?!]+\.(?:length|size)|[\w$.?!]*\b(?:count|total)\b)\s*\}/i
const HAND_PLURAL = /\b[\w$.]+\s*(?:===|!==)\s*1\s*\?\s*(['"])(\w*)\1\s*:\s*(['"])(\w*)\3/
// A count and its word chosen by hand: `${n} ${n === 1 ? 'note' : 'notes'}`.
const HAND_WORD = /\$\{(?:num\()?([\w$.?!]+)\)?\} \$\{\1 === 1 \?/
// In JSX, a count shown as it is: `<span>{list.length}</span>`, `{n} {n === 1 ? 'note' : 'notes'}` (an attribute, `={list.length}`, is not shown).
const JSX_RAW = /(?:^|[^=\w$])\{\s*[\w$.?!]+\.(?:length|size)\s*\}|\{([\w$.?!]+)\} \{\1 === 1 \?/

test('every count a person reads goes through num() or plural()', () => {
  const found: string[] = []
  const used = new Set<string>()
  for (const path of [...files(join(root, 'src/renderer/src')), ...files(join(root, 'src/main'))]) {
    const file = relative(root, path)
    if (file === 'src/main/dates.ts') continue
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      for (const text of templates(line)) {
        const raw = text.match(RAW)
        const hand = text.match(HAND_PLURAL)
        // A hand-made "s": `note${n === 1 ? '' : 's'}`.
        const ending = hand && ((hand[2] === '' && hand[4] === 's') || (hand[2] === 's' && hand[4] === ''))
        if (!raw && !ending && !HAND_WORD.test(text)) continue
        const allowed = ALLOWED.find(([f, bit]) => f === file && text.includes(bit))
        if (allowed) { used.add(`${allowed[0]}|${allowed[1]}`); continue }
        found.push(`${file}:${i + 1}  ${text.trim().slice(0, 90)}`)
      }
      if (!file.endsWith('.tsx') || /^\s*(\/\/|\*|\/\*)/.test(line)) return
      const jsx = line.replace(/`(?:[^`\\]|\\.)*`/g, '``')
      if (!JSX_RAW.test(jsx)) return
      const allowed = ALLOWED.find(([f, bit]) => f === file && jsx.includes(bit))
      if (allowed) { used.add(`${allowed[0]}|${allowed[1]}`); return }
      found.push(`${file}:${i + 1}  ${jsx.trim().slice(0, 90)}`)
    })
  }
  assert.deepEqual(found, [], `Put these counts through num() or plural() from src/main/dates.ts, or add them to ALLOWED with the reason:\n${found.join('\n')}`)
  const stale = ALLOWED.filter(([f, bit]) => !used.has(`${f}|${bit}`)).map(([f, bit]) => `${f}  ${bit}`)
  assert.deepEqual(stale, [], `These ALLOWED lines no longer match anything; take them out:\n${stale.join('\n')}`)
})
