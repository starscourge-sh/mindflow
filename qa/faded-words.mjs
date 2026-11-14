// Faded words read in every look (14 Nov; the user's rule: key words are never small grey text). qa/quiet-ink.mjs holds
// the quiet ink tokens to it; this walks the pages the app's faded classes were on (the ink at 70% or 75%, Faded Ink at
// 60% or 80%, and the rest): every word drawn in a faded ink (the ink at any alpha under 1, Faded Ink at any alpha, its
// strong step), placeholders included, on the ground it really sits on, reaches 4.5:1, or 3:1 when large (24px, or
// 18.66px and bold). Each page in Paper, Light, Dark, Everforest and Tokyo Night, in the Soft, Paper and Brutal styles.
// Left out, as not words: icons and drawings (no words of their own), a lone dot or arrow between words, disabled
// controls, and anything faded out to nothing (a grip that shows on hover).
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/faded-words.mjs
// QA_PART=1|2|3 walks a third of the pages (each part about two minutes), QA_PAGES=home,today the pages named; QA_TABLE=<file> writes every word measured as a
// line of JSON; QA_SHOTS=<dir> takes each page in Paper and Dark.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const THEMES = ['paper', 'light', 'dark', 'everforest', 'tokyonight']
const STYLES = ['soft', 'paper', 'brutal']
const PAGES = [
  ['home', 'today', 'calendar', 'monthpage', 'weekpage', 'review', 'goals'],
  ['inbox', 'articles', 'settings', 'stats', 'queue', 'feed', 'day'],
  ['captures', 'nuggets', 'all', 'questions', 'sources', 'practices', 'lookups']
]
const part = Number(process.env.QA_PART || 0)
const pages = process.env.QA_PAGES ? process.env.QA_PAGES.split(',') : part ? PAGES[part - 1] : PAGES.flat()
const table = []

/** Every faded word in the window: its ratio on the ground under it, its size and its bar. */
const measure = (h) => h.evaluate(() => {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  // Any colour the page gives (rgb, oklab, color(), a mix), as the canvas reads it: its channels and its alpha.
  const read = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 } }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const near = (x, y) => Math.abs(x.r - y.r) <= 3 && Math.abs(x.g - y.g) <= 3 && Math.abs(x.b - y.b) <= 3
  const page = read(getComputedStyle(document.documentElement).getPropertyValue('--background').trim())
  const FADED = /(?:^|\s)((?:[\w&_[\]-]+:)*text-(?:foreground|muted-foreground)(?:\/\d+)?|text-\(--mf-muted(?:-strong)?\))(?=\s|$)/
  const words = []
  const one = (el, color, size, weight, text, kind) => {
    const style = getComputedStyle(el)
    const ink = read(style.getPropertyValue('--foreground').trim())
    const quiet = read(style.getPropertyValue('--muted-foreground').trim())
    const strong = read(style.getPropertyValue('--mf-muted-strong').trim() || style.getPropertyValue('--muted-foreground').trim())
    // A pill tinted in its kind's or calendar's colour (calendar-events.tsx's recipe, set on the element) is a hue, not a
    // faded ink, even where its grey comes out near Faded Ink.
    for (let up = el; up; up = up.parentElement) if (up.style?.color) return
    const own = read(color)
    // Faded: the ink at any alpha under 1, or Faded Ink or its strong step at any alpha. The ink itself and the hues are not.
    const faded = (near(own, ink) && own.a < 0.995) || near(own, quiet) || near(own, strong)
    if (!faded) return
    // A word still arriving (a hint typing in, word by word) is measured once it has landed, on another look.
    for (let up = el; up; up = up.parentElement) if (up.getAnimations().some((one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity)) return
    let fade = 1
    for (let up = el; up; up = up.parentElement) fade *= Number(getComputedStyle(up).opacity)
    if (fade < 0.05) return
    const chain = []
    for (let up = el; up; up = up.parentElement) chain.push(read(getComputedStyle(up).backgroundColor))
    let ground = page
    for (const fill of chain.reverse()) if (fill.a > 0) ground = over(fill, ground)
    const drawn = over({ ...own, a: own.a * fade }, ground)
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const cls = (String(el.className?.baseVal ?? el.className ?? '').match(FADED)?.[1]) ?? `${el.tagName.toLowerCase()} (inherits)`
    // Where it is: the nearest element that names itself with a data- attribute.
    let at = ''
    for (let up = el; up && !at; up = up.parentElement) at = [...up.attributes].find((one) => one.name.startsWith('data-') && one.name !== 'data-state')?.name ?? ''
    words.push({ kind, cls, at, text: text.slice(0, 40), size, weight, ratio: Math.round(ratio(drawn, ground) * 100) / 100, bar: large ? 3 : 4.5, ground: hex(ground), ink: hex(drawn) })
  }
  for (const el of document.body.querySelectorAll('*')) {
    // A placeholder showing in an empty field, or the element's own words: not a lone dot, arrow or other mark between words.
    const hint = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder && !el.value
    const text = hint ? el.placeholder : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!text || /^[\p{P}\p{S}\s]+$/u.test(text)) continue
    // Not words to read: drawings, pdf.js's clear words over a page, a disabled control, and a page's example (made-up
    // rows under "Example", drawn faded and inert as a picture of what the page will hold: example.tsx).
    if (el.closest('svg, canvas, .textLayer, :disabled, [aria-disabled="true"], [data-example]')) continue
    const box = el.getBoundingClientRect()
    // Drawn, wherever it is scrolled to: a row further down the page is still on it.
    if (!box.width || !box.height) continue
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const style = getComputedStyle(el)
    one(el, hint ? getComputedStyle(el, '::placeholder').color : style.color, parseFloat(style.fontSize), Number(style.fontWeight), text, hint ? 'placeholder' : 'words')
  }
  return words
})

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
/** At rest: a hint typing in, a fade or a colour still easing in is measured once it has landed (endless ones, a shimmer, aside). */
const settle = (ms) => h.evaluate(async (ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((done) => setTimeout(done, 100)))
    if (!document.getAnimations().some((one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity)) return
}, ms)
const wear = async (theme, style) => {
  await h.evaluate(([theme, style]) => { localStorage.setItem('theme', theme); localStorage.setItem('style', style); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
  await wait(500)
  // A surface whose fill eases to the new look (Home's card) is measured on the look it lands on, not half way.
  await settle(1500)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const id of pages) {
    await wear('paper', 'soft')
    await go(id)
    await wait(700)
    await settle(3000)
    let most = 0
    for (const theme of THEMES) for (const style of STYLES) {
      await wear(theme, style)
      const words = await measure(h)
      most = Math.max(most, words.length)
      for (const one of words) table.push({ page: id, theme, style, ...one })
      const low = words.filter((one) => one.ratio < one.bar).sort((a, b) => a.ratio - b.ratio)
      check(`${id}, ${theme}/${style}: every faded word reads (${words.length} words, lowest ${words.length ? Math.min(...words.map((one) => one.ratio)).toFixed(2) : '-'}:1)`, !low.length, low.slice(0, 4).map((one) => `${one.cls} in ${one.at || '-'} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${words.length} words`)
      if (shots && style === 'soft' && (theme === 'paper' || theme === 'dark')) await h.screenshot({ path: join(shots, `faded-${id}-${theme}.png`) })
    }
    check(`${id}: the page shows faded words to measure`, most > 0, `${most} at most`)
  }
  if (process.env.QA_TABLE) writeFileSync(process.env.QA_TABLE, table.map((one) => JSON.stringify(one)).join('\n') + '\n')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
