import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A fixed-size round thing (a dot, a round button) never gets squeezed into an oval in a tight row: every class list
// with `rounded-full` and a `size-*` also says `shrink-0` (or `flex-none`). The whole-pixel snap for small dots is in
// main.css (`.rounded-full:is(.size-1, …)`).
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') ? [path] : []
})

test('every fixed-size round element keeps its shape in a row', () => {
  const bad: string[] = []
  for (const file of walk(join(import.meta.dirname, '..', 'src/renderer/src'))) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(["'])([^"'\n]*?\brounded-full\b[^"'\n]*?)\1/g)) {
      const classes = match[2]
      if (/(?<![\w-])size-(?:\[[^\]]+\]|[\d.]+)\b/.test(classes) && !/(?<![\w-])(shrink-0|flex-none)\b/.test(classes)) bad.push(`${file}: ${classes.slice(0, 80)}`)
    }
  }
  assert.deepEqual(bad, [])
})
