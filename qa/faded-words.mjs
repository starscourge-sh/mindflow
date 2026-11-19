// Faded words read in every look (14 Nov; the user's rule: key words are never small grey text). qa/quiet-ink.mjs holds
// the quiet ink tokens to it; this walks the pages the app's faded classes were on (the ink at 70% or 75%, Faded Ink at
// 60% or 80%, and the rest): every word drawn in a faded ink (the ink at any alpha under 1, Faded Ink at any alpha, its
// strong step), placeholders included, on the ground it really sits on, reaches 4.5:1, or 3:1 when large (24px, or
// 18.66px and bold). Each page in Paper, Light, Dark, Everforest and Tokyo Night, in the Soft, Paper and Brutal styles,
// and in Brutal again with up to six rows pointed at, one by one, by the pointer (two of the sidebar's, four of the page's):
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
  const one = (el, color, size, weight, text, kind, own_fade = 1) => {
    const style = getComputedStyle(el)
    const ink = read(style.getPropertyValue('--foreground').trim())
    const quiet = read(style.getPropertyValue('--muted-foreground').trim())
    const strong = read(style.getPropertyValue('--mf-muted-strong').trim() || style.getPropertyValue('--muted-foreground').trim())
    const own = read(color)
    let fade = own_fade
    for (let up = el; up; up = up.parentElement) fade *= Number(getComputedStyle(up).opacity)
    // Faded: the ink at any alpha under 1, or Faded Ink or its strong step at any alpha; and any word drawn see-through,
    // by an alpha on its own ink (white at 90% over a picture) or by opacity on it or round it (a key at 70%), whatever
    // its ink. The ink itself and the hues, drawn whole, are not.
    // A key beside a label is a hint whatever its ink (the fill's own ink on a button): it is measured too.
    const seen = fade < 0.995 || own.a < 0.995
    const faded = (near(own, ink) && own.a < 0.995) || near(own, quiet) || near(own, strong) || seen || !!el.closest('kbd, [data-slot="kbd"]')
    if (!faded) return
    // A pill tinted in its kind's or calendar's colour (calendar-events.tsx's recipe, set on the element) is a hue, not a
    // faded ink, even where its grey comes out near Faded Ink; drawn see-through, it is measured as drawn.
    if (!seen) for (let up = el; up; up = up.parentElement) if (up.style?.color) return
    // A word still arriving (a hint typing in, word by word: its opacity or colour still easing) is measured once it has
    // landed, on another look. Only a fade or a change of colour counts: a slide or a drift elsewhere changes no ink.
    const fading = (one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity &&
      (one.transitionProperty ? /opacity|color|filter|all/.test(one.transitionProperty) : (one.effect?.getKeyframes?.() ?? []).some((key) => 'opacity' in key || 'color' in key || 'filter' in key))
    for (let up = el; up; up = up.parentElement) if (up.getAnimations().some(fading)) return
    // Faded out to nothing (a grip that shows on hover): not drawn. A whole row or card dimmed to show its state (a closed
    // question, a paused card) is drawn, and its words are measured as drawn, at that strength.
    if (fade < 0.05) return
    // Words painted by their own fill through the letters (the reader card's gold foil: a clear ink and a background
    // clipped to the text) are not an ink to read against a ground, nor is a clear ink with nothing painted through it.
    if (own.a < 0.05) return
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
  for (const el of (scope ? [...document.querySelectorAll(scope)] : [document.body]).flatMap((root) => [root, ...root.querySelectorAll('*')])) {
    // Not words to read: drawings, pdf.js's clear words over a page, a disabled control, and a page's example (made-up
    // rows under "Example", drawn faded and inert as a picture of what the page will hold: example.tsx).
    // A setting's sample (Settings' previews, `data-preview`), dimmed while its setting is off, is a picture too.
    if (el.closest('svg, canvas, .textLayer, :disabled, [aria-disabled="true"], [inert], [data-example], span[data-preview], [data-dim-preview]')) continue
    const box = el.getBoundingClientRect()
    // Drawn, wherever it is scrolled to: a row further down the page is still on it.
    if (!box.width || !box.height) continue
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    // An editor's empty line showing its hint ("Write a thought…", TipTap's placeholder): drawn by its ::before, read
    // there, with the ::before's own colour, size and see-through.
    const before = el.hasAttribute('data-placeholder') ? getComputedStyle(el, '::before') : null
    if (before && !/^(none|normal)$/.test(before.content) && before.display !== 'none' && before.visibility !== 'hidden' && Number(before.opacity) > 0.05) {
      const said = /attr\(|var\(/.test(before.content) || before.content.length < 3 ? el.getAttribute('data-placeholder') : before.content.replace(/^["']|["']$/g, '')
      if (said?.trim()) one(el, before.color, parseFloat(before.fontSize), Number(before.fontWeight), said.trim(), 'placeholder', Number(before.opacity))
    }
    // A placeholder showing in an empty field, or the element's own words: not a lone dot, arrow or other mark between
    // words (a key is words, a keycap's ⌘↵ too).
    const hint = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder && !el.value
    const text = hint ? el.placeholder : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!text || (/^[\p{P}\p{S}\s]+$/u.test(text) && !el.closest('kbd, [data-slot="kbd"]'))) continue
    const style = getComputedStyle(el)
    one(el, hint ? getComputedStyle(el, '::placeholder').color : style.color, parseFloat(style.fontSize), Number(style.fontWeight), text, hint ? 'placeholder' : 'words')
  }
  return words
}, scope)

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
/** At rest: a hint typing in, a fade or a colour still easing in is measured once it has landed (endless ones, a shimmer, aside). */
const settle = (ms, on = h) => on.evaluate(async (ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((done) => setTimeout(done, 100)))
    if (!document.getAnimations().some((one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity)) return
}, ms)
const wear = async (theme, style, on = h) => {
  await on.evaluate(([theme, style]) => { localStorage.setItem('theme', theme); localStorage.setItem('style', style); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
  await on.waitForTimeout(500)
  // A surface whose fill eases to the new look (Home's card) is measured on the look it lands on, not half way.
  await settle(1500, on)
}

/**
 * The places that open (QA_PART=places, 15 Nov): words a key hint, a count, a tooltip's second line or a row's state
 * had faded with opacity, each measured as drawn, the see-through counted, in each theme in the Soft and Brutal styles,
 * in each state it shows in. Close the day and the week at rest, a choice pointed at and a choice taken; what fits,
 * its keyboard row; the Undo notice, its action's key and its ⌘Z; the link box's Save ↵; the selection bar's tooltip;
 * a note's Mentions and Related; Review's exam line, at rest and pointed at; quick capture's hint card, a vote's tooltip
 * with its key, and its "Create ⌘↵"; and the editor's empty line's hint, as every placeholder is measured.
 */
async function places() {
  const LOOKS = THEMES.flatMap((theme) => ['soft', 'brutal'].map((style) => [theme, style]))
  const shown = (scope, on = h) => on.evaluate((scope) => [...document.querySelectorAll(scope)].some((one) => one.checkVisibility()), scope)
  /** One state of one place: every look, its faded words read on their ground. */
  const state = async (name, scope, on = h, keep = async () => {}) => {
    if (!(await shown(scope, on))) return check(`${name}: shows`, false, `nothing at ${scope}`)
    let count = 0
    const lows = []
    for (const [theme, style] of LOOKS) {
      await wear(theme, style, on)
      await keep()
      const words = await measure(on, scope)
      count = Math.max(count, words.length)
      for (const one of words) table.push({ page: name, theme, style, ...one })
      // QA_SHOTS: the place in Paper, Dark and Brutal, cut to it with room round it, to read beside another build's.
      if (shots && ['paper/soft', 'dark/soft', 'paper/brutal', 'dark/brutal'].includes(`${theme}/${style}`)) {
        const box = await on.evaluate((scope) => { const all = [...document.querySelectorAll(scope)].filter((one) => one.checkVisibility()).map((one) => one.getBoundingClientRect()); if (!all.length) return null; const l = Math.min(...all.map((b) => b.left)), t = Math.min(...all.map((b) => b.top)), r = Math.max(...all.map((b) => b.right)), b = Math.max(...all.map((b) => b.bottom)); return { x: Math.max(0, l - 16), y: Math.max(0, t - 16), width: Math.min(innerWidth - Math.max(0, l - 16), r - l + 32), height: Math.min(innerHeight - Math.max(0, t - 16), b - t + 32) } }, scope)
        if (box && box.width > 0 && box.height > 0) await on.screenshot({ path: join(shots, `${name.replace(/[^\w]+/g, '-').replace(/-+$/, '')}-${theme}-${style}.png`), clip: box }).catch(() => {})
      }
      for (const one of words.filter((one) => one.ratio < one.bar)) lows.push({ ...one, theme, style })
    }
    lows.sort((a, b) => a.ratio - b.ratio)
    check(`${name}: every faded word reads in every look (${count} words at most, lowest ${lows[0] ? lows[0].ratio : 'none under the bar'})`, count > 0 && !lows.length,
      lows.slice(0, 4).map((one) => `${one.theme}/${one.style} ${one.cls} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${count} words`)
  }
  await wear('paper', 'soft')
  // Open tasks for today, none with a length, so Close the day, the week and what fits have rows to decide.
  for (const one of ['Return the library books', 'Write to Clerval', 'Mend the lamp']) await v('task:add', one, undefined, true)
  await wait(600)

  // Close the day: the keys show on the keyboard cursor's row alone, in the ink of the choice they are on.
  for (const [sheet, event] of [['close-day', 'haligtree:close-day'], ['close-week', 'haligtree:close-week']]) {
    await h.evaluate((event) => window.dispatchEvent(new CustomEvent(event)), event)
    await h.waitForSelector(`[data-${sheet}]`, { timeout: 4000 }).catch(() => {})
    await settle(2000)
    await state(`${sheet}, at rest (the keys on the cursor's row)`, `[data-${sheet}]`)
    const first = await h.evaluate((sheet) => { const box = document.querySelector(`[data-${sheet}] [data-close-task] button`)?.getBoundingClientRect(); return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 } }, sheet)
    if (first) {
      await h.mouse.move(first.x, first.y, { steps: 2 })
      await wait(300)
      await state(`${sheet}, a choice pointed at`, `[data-${sheet}] [data-close-task]`, h, () => h.mouse.move(first.x, first.y))
      await h.mouse.click(first.x, first.y)
      await wait(500)
      await state(`${sheet}, a choice taken (on the ink's fill)`, `[data-${sheet}] [data-close-task] button[aria-pressed="true"]`)
    }
    await h.mouse.move(1290, 890)
    await h.keyboard.press('Escape')
    await wait(700)
  }

  // What fits in two hours: the keyboard's row shows its keys on the length choices.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:fits', { detail: 120 })))
  await h.waitForSelector('[data-fits]', { timeout: 4000 }).catch(() => {})
  await settle(2000)
  for (let n = 0; n < 12 && !(await shown('[data-fit-at] [data-give-length]')); n++) await h.keyboard.press('ArrowDown'), await wait(150)
  await state('fits, the keyboard row with its keys', '[data-fits] [data-fit-at]')
  await h.keyboard.press('Escape')
  await wait(700)

  // The notice with Undo and an action: its keys beside the words, held under the pointer while each look is read.
  const notice = async () => {
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: 'Moved to the Bin', undo: () => {}, tone: 'success', action: { label: 'Open', key: '⌘O', run: () => {} } } })))
    await wait(500)
    const box = await h.evaluate(() => { const one = document.querySelector('[role="status"][aria-live="polite"]')?.getBoundingClientRect(); return one && { x: one.left + 12, y: one.top + one.height / 2 } })
    if (box) await h.mouse.move(box.x, box.y)
  }
  await notice()
  await state('the Undo notice', '[role="status"][aria-live="polite"]', h, async () => { if (!(await shown('[role="status"][aria-live="polite"]'))) await notice() })
  await h.mouse.move(1290, 890)
  await wait(400)

  // A note with a link, and words to pick: the link box (⌘K in the link) and the selection bar's tooltip.
  const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
  const text = (words, marks) => ({ type: 'text', text: words, ...(marks ? { marks } : {}) })
  const doc = (...content) => ({ type: 'doc', content })
  const p = (...content) => ({ type: 'paragraph', content })
  const target = await h.evaluate((one) => window.api.captures.create(one), { kind: 'note', body: doc(p(text('Lamplight study #c4probe')), p(text('The chapter on the lamp, and its maker.'))) })
  const note = await h.evaluate((one) => window.api.captures.create(one), { kind: 'note', body: doc(p(text('Notes on Lamplight study #c4probe')), p(text('Read '), text('www.example.com', [{ type: 'link', attrs: { href: 'https://www.example.com' } }]), text(' about the lamp.')), p(text('The long nights of study, a plain line to pick.'))) })
  await c.send('capture', note)
  await h.locator(ED).first().waitFor({ timeout: 8000 }).catch(() => {})
  await wait(1200)
  const caret = (words, inside) => h.$eval(ED, (el, [words, inside]) => {
    const e = el.editor; let at = -1
    e.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.includes(words)) at = pos + n.text.indexOf(words) })
    if (at < 0) return false
    e.chain().focus().setTextSelection(inside ? at + 3 : { from: at, to: at + words.length }).run()
    return true
  }, [words, inside]).catch(() => false)
  if (await caret('www.example.com', true)) {
    await wait(200)
    await h.keyboard.press('Meta+k')
    await wait(600)
    await state('the link box (Save ↵ on the accent)', '[data-link-editor]')
    // The accent's own ink where Save is drawn, in each theme: what its label and its key both wear.
    for (const theme of THEMES) {
      await wear(theme, 'soft')
      console.log(`(Save in ${theme}:`, JSON.stringify(await h.evaluate(() => { const save = document.querySelector('[data-link-keep]'); const root = getComputedStyle(document.documentElement); const own = save && getComputedStyle(save); return { primary: root.getPropertyValue('--primary').trim(), onPrimary: root.getPropertyValue('--primary-foreground').trim(), fill: own?.backgroundColor, ink: own?.color } })), ')')
    }
    await h.keyboard.press('Escape')
    await wait(300)
  } else check('the link box: the note opened', false)
  // The line picked as a person picks it (three clicks), then the bar's "Move out" pointed at.
  await h.locator(`${ED} > p`).nth(2).click({ clickCount: 3 }).catch(() => {})
  await wait(700)
  const bar = h.locator('[data-turn-into-page]')
  if (await bar.isVisible().catch(() => false)) {
    const point = async () => { await bar.hover().catch(() => {}); await wait(500) }
    await point()
    // Why a tip would not open there (ui/tooltip.tsx): something opened over it, or the bar inside a floating surface.
    console.log('(the bar\'s tip:', JSON.stringify(await h.evaluate(() => ({
      tip: !!document.querySelector('[data-slot="tooltip-content"]'),
      opened: [...document.querySelectorAll('[data-state="open"]:is([role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"],[data-slot="popover-content"],[data-slot="sheet-content"])')].map((one) => one.getAttribute('role') ?? one.dataset.slot),
      floating: !!document.querySelector('[data-turn-into-page]')?.closest('[role="menu"], [role="listbox"], .tiptap-slash-menu, [data-slot="popover-content"], [data-radix-popper-content-wrapper], [data-note-preview], [data-menu-peek], [data-slash-peek]'),
      under: document.elementFromPoint(...(() => { const b = document.querySelector('[data-turn-into-page]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] })())?.closest('button')?.getAttribute('aria-label')
    }))), ')')
    // In a window parked off screen this tip has not opened to the pointer (nothing over it, the pointer on the button):
    // said, not failed; the same tip component is measured on quick capture's hint card below.
    if (await shown('[data-slot="tooltip-content"]')) await state('the selection bar\'s tooltip (its second line)', '[data-slot="tooltip-content"]', h, point)
    else console.log('(the selection bar\'s tip did not open to the pointer in this parked window: not measured)')
  } else check('the selection bar\'s tooltip: the bar shows', false)
  await h.mouse.move(1290, 890)
  // Mentions and Related under the note it names: "Lamplight study" is named by the other note and shares its tag.
  await c.send('capture', target)
  await h.locator(ED).first().waitFor({ timeout: 8000 }).catch(() => {})
  await wait(2500)
  await h.evaluate(() => document.querySelector('section[data-chrome]')?.scrollIntoView({ block: 'center' }))
  await wait(400)
  await state('a note\'s Mentions and Related', 'section[data-chrome]')
  // The note's empty line, its hint drawn by TipTap's placeholder.
  await h.$eval(ED, (el) => el.editor.chain().focus('end').run()).catch(() => {})
  await h.keyboard.press('Enter')
  await wait(500)
  await state('an empty line\'s hint in a note', `${ED} .is-empty[data-placeholder]`)
  await h.keyboard.press('Meta+z')

  // Review's exam line: a date on the tags of the cards due, its words at rest and pointed at.
  const tags = await h.evaluate(async () => {
    const list = (tags) => (Array.isArray(tags) ? tags : typeof tags === 'string' ? (() => { try { return JSON.parse(tags) } catch { return tags.split(/[\s,]+/) } })() : [])
    return [...new Set((await window.api.haligtree('review:queue')).flatMap((one) => list(one.tags)).filter((one) => typeof one === 'string' && one))].slice(0, 2)
  }).catch(() => [])
  const soon = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10)
  for (const tag of tags) await v('tag:set', tag, { examAt: soon })
  await go('review', ':today')
  await wait(1500)
  await state('Review\'s exam line', '[data-review-top]')
  const chip = await h.evaluate(() => { const box = document.querySelector('[data-exam-chip]')?.getBoundingClientRect(); return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 } })
  if (chip) await state('Review\'s exam line, pointed at', '[data-exam-chip]', h, () => h.mouse.move(chip.x, chip.y))
  await h.mouse.move(1290, 890)

  // Quick capture: its "Create ⌘↵", and a hint card come back, a vote's tooltip with its key.
  const { page } = c
  await v('settings:set', { hintRate: 1, rotCount: 0 })
  let card = null
  for (const roll of [0.05, 0.2, 0.4, 0.6, 0.8]) {
    await page.evaluate(() => window.api.hidePrompt())
    await page.waitForTimeout(400)
    await page.evaluate((r) => { Math.random = () => r }, roll)
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(1400)
    card = await page.evaluate(() => document.querySelector('[data-hint-card]') && [...document.querySelectorAll('[data-hint-vote]')].length)
    if (card) break
  }
  await state('quick capture\'s "Create ⌘↵"', '[data-create]', page)
  await state('quick capture\'s "Create ⌘↵", pointed at', '[data-create]', page, () => page.locator('[data-create]').hover().catch(() => {}))
  await page.mouse.move(2, 2)
  if (card) {
    const vote = await page.evaluate(() => { const card = document.querySelector('[data-hint-card]').getBoundingClientRect(); const one = document.querySelector('[data-hint-vote]').getBoundingClientRect(); return { card: { x: card.left + 20, y: card.top + 20 }, x: one.left + one.width / 2, y: one.top + one.height / 2 } })
    const point = async () => { await page.mouse.move(vote.card.x, vote.card.y); await page.mouse.move(vote.x, vote.y, { steps: 2 }); await page.waitForTimeout(700) }
    await point()
    await state('a hint card\'s vote tooltip (its key)', '[data-slot="tooltip-content"]', page, point)
  } else check('a hint card shows in quick capture', false, 'no card with votes was dealt')
  await page.evaluate(() => window.api.hidePrompt())
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  if (process.env.QA_PART === 'places') await places()
  for (const id of process.env.QA_PART === 'places' ? [] : pages) {
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
    // Rows pointed at in Brutal, whose wash is the accent 22% into the card (brutal.css): up to two of the sidebar's rows and
    // four of the page's with quiet words, each hovered with the pointer and its words measured on the wash under them.
    for (const theme of THEMES) {
      await wear(theme, 'brutal')
      const rows = await h.evaluate(() => {
        for (const old of document.querySelectorAll('[data-qa-row]')) old.removeAttribute('data-qa-row')
        const out = []
        const room = { side: 2, page: 4 }
        // A list's rows first, then any other control that takes the wash; each holding quiet words, not only a quiet icon.
        const QUIET = '[class*="text-muted-foreground"], [class*="mf-muted"]'
        const quiet = (el) => [el, ...el.querySelectorAll(QUIET)].some((one) => one.matches(QUIET) && !one.closest('svg') && /[\p{L}\p{N}]/u.test(one.textContent))
        for (const el of [...document.querySelectorAll('[data-row], [data-side-row], [role="option"], [role="menuitem"]'), ...document.querySelectorAll('[class*="hover:bg-accent"]')]) {
          const where = el.closest('aside[data-chrome]') ? 'side' : 'page'
          if (!room[where]) continue
          const box = el.getBoundingClientRect()
          if (box.height < 16 || box.height > 320 || box.top < 40 || box.bottom > innerHeight - 4 || box.left < 0 || box.right > innerWidth) continue
          if (el.closest(':disabled, [inert], [data-example], [data-qa-row]') || el.querySelector('[data-qa-row]') || !el.checkVisibility({ opacityProperty: true })) continue
          if (!quiet(el)) continue
          el.setAttribute('data-qa-row', String(out.length))
          room[where]--
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
    // Rows picked as a person picks them (a click into the list on its first row, then ⌘A, as qa/gestures.mjs does), their
    // words measured on the picked tint in Brutal in each theme. Last on the page: the click opens what it lands on.
    const first = await h.evaluate(() => {
      const row = [...document.querySelectorAll('[data-row]')].find((one) => { const box = one.getBoundingClientRect(); return !one.closest('aside[data-chrome]') && box.height > 12 && box.top > 40 && box.bottom < innerHeight - 4 })
      const box = row?.getBoundingClientRect()
      return box ? { x: box.left + 30, y: box.top + 10 } : null
    })
    if (first) {
      await h.mouse.click(first.x, first.y)
      await wait(500)
      // The note a click opened may take the keys: a person clicks the list again.
      await h.evaluate(() => document.activeElement?.closest('[contenteditable]') && document.activeElement.blur())
      await h.keyboard.press('Meta+a')
      await wait(450)
      for (const theme of THEMES) {
        await wear(theme, 'brutal')
        const picked = await h.evaluate(() => document.querySelectorAll('[data-picked]').length)
        const words = await measure(h, '[data-picked]')
        for (const one of words) table.push({ page: id, theme, style: 'brutal', picked: true, ...one })
        const low = words.filter((one) => one.ratio < one.bar).sort((a, b) => a.ratio - b.ratio)
        if (picked) check(`${id}, ${theme}/brutal, ${picked} rows picked with ⌘A: every faded word on their tint reads (${words.length} words, lowest ${words.length ? Math.min(...words.map((one) => one.ratio)).toFixed(2) : '-'}:1)`, !low.length, low.slice(0, 4).map((one) => `${one.cls} in ${one.at || '-'} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${words.length} words`)
      }
      await h.keyboard.press('Escape')
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
