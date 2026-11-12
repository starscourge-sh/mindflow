// Run with: node --test test/reader-free.test.ts
// The reading thread (src/main/reader-worker.ts) reads the book off main's one thread: search, link offers, Home,
// the Feed, mentions, the tags, the Map. A thread has no Electron: one `import … from 'electron'` anywhere in what
// it loads and it stops as it starts, and everything is answered on main again, where it holds every key and click.
// So every file the thread loads, followed import by import, is free of Electron (a type alone is fine: it is gone
// once built).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const START = 'src/main/reader-worker.ts'
/** Every `from '…'` of a file that is still there once built: `import type` lines are not. */
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^'"\n]*?from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm)].map((found) => found[1] ?? found[2])

test('nothing the reading thread loads imports Electron', () => {
  const seen = new Map<string, string>()
  const walk = (file: string, from: string): void => {
    if (seen.has(file)) return
    seen.set(file, from)
    for (const name of importsOf(file)) {
      assert.notEqual(name, 'electron', `${file} imports Electron, and the reading thread loads it (by way of ${[...chain(file)].join(' < ')})`)
      if (!name.startsWith('.')) continue
      const base = join(dirname(file), name)
      const found = [`${base}.ts`, `${base}/index.ts`, base].find((path) => existsSync(path) && path.endsWith('.ts'))
      if (found) walk(found, file)
    }
  }
  function* chain(file: string): Generator<string> {
    for (let at: string | undefined = file; at; at = seen.get(at) || undefined) yield at
  }
  walk(START, '')
  // The files this was written for are among them: if they are not, the walk has stopped following imports.
  for (const one of ['reader-jobs', 'book-find', 'book-offers', 'book-home', 'book-feed', 'book-repeats', 'book-mentions', 'book-tags', 'book-map', 'word-count', 'card-words', 'links-in'])
    assert.ok(seen.has(`src/main/${one}.ts`), `src/main/${one}.ts is not among the ${seen.size} files the reading thread loads`)
})
