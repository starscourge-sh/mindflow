// Run with: node --test test/faded-words.test.ts
// Quiet words wear Faded Ink (`text-muted-foreground`) or its strong step, never an alpha on the ink or on Faded Ink:
// `text-foreground/70` is 3.9:1 on Paper's page and 3.4:1 on a picked row, `text-muted-foreground/60` 2.6:1, under the
// 4.5:1 small words need (DESIGN.md "Don't"; qa/faded-words.mjs measures them in the app). Nor an alpha on another ink
// (`text-primary-foreground/80` on a button, `text-white/90` over a picture), nor see-through (`opacity-70` on a key
// hint, a count, a tooltip's second line, a row): a word's quietness is an ink, and on a fill the fill's own ink. An
// alpha or see-through stays only where there are no words: an icon or a drawing, a lone dot or arrow between words, a
// control while it is disabled, and the pictures of the app drawn in the "/" menu's peek and the powers' demos (DESIGN.md,
// The Preview Miniature Rule).
// What these checks read: class names written on an element in the .tsx files, with what the element holds on its own
// line or the next. What they cannot see: see-through set in CSS files, in an inline `style={{ opacity }}`, by a motion
// `animate` value, or in a class kept in a variable away from its element; qa/faded-words.mjs measures those as drawn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})
const PICTURES = new Set(['slash-peek.tsx', 'power-demos.tsx'])
const INKS = 'primary|primary-foreground|background|popover-foreground|secondary-foreground|accent-foreground|card-foreground|destructive|white|black'
const FADED = new RegExp(String.raw`(?<![\w/-])(?:[\w&_[\]-]+:)*text-(?:foreground\/(?:[1-7]\d|80)|muted-foreground\/\d+|(?:${INKS})\/\d+)(?![\d/])`)
// See-through under 1, at rest or in a state (`hover:opacity-80`); a state that only takes it away (`opacity-0`) or
// brings it back (`opacity-100`) is not a fade.
const SEE_THROUGH = /(?<![\w/[-])((?:[\w&_[\]()=,>-]+:)*)opacity-([1-9]\d?)(?![\d\]%])/
/** A carried thing's place while it is carried (the carry look, carry.tsx), or a row that cannot take what is carried. */
const CARRIED = /\b(?:lift|isDragging|carry\?\.kind|drag\?\.lifted|faint)\b[^?]*\?\s*['"`][^'"`]*$/
/**
 * Where the checks cannot read the element, each with why it holds no words: a drawing put in as markup, the GIFs'
 * pictures (a button around an image), a red dot that pulses while a meeting records.
 */
const NO_WORDS: Record<string, string> = {
  'drawing-window.tsx': 'opacity-90',
  'settings-view.tsx': 'hover:opacity-85',
  'meeting-card.tsx': 'opacity-40',
}
const PICTURE_TAGS = ['svg', 'canvas', 'img', 'video', 'path', 'circle', 'rect', 'line', 'g']
/** The app's components that draw words, not icons: a count, a rolling number or word, a key and the keys of a shortcut. */
const WORD_PARTS = /^(?:Count|Rolling|Kbd|Pressed|ShortcutDisplay)$/

/** The element a class written at `start` on line `at` belongs to: its tag and its opening tag up to the class. */
function owner(lines: string[], at: number, start: number): { tag?: string; opening: string } {
  const before = [...lines.slice(Math.max(0, at - 4), at), lines[at].slice(0, start)].join('\n')
  // The last tag opened and not yet closed by a `>` outside braces, brackets and quotes before the class.
  const open = [...before.matchAll(/<([A-Za-z][\w.]*)\b/g)].pop()
  return { tag: open?.[1], opening: open ? before.slice(open.index) : lines[at].slice(0, start) }
}

/** Whether a class from `pattern`, on line `at`, is written on an element that holds words. */
function onWords(lines: string[], at: number, pattern: RegExp): boolean {
  const line = lines[at]
  const start = line.search(pattern)
  if (start < 0) return false
  // An icon or a drawing: a component (`<Icon`, `<entry.icon`) or an svg, image or canvas carries the class itself.
  const { tag } = owner(lines, at, start)
  if (tag && !WORD_PARTS.test(tag) && (/^[A-Z]|\./.test(tag) || PICTURE_TAGS.includes(tag))) return false
  // The element's own markup from the class on, with a class's brackets (`[&>svg]`) and arrows (`=>`) taken out.
  const plain = (text: string): string => text.replace(/\[[^\]]*\]/g, '[]').replace(/=>/g, '=')
  const rest = plain(line.slice(start))
  const next = plain((lines[at + 1] ?? '').trim())
  // A mark with no words: the element closes itself, on this line or the next (a dot, a bar, a swatch).
  if (!WORD_PARTS.test(tag ?? '') && /^[^<>]*\/>/.test(`${rest} ${next}`)) return false
  // What the element holds: the rest of its line after its opening tag, or its next line when that is empty.
  const after = (/>/.test(rest) ? rest.replace(/^[^>]*>/, '').trim() : '') || next
  // A lone mark between words (a dot, an arrow, a plus), or an icon of its own and no words, or a mark of its own.
  if (/^[·→+]\s*(<\/|$)/.test(after)) return false
  const part = after.match(/^<([A-Z][\w.]*)/)?.[1]
  if (!WORD_PARTS.test(part ?? '') && (/^<[A-Z][\w.]*[^>]*\/>\s*(<\/|$)/.test(after) || (/^<(?:[A-Z][\w.]*|svg|img)\b/.test(after) && !/>\s*\w/.test(after)))) return false
  if (/^<[a-z]+\b[^>]*\/>\s*(<\/|$)/.test(after) && !/>\s*\w/.test(after)) return false
  // A disabled control's look (its button says disabled={...}).
  const opening = lines.slice(Math.max(0, at - 6), at).join('\n')
  if (/bg-muted text-muted-foreground\/\d+/.test(line) && /disabled=\{/.test(opening)) return false
  return true
}

test('no placeholder is faded with an alpha', () => {
  const found = files('src/renderer/src').flatMap((file) => readFileSync(file, 'utf8').split('\n').flatMap((line, at) => (/placeholder:text-(?:foreground|muted-foreground)\/\d/.test(line) ? [`${file}:${at + 1}`] : [])))
  assert.deepEqual(found, [], 'a placeholder wears placeholder:text-muted-foreground')
})

test('words are never faded with an alpha', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src')) {
    if (PICTURES.has(file.split('/').pop()!)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((_, at) => onWords(lines, at, FADED) && found.push(`${file}:${at + 1}`))
  }
  assert.deepEqual(found, [], 'quiet words wear text-muted-foreground or text-(--mf-muted-strong); on a fill, its own ink')
})

