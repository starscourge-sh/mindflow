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

// The quiet ink: Faded Ink (--muted-foreground, the 700 step: ink 74% into the page, more where a theme says so in
// main.css) is every quiet word's colour, notes and the PDF reader included (--mf-muted is it). Read at 12 and 13px on
// the page, on a card or a menu (ink 9% into the page) and on a hovered or picked row or a keycap (16%), it reaches
// 4.5:1 on all three in every theme.
test('the quiet ink reaches 4.5:1 on the page, a card and a picked row in every theme', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/renderer/src/assets/main.css'), 'utf8')
  assert.match(css, /--mf-muted: var\(--muted-foreground\);/, '--mf-muted is Faded Ink')
  const own = Object.fromEntries([...css.matchAll(/^:root\.([a-z-]+) \{ --muted-foreground: color-mix\(in srgb, var\(--foreground\) (\d+)%, var\(--background\)\); \}/gm)].map(([, name, share]) => [name, Number(share) / 100]))
  assert.ok(own.paper, 'Paper sets its own')
  const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v * t + b[i] * (1 - t)) as RGB
  const table = file.slice(file.indexOf('$mf-themes: ('), file.indexOf(');', file.indexOf('$mf-themes: (')))
  const all = [...table.matchAll(/"([a-z-]+)": \(([^)]*)\)/g)].map(([, name, body]) => {
    const [bg, ink] = ['bg', 'ink'].map((key) => hex(body.match(new RegExp(`"${key}": (#[0-9a-fA-F]{6})`))![1]))
    return { name, quiet: mix(ink, bg, own[name] ?? 0.74), page: bg, card: mix(ink, bg, 0.09), row: mix(ink, bg, 0.16) }
  })
  all.push({ name: 'dark', quiet: [192, 192, 195], page: [14, 14, 17], card: [32, 32, 34], row: [45, 45, 47] })
  assert.ok(all.length >= 14, `${all.length} themes`)
  const failing = all.flatMap((one) => (['page', 'card', 'row'] as const).map((on) => ({ ...one, on, ratio: contrast(one.quiet, one[on]) })).filter((one) => one.ratio < 4.5))
  assert.deepEqual(failing.map((one) => `${one.name} on its ${one.on} ${one.ratio.toFixed(2)}:1`), [])
})

// color-mix(in oklab, a t, b): the mix the browser makes, through OKLab and back to sRGB.
const lin = (c: number): number => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const toLab = (rgb: RGB): RGB => {
  const [r, g, b] = rgb.map(lin)
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const fromLab = ([L, a, b]: RGB): RGB => {
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3)
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((c) => 255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))) as RGB
}
const srgb = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v * t + b[i] * (1 - t)) as RGB
const oklab = (a: RGB, b: RGB, t: number): RGB => fromLab(srgb(toLab(a), toLab(b), t))
const css = readFileSync(join(import.meta.dirname, '../src/renderer/src/assets/main.css'), 'utf8')
/** Each table theme's page, ink, accent, hues and its quiet and strong quiet inks, as main.css makes them. */
function inks(): { name: string; page: RGB; ink: RGB; accent: RGB; hues: Record<string, RGB>; quiet: RGB; strong: RGB; card: RGB }[] {
  const own = Object.fromEntries([...css.matchAll(/^:root\.([a-z-]+) \{ --muted-foreground: color-mix\(in srgb, var\(--foreground\) (\d+)%, var\(--background\)\); \}/gm)].map(([, name, share]) => [name, Number(share) / 100]))
  const table = file.slice(file.indexOf('$mf-themes: ('), file.indexOf(');', file.indexOf('$mf-themes: (')))
  return [...table.matchAll(/"([a-z-]+)": \(([^)]*)\)/g)].map(([, name, body]) => {
    const get = (key: string): RGB => hex(body.match(new RegExp(`"${key}": (#[0-9a-fA-F]{6})`))![1])
    const [page, ink] = [get('bg'), get('ink')]
    const quiet = srgb(ink, page, own[name] ?? 0.74)
    return { name, page, ink, accent: get('accent'), hues: Object.fromEntries(HUES.map((hue) => [hue, get(hue)])), quiet, strong: srgb(quiet, ink, 0.5), card: srgb(ink, page, 0.09) }
  })
}

// Brutal keeps its bold wash under a row pointed at, open or chosen (the accent 22% into the card, brutal.css), where
// Faded Ink reads 3.6:1 to 4.3:1; there quiet words step up to the strong quiet ink, which must reach 4.5:1 on it.
test('the strong quiet ink reaches 4.5:1 on Brutal\'s accent wash in every theme', () => {
  assert.match(readFileSync(join(import.meta.dirname, '../src/renderer/src/assets/brutal.css'), 'utf8'), /--accent: color-mix\(in oklab, var\(--primary\) 22%, var\(--card\)\);/, 'the wash is the accent at 22%')
  const all = inks().map((one) => ({ ...one, wash: oklab(one.accent, one.card, 0.22) }))
  all.push({ name: 'dark', strong: srgb([192, 192, 195], [245, 245, 245], 0.5), wash: oklab(hex('#c23600'), [32, 32, 34], 0.22) } as (typeof all)[number])
  const failing = all.map((one) => ({ name: one.name, ratio: contrast(one.strong, one.wash) })).filter((one) => one.ratio < 4.5)
  assert.deepEqual(failing.map((one) => `${one.name} ${one.ratio.toFixed(2)}:1`), [])
})

// A capture or an event on the Calendar is a soft fill of its colour with words of its colour mixed into the ink
// (calendar-events.tsx tint(), --cal-fill and --cal-ink): every hue's words reach 4.5:1 on its own fill.
test('the calendar\'s pill words reach 4.5:1 on their fill in every theme and hue', () => {
  const share = (rule: RegExp, name: string): number => Number(css.match(rule)?.[1] ?? NaN) / 100
  const light = new Set(['light', 'paper'])
  const failing = inks().flatMap((one) => {
    const lit = light.has(one.name)
    const own = css.match(new RegExp(`^:root\\.${one.name} \\{ --cal-ink: (\\d+)%; \\}`, 'm'))
    const ink = own ? Number(own[1]) / 100 : lit ? share(/^:root \{ --cal-fill: \d+%; --cal-ink: (\d+)%/m, one.name) : share(/^:root:not\(\.light, \.paper, \[data-light\]\) \{ --cal-fill: \d+%; --cal-ink: (\d+)%/m, one.name)
    const fill = lit ? share(/^:root \{ --cal-fill: (\d+)%/m, one.name) : share(/^:root:not\(\.light, \.paper, \[data-light\]\) \{ --cal-fill: (\d+)%/m, one.name)
    assert.ok(ink > 0 && fill > 0, `${one.name} reads its recipe`)
    return HUES.map((hue) => ({ name: `${one.name} ${hue}`, ratio: contrast(oklab(one.hues[hue], one.ink, ink), oklab(one.hues[hue], one.page, fill)) })).filter((one) => one.ratio < 4.5)
  })
  assert.deepEqual(failing.map((one) => `${one.name} ${one.ratio.toFixed(2)}:1`), [])
})

test('every theme colour used for words reaches 4.5:1 on its own page', () => {
  const failing = themes().flatMap((one) => HUES.map((hue) => ({ name: one.name, hue, ratio: contrast(colour(one.hues[hue]), one.bg) })).filter((one) => one.ratio < 4.5))
  assert.deepEqual(failing.map((one) => `${one.name} ${one.hue} ${one.ratio.toFixed(2)}:1`), [])
})
