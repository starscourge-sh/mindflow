// A drag's start and end cost almost nothing on a very long page: the page says it is carrying by an attribute on
// <html> (data-dragging, data-stretching, data-drag-refused, data-scrubbing, data-split-drag), and no rule under one of
// those may restyle every element ("html[data-dragging] *" did, on a 30,000-element page). On the long reader page
// (faked as in qa/reader-menu-speed.mjs) each attribute is put on and taken off and the style and layout it costs timed.
// EXPERIMENT=1 also times other ways to show the cursor, for comparison.
//   QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/drag-restyle-speed.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const PARAS = Number(process.env.PARAS ?? 1600)
const word = (n) => ['wand', 'castle', 'owl', 'potion', 'broom', 'cloak', 'stone', 'letter', 'house', 'forest'][n % 10]
const para = (n) => {
  const bits = []
  for (let i = 0; i < 6; i++) bits.push(`the ${word(n + i)} of chapter ${n} turns ${word(n * 3 + i)} by the lake`, `<span><a href="/wiki/${word(i)}_${n}_${i}"><b>${word(n + i * 7)}</b> ${i}</a></span>`)
  return `<p>${bits.join(' and ')}, so the reader keeps going through paragraph ${n}.</p>`
}
const page = `<html><head><title>The Long Wiki Page | Probe Wiki</title><meta property="og:site_name" content="Probe Wiki"></head><body><article><h1>The Long Wiki Page</h1>${Array.from({ length: PARAS }, (_, n) => (n % 40 === 0 ? `<h2>Section ${n / 40 + 1}</h2>` : '') + para(n)).join('')}</article></body></html>`
const NAMES = ['dragging', 'stretching', 'dragRefused', 'scrubbing', 'splitDrag']

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await electron.evaluate((_, [site, page]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      if (new URL(url).pathname === '/long') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      return new Response('', { status: 404 })
    }
  }, [SITE, page])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  if (process.env.NOTE) {
    // NOTE=1 (QA_ARGS= and a copy of a real book): its largest note open instead.
    // Found as qa/long-note-held.mjs finds it.
    const { DatabaseSync } = await import('node:sqlite')
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const root = process.env.QA_DATA
    const db = new DatabaseSync(join(root, 'books', JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')).last, 'haligtree.db'), { readOnly: true })
    const note = db.prepare("select id, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
    db.close()
    await c.send('capture', note.id)
    await h.waitForFunction(() => document.querySelectorAll('.tiptap *').length > 5000, null, { timeout: 90000, polling: 250 })
    await wait(3000)
    console.log('note:', note.id, note.size, 'characters stored')
  } else {
    await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/long`)
    await h.waitForSelector('.web-reader-body p', { timeout: 30000 })
    await wait(1500)
    await h.evaluate(() => { const s = document.querySelector('.web-reader-scroll'); s.scrollTop = s.scrollHeight / 2 })
    await wait(800)
  }
  console.log('page:', JSON.stringify(await h.evaluate(() => ({ elements: document.querySelectorAll('*').length }))))

  // The pointer over the page, as in a drag.
  await h.mouse.move(700, 450); await wait(200)
  // Each attribute on and off, three times: the style and layout each flip costs, forced at once (the middle of three).
  const flips = await h.evaluate(([names, experiment]) => {
    const html = document.documentElement
    const force = () => void html.offsetHeight
    const time = (on, off) => {
      const ons = [], offs = []
      for (let i = 0; i < 3; i++) {
        force()
        let t = performance.now(); on(); force(); ons.push(performance.now() - t)
        t = performance.now(); off(); force(); offs.push(performance.now() - t)
      }
      const mid = (list) => Math.round([...list].sort((a, b) => a - b)[1])
      return [mid(ons), mid(offs)]
    }
    const out = {}
    for (const name of names) out[name] = time(() => (html.dataset[name] = ''), () => delete html.dataset[name])
    if (experiment) {
      const style = document.head.appendChild(document.createElement('style'))
      style.textContent = 'html[data-g-plain] { cursor: grabbing !important } html[data-g-is] :is(a, button, [role=button], .cursor-pointer) { cursor: grabbing !important }'
      out['plain html cursor'] = time(() => (html.dataset.gPlain = ''), () => delete html.dataset.gPlain)
      out['scoped :is()'] = time(() => (html.dataset.gIs = ''), () => delete html.dataset.gIs)
      out['inline html cursor'] = time(() => (html.style.cursor = 'grabbing'), () => html.style.removeProperty('cursor'))
      const vars = document.head.appendChild(document.createElement('style'))
      vars.textContent = ':where(a, button, [role=button], .cursor-pointer) { cursor: var(--g-cursor, pointer) } :where(.cursor-text, input, textarea) { cursor: var(--g-cursor, text) }'
      force()
      out['custom property'] = time(() => html.style.setProperty('--g-cursor', 'grabbing'), () => html.style.removeProperty('--g-cursor'))
      out['custom property by attribute'] = (() => { const s = document.head.appendChild(document.createElement('style')); s.textContent = 'html[data-g-var] { --g-cursor: grabbing !important }'; return time(() => (html.dataset.gVar = ''), () => delete html.dataset.gVar) })()
      out['html and :hover'] = (() => { const s = document.head.appendChild(document.createElement('style')); s.textContent = 'html[data-g-hover], html[data-g-hover] :hover { cursor: grabbing !important; user-select: none !important }'; return time(() => (html.dataset.gHover = ''), () => delete html.dataset.gHover) })()
      out['under the pointer'] = time(() => document.querySelector('.web-reader-body a').style.setProperty('cursor', 'grabbing', 'important'), () => document.querySelector('.web-reader-body a').style.removeProperty('cursor'))
      const layer = document.createElement('div')
      layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:grabbing'
      out['layer'] = time(() => document.body.append(layer), () => layer.remove())
      // The same attributes with every "html[...] *" rule taken out of the page's sheets.
      const star = /html(\[data-[a-z-]+\])+ \*/
      let gone = 0
      for (const sheet of document.styleSheets) {
        const walk = (list) => { for (let i = list.length - 1; i >= 0; i--) { const rule = list[i]; if (rule.cssRules && !rule.selectorText) walk(rule.cssRules); else if (rule.selectorText && star.test(rule.selectorText)) { (rule.parentRule ?? rule.parentStyleSheet).deleteRule(i); gone++ } } }
        try { walk(sheet.cssRules) } catch {}
      }
      out[`rules taken out: ${gone}`] = [0, 0]
      for (const name of names) out[`${name} without them`] = time(() => (html.dataset[name] = ''), () => delete html.dataset[name])
    }
    return out
  }, [NAMES, !!process.env.EXPERIMENT])
  for (const [name, [on, off]] of Object.entries(flips)) console.log(`${name}: on ${on} ms, off ${off} ms`)
  // The cursor of what is under the pointer, carried over a button with the hand and over a link: the carry's own
  // cursor, with the pointer held by the grip (pointer capture) and without; after it, the hand again. (Electron's
  // cursor-changed is no help in a parked window: it said "hand" mid-carry on the old build, whose rule was on everything.)
  const cursor = () => h.evaluate(() => { const one = document.elementFromPoint(window.__qaAt.x, window.__qaAt.y); return one ? getComputedStyle(one).cursor : '(nothing)' })
  await h.evaluate(() => { window.__qaAt = { x: 0, y: 0 }; addEventListener('pointermove', (event) => (window.__qaAt = { x: event.clientX, y: event.clientY }), true) })
  for (const [kind, attr, want] of [['dragging', 'dragging', 'grabbing'], ['dragRefused', 'dragRefused', 'not-allowed'], ['stretching', 'stretching', 'ew-resize'], ['scrubbing', 'scrubbing', 'ew-resize'], ['splitDrag', 'splitDrag', 'grabbing']]) {
    for (const capture of [false, true]) {
      await h.evaluate(([attr, capture]) => {
        document.querySelectorAll('[data-qa-cursor]').forEach((one) => one.remove())
        const add = (tag, css) => { const el = document.body.appendChild(document.createElement(tag)); el.setAttribute('data-qa-cursor', ''); el.style.cssText = `position:fixed;z-index:2147483646;width:120px;height:40px;${css}`; return el }
        const grip = add('div', 'left:900px;top:300px;background:#ccc')
        const button = add('button', 'left:300px;top:300px'); button.className = 'cursor-pointer'; button.textContent = 'a button'
        const link = add('a', 'left:300px;top:400px;display:block'); link.href = '#'; link.textContent = 'a link'
        grip.addEventListener('pointerdown', (event) => { if (capture) grip.setPointerCapture(event.pointerId); document.documentElement.dataset[attr] = ''; event.preventDefault() })
        // Let go wherever the pointer is (uncaptured, the release lands on what is under it, not on the grip).
        window.addEventListener('pointerup', () => delete document.documentElement.dataset[attr], { once: true, capture: true })
      }, [attr, capture])
      await h.mouse.move(960, 320); await h.mouse.down(); await h.mouse.move(360, 320, { steps: 8 }); await wait(150)
      const overButton = await cursor()
      await h.mouse.move(360, 420, { steps: 4 }); await wait(150)
      const overLink = await cursor()
      await h.mouse.up(); await wait(100)
      await h.mouse.move(360, 322, { steps: 2 }); await wait(150)
      const after = await cursor()
      check(`data-${kind.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase())}${capture ? ', the pointer captured' : ''}: the pointer is “${want}” over a button and a link, the hand over the button after`, overButton === want && overLink === want && after === 'pointer', JSON.stringify({ overButton, overLink, after }))
    }
  }
  await h.evaluate(() => document.querySelectorAll('[data-qa-cursor]').forEach((one) => one.remove()))
  for (const name of NAMES) check(`data-${name.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase())} on and off the long page each cost under 50 ms`, flips[name][0] < 50 && flips[name][1] < 50, `on ${flips[name][0]} ms, off ${flips[name][1]} ms`)
} catch (error) {
  check('the probe ran to its end', false, String(error).slice(0, 400))
} finally {
  await c.close?.()
  await done?.()
}
