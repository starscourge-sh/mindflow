// Run with: node --test test/menu-icons.test.ts
// Every menu line the app can show gets a drawing: a line whose words no rule knows falls back to a quiet dot,
// which the user has called out again and again ("why are there still places missing icons?").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Dot } from 'lucide-react'
import { menuIcon } from '../src/renderer/src/components/ui/menu-icon-rules.ts'

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})

test('every menu line has a drawing, never the fallback dot', () => {
  const missing = new Set<string>()
  for (const file of files('src/renderer/src')) {
    const text = readFileSync(file, 'utf8')
    // A menu line: { label: '…', … run: … } or { id: …, label: '…' } in a RowMenu / OptionsMenu list.
    // Its label may be a plain string or a choice between strings (a ? 'Stop putting it first' : 'Put it first').
    for (const m of text.matchAll(/\{\s*(?:id:\s*['"][^'"]+['"],\s*)?label:\s*([^,]+?),[^{}]*\brun:/g)) {
      if (m[0].includes('icon:')) continue
      for (const said of m[1].matchAll(/'([^'`$]+)'|"([^"`$]+)"/g)) {
        const label = said[1] ?? said[2]
        // A menu line starts with a capital; a lower-case piece is part of a sum of words, not a line.
        if (/^[A-Z]/.test(label) && menuIcon(label) === Dot) missing.add(`${label}  (${file})`)
      }
    }
  }
  assert.deepEqual([...missing], [], `give these menu lines a rule in menu-icon.tsx:\n${[...missing].join('\n')}`)
})
