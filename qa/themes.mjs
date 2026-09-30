/**
 * Every theme, checked for the things that make one unreadable.
 *
 * A palette can only really be judged by eye, but the failures that matter are
 * arithmetic: body text that does not stand off the page, a heading or an
 * accent that disappears into it, a caret nobody can find. Those are what this
 * measures, for every one of them, so a new theme cannot ship broken.
 */
import { readFileSync } from 'node:fs'

import { open } from './harness.mjs'

/** The themes, read from the source, so this cannot miss a new one. */
const list = [...readFileSync('src/renderer/src/lib/theme.ts', 'utf8')
  .match(/export const THEMES = \[([\s\S]*?)\]/)[1]
  .matchAll(/"([a-z-]+)"/g)].map((m) => m[1])

/** WCAG relative luminance, from a computed `rgb(...)`. */
const luminance = (css) => {
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number)
  const channel = (value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const app = await open()
const { page } = app

await app.reset()
await app.type(['# A heading', 'Body text with `code` in it.', '- a bullet'])

const rows = []
for (const theme of list) {
  await page.evaluate((name) => {
    const root = document.documentElement
    for (const other of root.className.split(/\s+/)) {
      if (other !== 'dark') root.classList.remove(other)
    }
    root.classList.add('dark')
    if (name !== 'dark') root.classList.add(name)
  }, theme)
  // A repaint between the swap and the reading. Asked for in the same tick,
  // the container still answers with the colours it was already wearing.
  await page.waitForTimeout(120)

  const read = await page.evaluate(() => {
    const root = document.documentElement
    const editor = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
    const body = editor.querySelector('p')
    const heading = editor.querySelector('h1')
    const style = getComputedStyle(root)
    // The theme's page colour, not the container's computed background: the
    // window paints that at 20% over the desktop, and a ratio against a
    // translucent wash measures the desktop as much as the theme.
    return {
      page: style.getPropertyValue('--black').trim(),
      body: getComputedStyle(body).color,
      heading: getComputedStyle(heading).color,
      caret: style.getPropertyValue('--tt-cursor-color').trim(),
      accent: style.getPropertyValue('--mf-accent-ink').trim(),
      chrome: style.getPropertyValue('--muted-foreground').trim()
    }
  })

  // A swatch is a hex or an rgb; normalise by painting it and reading it back.
  const resolve = (value) =>
    page.evaluate((v) => {
      const probe = document.createElement('span')
      probe.style.color = v
      document.body.append(probe)
      const out = getComputedStyle(probe).color
      probe.remove()
      return out
    }, value)

  const paper = await resolve(read.page)
  const caret = await resolve(read.caret)
  const accent = await resolve(read.accent)
  const chrome = await resolve(read.chrome)

  rows.push({
    theme,
    body: ratio(read.body, paper),
    heading: ratio(read.heading, paper),
    accent: ratio(accent, paper),
    caret: ratio(caret, paper),
    chrome: ratio(chrome, paper)
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`${pad('theme', 17)}${['body', 'head', 'accent', 'caret', 'chrome'].map((h) => pad(h, 8)).join('')}`)
for (const row of rows) {
  const mark = (v, floor) => `${v.toFixed(1)}${v < floor ? '!' : ' '}`
  console.log(
    pad(row.theme, 17) +
      pad(mark(row.body, 7), 8) +
      pad(mark(row.heading, 4.5), 8) +
      pad(mark(row.accent, 4.5), 8) +
      pad(mark(row.caret, 3), 8) +
      pad(mark(row.chrome, 4.5), 8)
  )
}
console.log('\n! = below the floor for that role (body 7, heading/accent/chrome 4.5, caret 3)')

await app.close()
process.exit(0)
