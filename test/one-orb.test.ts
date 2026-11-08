// Run with: node --test test/one-orb.test.ts
// Every wait wears the one orb as the source page's "Looking up Mary Shelley…" does. The user asked never to see the
// dotted "searching" orb again (8 Nov 2026), so no renderer file may ask for it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})

test('no wait uses the dotted searching orb', () => {
  const found = files(join(root, 'src/renderer/src')).filter((file) => /<Orb\b[^>]*state=["{']?["']?searching/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file))
  assert.deepEqual(found, [], `Use <Orb label="…" /> (the source page's loader):\n${found.join('\n')}`)
})
