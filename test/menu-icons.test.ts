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

// The menus drawn line by line (a ticked choice, a switch): <DropdownMenuRadioItem>Paper pages</…>, or a list of
// { id, label } choices mapped into them, kept beside the menu or in a file of its folder it imports (the PDF
// reader's Pages menu). Missed once: their lines have no `run:`, so the test above never saw them.
const MENU_LINE = /<(?:Dropdown|Context)Menu(?:Radio|Checkbox|Sub)?(?:Item|Trigger)\b(?:[^>]|=>)*>\s*([A-Z][^<{]*)/g
const CHOICE = /\{\s*id:\s*['"][^'"]+['"],\s*label:\s*(?:'([A-Z][^']*)'|"([A-Z][^"]*)")/g
test('every menu line drawn by hand, and every choice listed for one, has a drawing', () => {
  const missing = new Set<string>()
  for (const file of files('src/renderer/src')) {
    const text = readFileSync(file, 'utf8')
    if (!/Menu(?:Radio|Checkbox)Item\b/.test(text) || file.includes('/components/ui/') || file.includes('tiptap-ui-primitive')) continue
    for (const m of text.matchAll(MENU_LINE)) if (menuIcon(m[1].trim()) === Dot) missing.add(`${m[1].trim()}  (${file})`)
    // The lists mapped into its ticked lines: LOOKS.map((one) => <DropdownMenuRadioItem …>{one.label}…
    const lists = [...text.matchAll(/\b([A-Z][A-Z_]+)(?:\.filter\(.*?\))?\.map\(\(\w+\)\s*=>\s*\(?\s*<(?:Dropdown|Context)Menu(?:Radio|Checkbox)Item/g)].map((m) => m[1])
    const near = [file, ...[...text.matchAll(/from\s+['"]\.\/([\w-]+)['"]/g)].flatMap((m) => ['.ts', '.tsx'].map((end) => join(file, '..', m[1] + end)))]
    for (const list of lists) for (const one of near) {
      let source = ''
      try { source = readFileSync(one, 'utf8') } catch { continue }
      const kept = source.match(new RegExp(`const ${list}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n?\\]`))
      for (const m of kept?.[1].matchAll(CHOICE) ?? []) if (menuIcon(m[1] ?? m[2]) === Dot) missing.add(`${m[1] ?? m[2]}  (${one})`)
    }
    // A list written in place: [{ label: 'Snap to the grid', … }].map(({ label }) => <DropdownMenuCheckboxItem …
    for (const m of text.matchAll(/\[((?:[^[\]]|\[[^[\]]*\])*)\]\.map\(\([^)]*\)\s*=>\s*\(?\s*<(?:Dropdown|Context)Menu(?:Radio|Checkbox)Item/g)) {
      for (const said of m[1].matchAll(/label:\s*(?:'([A-Z][^']*)'|"([A-Z][^"]*)")/g)) if (menuIcon(said[1] ?? said[2]) === Dot) missing.add(`${said[1] ?? said[2]}  (${file})`)
    }
  }
  assert.deepEqual([...missing], [], `give these menu lines a rule in menu-icon-rules.ts:\n${[...missing].join('\n')}`)
})

// A ticked line or a switch draws its icon as a plain line does: the rules above are only seen if the line asks for them.
test('ticked menu lines and switches set their icon in front, as plain lines do', () => {
  for (const file of ['src/renderer/src/components/ui/dropdown-menu.tsx', 'src/renderer/src/components/ui/context-menu.tsx']) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/function (\w+(?:Radio|Checkbox)Item)\b([\s\S]*?)\n}\n/g)) {
      assert.ok(m[2].includes('withMenuIcon(children)'), `${m[1]} in ${file} draws its words without their icon`)
    }
  }
})
