// Run with: node --test test/no-grey-bars.test.ts
// A real wait is shown one way: the orb and its shimmering words (orb.tsx, .mf-shimmer). Never grey placeholder bars
// (a list of widths drawn as faint rounded strips), which the user has turned down again and again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string, kind: RegExp): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path, kind) : kind.test(name) ? [path] : []
})
// Pictures of a page in an illustration, not waits.
const ILLUSTRATIONS = new Set(['welcome-day.tsx', 'power-demos.tsx', 'settings-show.tsx'])

test('no grey placeholder bars stand in for a wait', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src', /\.tsx$/)) {
    if (ILLUSTRATIONS.has(file.split('/').pop()!)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, at) => {
      if (/\[\s*0?\.\d+\s*,\s*0?\.\d+[^\]]*\]\.map|\['\d+%',\s*'\d+%'/.test(line) && /bg-(foreground|muted)/.test(line + (lines[at + 2] ?? ''))) found.push(`${file}:${at + 1}`)
      if (/animate-pulse/.test(line) && /rounded(-md|-sm|-lg)? [^"]*bg-(foreground|muted)/.test(line) && !/size-[12]/.test(line)) found.push(`${file}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], `use <Orb label="…" /> for a wait: ${found.join(', ')}`)
})

test('no grey placeholder bars in the stylesheets either', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src', /\.(css|scss)$/)) {
    const text = readFileSync(file, 'utf8')
    // Each rule: a strip of faint grey (the text colour mixed thin, or a muted grey),
    // rounded, a set height, made to pulse or shimmer: a bar standing in for words.
    for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2]
      const grey = /background(-color)?\s*:[^;]*(color-mix\([^;]*var\(--(foreground|muted-foreground)\)[^;]*transparent|var\(--muted\)|var\(--mf-muted\))/.test(body)
      const strip = /border-radius/.test(body) && /(^|;|\s)height\s*:\s*(0?\.\d+rem|\d+(\.\d+)?px)/.test(body)
      const moving = /animation\s*:/.test(body)
      if (grey && strip && moving) found.push(`${file}: ${rule[1].trim().split('\n').pop()}`)
    }
  }
  assert.deepEqual(found, [], `use <Orb label="…" /> for a wait: ${found.join(', ')}`)
})
