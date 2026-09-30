/**
 * Every theme, checked for the things that make one unreadable.
 *
 * A palette can only really be judged by eye, but the failures that matter are
 * arithmetic: body text that does not stand off the page, a heading or an
 * accent that disappears into it, a caret nobody can find. Those are what this
 * measures, for all sixteen, so a new one cannot ship broken.
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
  const read = await page.evaluate((name) => {
    const root = document.documentElement
    for (const other of root.className.split(/\s+/)) {
      if (other !== 'dark') root.classList.remove(other)
    }
    root.classList.add('dark')
    if (name !== 'dark') root.classList.add(name)

    const editor = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
    const body = editor.querySelector('p')
    const heading = editor.querySelector('h1')
    const style = getComputedStyle(root)
    const page = getComputedStyle(document.querySelector('.app-container')).backgroundColor
    return {
      page,
      body: getComputedStyle(body).color,
      heading: getComputedStyle(heading).color,
      caret: style.getPropertyValue('--tt-cursor-color').trim(),
      accent: style.getPropertyValue('--mf-accent-ink').trim(),
      chrome: style.getPropertyValue('--muted-foreground').trim()
    }
  }, theme)

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

  const caret = await resolve(read.caret)
  const accent = await resolve(read.accent)
  const chrome = await resolve(read.chrome)

  rows.push({
    theme,
    body: ratio(read.body, read.page),
    heading: ratio(read.heading, read.page),
    accent: ratio(accent, read.page),
    caret: ratio(caret, read.page),
    chrome: ratio(chrome, read.page)
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
