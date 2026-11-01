// Run with: node --test test/no-grey-bars.test.ts
// A real wait is shown one way: the orb and its shimmering words (orb.tsx, .mf-shimmer). Never grey placeholder bars
// (a list of widths drawn as faint rounded strips), which the user has turned down again and again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : []
})
// Pictures of a page in an illustration, not waits.
const ILLUSTRATIONS = new Set(['welcome-day.tsx', 'power-demos.tsx', 'settings-show.tsx'])

test('no grey placeholder bars stand in for a wait', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src')) {
    if (ILLUSTRATIONS.has(file.split('/').pop()!)) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, at) => {
      if (/\[\s*0?\.\d+\s*,\s*0?\.\d+[^\]]*\]\.map|\['\d+%',\s*'\d+%'/.test(line) && /bg-(foreground|muted)/.test(line + (readFileSync(file, 'utf8').split('\n')[at + 2] ?? ''))) found.push(`${file}:${at + 1}`)
      if (/animate-pulse/.test(line) && /rounded(-md|-sm|-lg)? [^"]*bg-(foreground|muted)/.test(line) && !/size-[12]/.test(line)) found.push(`${file}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], `use <Orb label="…" /> for a wait: ${found.join(', ')}`)
})
