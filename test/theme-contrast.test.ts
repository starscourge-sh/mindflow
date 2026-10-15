// Run with: node --test test/theme-contrast.test.ts
// Every theme's nine text colours (grey for quiet titles and tags, orange for
// today, red for late, and the rest) are read as words, often at body size, so
// each must reach 4.5:1 against its own page (WCAG AA for normal text). Paper
// stays lower contrast on purpose, but not below that line. This reads the
// theme table in _variables.scss, and the default dark theme's own colours.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const file = readFileSync(join(import.meta.dirname, '../src/renderer/src/assets/styles/_variables.scss'), 'utf8')
const HUES = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

type RGB = [number, number, number]
const hex = (value: string): RGB => {
  const h = value.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB
}
const hsl = (value: string): RGB => {
  const [h, s, l] = value.match(/[\d.]+/g)!.map(Number)
  const S = s / 100, L = l / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number): number => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)) as RGB
}
const colour = (value: string): RGB => (value.trim().startsWith('#') ? hex(value.trim()) : hsl(value))
const luminance = (rgb: RGB): number => {
  const [r, g, b] = rgb.map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Each theme in the table: its page and its nine hues. */
function themes(): { name: string; bg: RGB; hues: Record<string, string> }[] {
  const table = file.slice(file.indexOf('$mf-themes: ('), file.indexOf(');', file.indexOf('$mf-themes: (')))
  const out: { name: string; bg: RGB; hues: Record<string, string> }[] = []
  for (const [, name, body] of table.matchAll(/"([a-z-]+)": \(([^)]*)\)/g)) {
    const pairs = Object.fromEntries([...body.matchAll(/"([a-z]+)": (#[0-9a-fA-F]{3,6})/g)].map(([, k, v]) => [k, v]))
    out.push({ name, bg: hex(pairs.bg), hues: Object.fromEntries(HUES.map((hue) => [hue, pairs[hue]])) })
  }
  // The default dark theme is written out in its own .dark block; its page is the swatch's.
  const dark = file.slice(file.indexOf('.dark {', file.indexOf('/* Text colors */')))
  const darkHues = Object.fromEntries(HUES.map((hue) => [hue, dark.match(new RegExp(`--tt-color-text-${hue}: (hsl\\([^)]*\\))`))![1]]))
  const darkBg = file.match(/\.mf-swatch-dark \{\s*--sw-bg: rgb\((\d+) (\d+) (\d+)\)/)!.slice(1).map(Number) as RGB
  out.push({ name: 'dark', bg: darkBg, hues: darkHues })
  return out
}

test('the theme table is read whole', () => {
  const all = themes()
  assert.ok(all.length >= 14, `${all.length} themes`)
  for (const one of all) for (const hue of HUES) assert.ok(one.hues[hue], `${one.name} has ${hue}`)
})

test('every theme colour used for words reaches 4.5:1 on its own page', () => {
  const failing = themes().flatMap((one) => HUES.map((hue) => ({ name: one.name, hue, ratio: contrast(colour(one.hues[hue]), one.bg) })).filter((one) => one.ratio < 4.5))
  assert.deepEqual(failing.map((one) => `${one.name} ${one.hue} ${one.ratio.toFixed(2)}:1`), [])
})
