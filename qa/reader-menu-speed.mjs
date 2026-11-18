// A right-click on a link in a very long page in the reader (a Fandom page, "317 MIN READ") opens its menu at once
// and closes it at once: the menu must not make the browser lay out the whole page again. The site is faked in the
// main process's fetch, as in qa/web-reader.mjs. Prints the open and close times and the longest task each made.
//   QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/reader-menu-speed.mjs
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
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/long`)
  await h.waitForSelector('.web-reader-body p', { timeout: 30000 })
  await wait(1500)
  const size = await h.evaluate(() => ({ nodes: document.querySelectorAll('.web-reader-body *').length, links: document.querySelectorAll('.web-reader-body a').length, minutes: document.querySelector('.web-reader-meta')?.textContent }))
  console.log('page:', JSON.stringify(size))
  // Into the middle of the page, as a reader halfway down it is.
  await h.evaluate(() => { const s = document.querySelector('.web-reader-scroll'); s.scrollTop = s.scrollHeight / 2 })
  await wait(800)

  // Times from the press to the frame after the menu came (or went), and the longest task in between.
  await h.evaluate(() => {
    const q = (window.__menuQa = { tasks: [], at: 0, shown: 0, gone: 0 })
    new PerformanceObserver((list) => list.getEntries().forEach((one) => q.tasks.push([one.startTime, one.duration]))).observe({ entryTypes: ['longtask'] })
    const menu = () => document.querySelector('[data-slot=context-menu-content][data-state=open]')
    // Each frame: the first one drawn with the menu in it, then the first without it.
    const frame = () => {
      if (q.at && !q.shown && menu()) q.shown = performance.now()
      else if (q.at && q.shown && !q.gone && !menu()) q.gone = performance.now()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    for (const kind of ['contextmenu', 'keydown']) window.addEventListener(kind, () => (q.at ||= performance.now()), true)
  })
  const opens = []
  const closes = []
  const longest = []
  for (let round = 0; round < 3; round++) {
    const at = await h.evaluate((round) => {
      const box = document.querySelector('.web-reader-scroll').getBoundingClientRect()
      const link = [...document.querySelectorAll('.web-reader-body a')].find((one) => { const r = one.getBoundingClientRect(); return one.getClientRects().length === 1 && r.top > box.top + 120 + round * 90 && r.bottom < box.bottom - 120 })
      const r = link.getClientRects()[0]
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, round)
    await h.evaluate(() => Object.assign(window.__menuQa, { tasks: [], at: 0, shown: 0, gone: 0 }))
    await h.mouse.move(at.x, at.y)
    await h.mouse.click(at.x, at.y, { button: 'right' })
    await h.waitForFunction(() => window.__menuQa.shown > 0, null, { timeout: 20000 }).catch(async (error) => { throw new Error(`no menu came: ${JSON.stringify(await h.evaluate(() => ({ q: window.__menuQa.at, menus: [...document.querySelectorAll('[data-slot=context-menu-content]')].map((one) => one.dataset.state), shield: document.querySelectorAll('[data-menu-shield]').length })))}`) })
    await wait(400)
    const opened = await h.evaluate(() => ({ ms: window.__menuQa.shown - window.__menuQa.at, task: Math.max(0, ...window.__menuQa.tasks.map(([, d]) => d)), rows: [...document.querySelectorAll('[data-slot=context-menu-content] [role=menuitem]')].map((one) => one.textContent) }))
    if (round === 0) check('the link menu offers the reader, the browser and the link', opened.rows.includes('Open in the reader') && opened.rows.includes('Open in the browser') && opened.rows.includes('Copy link'), JSON.stringify(opened.rows))
    if (round === 0 && process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/reader-menu-open.png` })
    const shownAt = await h.evaluate(() => window.__menuQa.shown)
    await h.evaluate((shownAt) => Object.assign(window.__menuQa, { tasks: [], at: 0, shown: shownAt }), shownAt)
    await h.keyboard.press('Escape')
    await h.waitForFunction(() => window.__menuQa.gone > 0, null, { timeout: 20000 }).catch(async () => { throw new Error(`the menu stayed: ${JSON.stringify(await h.evaluate(() => ({ q: window.__menuQa, menus: [...document.querySelectorAll('[data-slot=context-menu-content]')].map((one) => one.dataset.state), shield: document.querySelectorAll('[data-menu-shield]').length })))}`) })
    await wait(400)
    const closed = await h.evaluate(() => ({ ms: window.__menuQa.gone - window.__menuQa.at, task: Math.max(0, ...window.__menuQa.tasks.map(([, d]) => d)) }))
    opens.push(Math.round(opened.ms)); closes.push(Math.round(closed.ms)); longest.push(Math.round(Math.max(opened.task, closed.task)))
  }
  const mid = (list) => [...list].sort((a, b) => a - b)[1]
  console.log(`menu open ms ${opens.join(', ')} (middle ${mid(opens)}); close ms ${closes.join(', ')} (middle ${mid(closes)}); longest task ms ${longest.join(', ')}`)
  check('the link menu opens within 150ms on the long page', mid(opens) < 150, `${opens.join(', ')} ms`)
  check('and closes within 100ms', mid(closes) < 100, `${closes.join(', ')} ms`)

  // Still modal: a press on another link while the menu is open only closes the menu; the link is not followed.
  const [one, two] = await h.evaluate(() => {
    const box = document.querySelector('.web-reader-scroll').getBoundingClientRect()
    const links = [...document.querySelectorAll('.web-reader-body a')].filter((one) => one.getClientRects().length === 1 && one.getBoundingClientRect().top > box.top + 150 && one.getBoundingClientRect().bottom < box.bottom - 150)
    window.__followed = 0
    window.open = () => void (window.__followed += 1)
    return [links[0], links[links.length - 1]].map((link) => { const r = link.getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  })
  await h.mouse.move(one.x, one.y)
  await h.mouse.click(one.x, one.y, { button: 'right' })
  await h.waitForSelector('[data-slot=context-menu-content][data-state=open]')
  await h.mouse.move(two.x, two.y)
  const under = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.hasAttribute('data-menu-shield') ?? false, [two.x, two.y])
  await h.mouse.click(two.x, two.y)
  await wait(400)
  const after = await h.evaluate(() => ({ open: !!document.querySelector('[data-slot=context-menu-content][data-state=open]'), followed: window.__followed, shield: document.querySelectorAll('[data-menu-shield]').length }))
  check('while it is open the page under it takes no hover or press, and a press outside only closes it', under && !after.open && after.followed === 0 && after.shield === 0, JSON.stringify({ under, ...after }))
} catch (error) {
  check('the probe ran to its end', false, String(error).slice(0, 400))
} finally {
  await c.close?.()
  await done?.()
}
