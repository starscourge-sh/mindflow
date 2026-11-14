// Run with: node --test test/faded-words.test.ts
// Quiet words wear Faded Ink (`text-muted-foreground`) or its strong step, never an alpha on the ink or on Faded Ink:
// `text-foreground/70` is 3.9:1 on Paper's page and 3.4:1 on a picked row, `text-muted-foreground/60` 2.6:1, under the
// 4.5:1 small words need (DESIGN.md "Don't"; qa/faded-words.mjs measures them in the app). An alpha stays only where
// there are no words: an icon or a drawing, a lone dot or arrow between words, a control while it is disabled, and the
// pictures of the app drawn in the "/" menu's peek and the powers' demos (DESIGN.md, The Preview Miniature Rule).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})
const PICTURES = new Set(['slash-peek.tsx', 'power-demos.tsx'])
const FADED = /(?<![\w/-])(?:[\w&_[\]-]+:)*text-(?:foreground\/(?:[1-6]\d|7[0-5])|muted-foreground\/\d+)(?![\d/])/

test('no placeholder is faded with an alpha', () => {
  const found = files('src/renderer/src').flatMap((file) => readFileSync(file, 'utf8').split('\n').flatMap((line, at) => (/placeholder:text-(?:foreground|muted-foreground)\/\d/.test(line) ? [`${file}:${at + 1}`] : [])))
  assert.deepEqual(found, [], 'a placeholder wears placeholder:text-muted-foreground')
})

test('words are never faded with an alpha', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src')) {
    if (PICTURES.has(file.split('/').pop()!)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, at) => {
      if (!FADED.test(line)) return
      // An icon or a drawing: a component or an svg or canvas carries the class itself.
      const tag = line.slice(0, line.search(FADED)).match(/<([A-Za-z]\w*)[^<]*$/)?.[1]
      if (tag && (/^[A-Z]/.test(tag) || tag === 'svg' || tag === 'canvas')) return
      // What the element holds: the rest of its line after its opening tag, or its next line when that is empty.
      const after = line.slice(line.search(FADED)).replace(/^[^>]*>/, '').trim() || (lines[at + 1] ?? '').trim()
      // A lone mark between words (a dot, an arrow, a plus), or an icon of its own and no words.
      if (/^[·→+]\s*(<\/|$)/.test(after)) return
      if (/^<[A-Z]\w*[^>]*\/>\s*(<\/|$)/.test(after) || (/^<(?:[A-Z]\w*|svg)\b/.test(after) && !/>\s*\w/.test(after))) return
      // A disabled control's look (its button says disabled={...}).
      if (/bg-muted text-muted-foreground\/\d+/.test(line) && /disabled=\{/.test(lines.slice(Math.max(0, at - 6), at).join('\n'))) return
      found.push(`${file}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], 'quiet words wear text-muted-foreground or text-(--mf-muted-strong)')
})
