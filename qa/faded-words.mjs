// Faded words read in every look (14 Nov; the user's rule: key words are never small grey text). qa/quiet-ink.mjs holds
// the quiet ink tokens to it; this walks the pages the app's faded classes were on (the ink at 70% or 75%, Faded Ink at
// 60% or 80%, and the rest): every word drawn in a faded ink (the ink at any alpha under 1, Faded Ink at any alpha, its
// strong step), placeholders included, on the ground it really sits on, reaches 4.5:1, or 3:1 when large (24px, or
// 18.66px and bold). Each page in Paper, Light, Dark, Everforest and Tokyo Night, in the Soft, Paper and Brutal styles,
// and in Brutal again with up to five rows pointed at, one by one, by the pointer (a list's, the sidebar's, a menu's):
// their words measured on the accent's wash under them, a glide list's light included. A row dimmed to show its state
// (a closed question, a paused card) is measured as it is drawn, at that strength.
// Left out, as not words: icons and drawings (no words of their own), a lone dot or arrow between words, disabled
// controls (an inert block too), and anything faded out to nothing (a grip that shows on hover).
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

/** Every faded word in the window (or inside `scope`, a selector): its ratio on the ground under it, its size and its bar. */
const measure = (h, scope = null) => h.evaluate((scope) => {
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
    // A word still arriving (a hint typing in, word by word: its opacity or colour still easing) is measured once it has
    // landed, on another look. Only a fade or a change of colour counts: a slide or a drift elsewhere changes no ink.
    const fading = (one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity &&
      (one.transitionProperty ? /opacity|color|filter|all/.test(one.transitionProperty) : (one.effect?.getKeyframes?.() ?? []).some((key) => 'opacity' in key || 'color' in key || 'filter' in key))
    for (let up = el; up; up = up.parentElement) if (up.getAnimations().some(fading)) return
    let fade = 1
    for (let up = el; up; up = up.parentElement) fade *= Number(getComputedStyle(up).opacity)
    // Faded out to nothing (a grip that shows on hover): not drawn. A whole row or card dimmed to show its state (a closed
    // question, a paused card) is drawn, and its words are measured as drawn, at that strength.
    if (fade < 0.05) return
    // The ground: every fill from the page down to the word, and under a row of a glide list the light drawn behind its
    // rows (glide.tsx: the pointer's light, and the mark of the one chosen), where it lies under the word.
    const box = el.getBoundingClientRect()
    const mid = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    const chain = []
    for (let up = el; up; up = up.parentElement) {
      chain.push(read(getComputedStyle(up).backgroundColor))
      for (const light of up.querySelectorAll(':scope > [data-glide]')) {
        const at = light.getBoundingClientRect()
        const lit = Number(getComputedStyle(light).opacity)
        if (lit < 0.05 || mid.x < at.left || mid.x > at.right || mid.y < at.top || mid.y > at.bottom) continue
        const fill = read(getComputedStyle(light).backgroundColor)
        chain.splice(chain.length - 1, 0, { ...fill, a: fill.a * lit })
      }
    }
    let ground = page
    for (const fill of chain.reverse()) if (fill.a > 0) ground = over(fill, ground)
    const drawn = over({ ...own, a: own.a * fade }, ground)
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const cls = (String(el.className?.baseVal ?? el.className ?? '').match(FADED)?.[1]) ?? `${el.tagName.toLowerCase()} (inherits)`
    // Where it is: the nearest element that names itself with a data- attribute.
    let at = ''
    for (let up = el; up && !at; up = up.parentElement) at = [...up.attributes].find((one) => one.name.startsWith('data-') && !['data-state', 'data-qa-row', 'data-fluid-hover-active'].includes(one.name))?.name ?? ''
    words.push({ kind: fade <= 0.6 ? 'dimmed' : kind, cls, at, text: text.slice(0, 40), size, weight, ratio: Math.round(ratio(drawn, ground) * 100) / 100, bar: large ? 3 : 4.5, ground: hex(ground), ink: hex(drawn) })
  }
  for (const el of (scope ? document.querySelector(scope) : document.body)?.querySelectorAll('*') ?? []) {
    // A placeholder showing in an empty field, or the element's own words: not a lone dot, arrow or other mark between words.
    const hint = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder && !el.value
    const text = hint ? el.placeholder : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!text || /^[\p{P}\p{S}\s]+$/u.test(text)) continue
    // Not words to read: drawings, pdf.js's clear words over a page, a disabled control, and a page's example (made-up
    // rows under "Example", drawn faded and inert as a picture of what the page will hold: example.tsx).
    if (el.closest('svg, canvas, .textLayer, :disabled, [aria-disabled="true"], [inert], [data-example]')) continue
    const box = el.getBoundingClientRect()
    // Drawn, wherever it is scrolled to: a row further down the page is still on it.
    if (!box.width || !box.height) continue
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const style = getComputedStyle(el)
    one(el, hint ? getComputedStyle(el, '::placeholder').color : style.color, parseFloat(style.fontSize), Number(style.fontWeight), text, hint ? 'placeholder' : 'words')
  }
  return words
}, scope)

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
      const dimmed = words.filter((one) => one.kind === 'dimmed').length
      check(`${id}, ${theme}/${style}: every faded word reads (${words.length} words${dimmed ? `, ${dimmed} in rows dimmed to show their state` : ''}, lowest ${words.length ? Math.min(...words.map((one) => one.ratio)).toFixed(2) : '-'}:1)`, !low.length, low.slice(0, 4).map((one) => `${one.kind === 'dimmed' ? 'dimmed row: ' : ''}${one.cls} in ${one.at || '-'} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${words.length} words`)
      if (shots && style === 'soft' && (theme === 'paper' || theme === 'dark')) await h.screenshot({ path: join(shots, `faded-${id}-${theme}.png`) })
    }
    check(`${id}: the page shows faded words to measure`, most > 0, `${most} at most`)
    // Rows pointed at in Brutal, whose wash is the accent 22% into the card (brutal.css): up to five rows with quiet words
    // (a list's, the sidebar's, a menu's), each hovered with the pointer and its words measured on the wash under them.
    for (const theme of THEMES) {
      await wear(theme, 'brutal')
      const rows = await h.evaluate(() => {
        for (const old of document.querySelectorAll('[data-qa-row]')) old.removeAttribute('data-qa-row')
        const out = []
        for (const el of document.querySelectorAll('[data-row], [data-side-row], [role="option"], [role="menuitem"], [class*="hover:bg-accent"]')) {
          if (out.length >= 5) break
          const box = el.getBoundingClientRect()
          if (box.height < 16 || box.height > 160 || box.top < 40 || box.bottom > innerHeight - 4 || box.left < 0 || box.right > innerWidth) continue
          if (el.closest(':disabled, [inert], [data-example], [data-qa-row]') || el.querySelector('[data-qa-row]') || !el.checkVisibility({ opacityProperty: true })) continue
          if (!el.matches('[class*="text-muted-foreground"], [class*="mf-muted"]') && !el.querySelector('[class*="text-muted-foreground"], [class*="mf-muted"]')) continue
          el.setAttribute('data-qa-row', String(out.length))
          out.push({ n: out.length, x: box.left + Math.min(box.width / 2, 120), y: box.top + box.height / 2 })
        }
        return out
      })
      const words = []
      for (const row of rows) {
        await h.mouse.move(row.x, row.y, { steps: 2 })
        await wait(300)
        await settle(1000)
        for (const one of await measure(h, `[data-qa-row="${row.n}"]`)) words.push(one), table.push({ page: id, theme, style: 'brutal', hovered: true, ...one })
      }
      await h.mouse.move(1290, 890)
      const low = words.filter((one) => one.ratio < one.bar).sort((a, b) => a.ratio - b.ratio)
      if (rows.length) check(`${id}, ${theme}/brutal, ${rows.length} rows pointed at: every faded word on the wash reads (${words.length} words, lowest ${words.length ? Math.min(...words.map((one) => one.ratio)).toFixed(2) : '-'}:1)`, !low.length, low.slice(0, 4).map((one) => `${one.cls} in ${one.at || '-'} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${words.length} words`)
    }
  }
  if (process.env.QA_TABLE) writeFileSync(process.env.QA_TABLE, table.map((one) => JSON.stringify(one)).join('\n') + '\n')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
