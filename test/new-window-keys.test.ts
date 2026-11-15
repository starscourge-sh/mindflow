// A menu's "Open in a new window" names the click that does it: ⌥⌘-click on every list's row, where ⌘-click alone
// picks the row (Finder's way) or, on a link, opens a new tab. A tag's page said "⌘-click" (15 Nov), which picked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((one) => (one.isDirectory() ? files(join(dir, one.name)) : /\.tsx?$/.test(one.name) ? [join(dir, one.name)] : []))

test('every "Open in a new window" that names a click names ⌥⌘-click', () => {
  const said: string[] = []
  for (const file of files('src/renderer/src')) {
    for (const found of readFileSync(file, 'utf8').matchAll(/label: 'Open in a new window', keys: '([^']+)'/g)) {
      if (/click/.test(found[1])) said.push(`${file.replace(/^src\/renderer\/src\//, '')}: ${found[1]}`)
    }
  }
  assert.ok(said.length >= 4, `found only ${said.length}`)
  assert.deepEqual(said.filter((one) => !one.endsWith(': ⌥⌘-click')), [])
})