test('words are never faded by see-through', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src')) {
    if (PICTURES.has(file.split('/').pop()!)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    const name = file.split('/').pop()!
    lines.forEach((line, at) => {
      // Class names only: a line that gives an element its classes.
      if (!/className|class=|\bcn\(/.test(line)) return
      const hit = line.match(SEE_THROUGH)
      if (!hit || NO_WORDS[name] === hit[0]) return
      // A disabled control's own look; a state of icons or pictures inside (`[&_svg]:opacity-60`); a carried thing's place
      // while it is carried, or a folder that cannot take it.
      if (/disabled|svg|img|folder-no/.test(hit[1]) || CARRIED.test(line.slice(0, hit.index))) return
      const { opening } = owner(lines, at, hit.index!)
      // A control while it is disabled (disabled, aria-disabled, inert), and a picture of the app: a setting's sample
      // (`data-preview`), or a part drawn for the eye alone (aria-hidden and out of the pointer's reach).
      if (/\b(?:inert|aria-disabled|disabled)\b(?![:-])|data-(?:dim-)?preview/.test(opening) || (/aria-hidden/.test(opening) && /pointer-events-none/.test(line))) return
      if (onWords(lines, at, SEE_THROUGH)) found.push(`${file}:${at + 1} ${hit[0]}`)
    })
  }
  assert.deepEqual(found, [], 'a quiet word wears an ink, never opacity: Faded Ink, its strong step, or on a fill the fill\'s own ink')
})
