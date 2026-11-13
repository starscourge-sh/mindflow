// Run with: node --test test/sticky-menu-icons.test.ts
// A sticky's right-click menu is written in main (src/main/index.ts, drawn by windows/menu.tsx), out of reach of
// test/menu-icons.test.ts: every one of its lines ({ label: '…', … run: … }) gets a drawing too, never the dot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Dot } from 'lucide-react'
import { menuIcon } from '../src/renderer/src/components/ui/menu-icon-rules.ts'

test("every line of a sticky's own menu has a drawing", () => {
  const text = readFileSync('src/main/index.ts', 'utf8')
  const said = [...text.matchAll(/\{\s*label:\s*'([A-Z][^']*)',[^{}]*\brun:/g)].map((m) => m[1])
  for (const label of ['Cut', 'Copy', 'Paste', 'Take it down', 'Tidy stickies down the right edge', 'Put stickies back where they were', 'Fold every card into its pill', 'Open the cards it folded', 'Keep open'])
    assert.ok(said.includes(label), `the sticky menu no longer says "${label}": update this test`)
  // Its "Open in Haligtree" is written with the app's name.
  const missing = [...said, 'Open in Haligtree'].filter((label) => menuIcon(label) === Dot)
  assert.deepEqual(missing, [], `give these menu lines a rule in menu-icon-rules.ts:\n${missing.join('\n')}`)
})
