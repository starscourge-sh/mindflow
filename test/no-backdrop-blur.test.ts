// Run with: node --test test/no-backdrop-blur.test.ts
// The main window and note windows are solid windows with no vibrancy, and a
// CSS backdrop blur draws nothing in them: a see-through bar or menu just shows
// the rows under it, text over text. So no renderer file may use one, except
// the files that only run in a window with real vibrancy behind it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const renderer = join(root, 'src/renderer/src')

// Only windows made with `vibrancy` in src/main/index.ts: the box (App.tsx)
// and the Look window over a sticky (look-window.tsx).
const ALLOWED = new Set(['src/renderer/src/App.tsx', 'src/renderer/src/components/vigil/look-window.tsx'])

const BLUR = /backdrop-(blur|filter|saturate)|backdropFilter/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|css|scss)$/.test(name) ? [path] : []
  })
}

test('no backdrop blur in renderer files the main window uses', () => {
  const found: string[] = []
  for (const file of files(renderer)) {
    const name = relative(root, file)
    if (ALLOWED.has(name)) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, at) => {
      // Turning one off is fine.
      if (BLUR.test(line) && !/backdrop-filter:\s*none/.test(line)) found.push(`${name}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], `Backdrop blur does not draw in the main window; use an opaque surface (bg-popover, bg-background, bg-card):\n${found.join('\n')}`)
})
