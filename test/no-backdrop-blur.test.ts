// Run with: node --test test/no-backdrop-blur.test.ts
// A CSS backdrop blur only blurs what is inside its nearest parent that fades
// (opacity below 1), masks or filters, and Haligtree's menus fade in and its lists
// mask their edges: there the blur sees nothing and a see-through bar or menu
// shows the rows under it sharp, text over text. So no renderer file may use one,
// except the files that only run in a window with real vibrancy behind it, and
// the one frost material (main.css .mf-frost), whose every surface qa/frost.mjs
// opens to check nothing round it fades, masks, clips or filters, and the edge
// blur (main.css .mf-blur-edge), laid only over the Map's canvas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const renderer = join(root, 'src/renderer/src')

// Only windows made with `vibrancy` in src/main/index.ts: the box (App.tsx)
// and the Look window over a sticky (look-window.tsx).
// And lib/frost-guard.ts, which only reads it, to keep frost out of parents that break it.
const ALLOWED = new Set(['src/renderer/src/App.tsx', 'src/renderer/src/components/haligtree/look-window.tsx', 'src/renderer/src/lib/frost-guard.ts'])

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
    let rule = ''
    readFileSync(file, 'utf8').split('\n').forEach((line, at) => {
      if (/\{\s*$/.test(line)) rule = line
      // Turning one off is fine, and so is the frost material's own rule.
      if (BLUR.test(line) && !/backdrop-filter:\s*none/.test(line) && !(name.endsWith('main.css') && (/^\s*:root\[data-dim='veil'\][^{]*\.mf-frost[^{]*\{/.test(rule) || /^\s*\.mf-blur-edge\b/.test(line)))) found.push(`${name}:${at + 1}`)
    })
  }
  assert.deepEqual(found, [], `Backdrop blur does not draw in the main window; use an opaque surface (bg-popover, bg-background, bg-card):\n${found.join('\n')}`)
})
