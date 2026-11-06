// This run's new surfaces at scale and at phone width (BOOK=5|500|5000 notes; the run's own throwaway book,
// not the sandbox): the offer line under a note, the scan line over a scanned book, a task's Reminders menu
// line and the Week page's "Your week, in a paragraph" card (a stand-in model: HALIGTREE_QA_CAPS=ai), each at
// 1200 and 390px wide, light and dark. Measured: how long the first offer takes at this size, that nothing runs
// past the window or off its column, that every menu row hovered shows at most one floating thing, and that the
// offer line and the hint line are one material. SHOT=<folder> keeps the frames.
//   BOOK=500 QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-scale.mjs
import { readFileSync } from 'node:fs'
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_CAPS = 'ai'
const N = Number(process.env.BOOK ?? 5)
const SHOT = process.env.SHOT
const { open } = await import('./harness.mjs')
const { check, done } = checks()
const qa = await open()
const { electron, page } = qa
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const WORDS = ['letters to Lucilius on grief', 'a walk along the river at dusk', 'notes on the Calvin cycle', 'sourdough that came out flat', 'the second act of Hamlet', 'why inflation hurts savers', 'golden hour portraits', 'the Medici bank and its painters']
try {
  await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  const made = Date.now()
  await page.evaluate(async ([n, words]) => {
    for (let i = 0; i < n; i++) await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${words[i % words.length]}, again (${i}). ${words[(i * 7) % words.length]} came up too.` }] }] } })
  }, [N, WORDS])
  console.log(`made ${N} notes in ${Date.now() - made} ms`)
  const h = electron.windows().find((w) => w.url().includes('view=home'))
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  const size = async (w) => {
    await electron.evaluate(({ BrowserWindow }, w) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: w, height: 844 }); win?.show() }, w)
    await h.waitForTimeout(600)
  }
  const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  const look = async (name) => { await h.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name); await h.waitForTimeout(400) }
  const both = async (file) => { if (!SHOT) return; for (const name of ['light', 'dark']) { await look(name); await h.screenshot({ path: `${SHOT}/${file}-${name}.png` }) } await look('light') }
  const fits = (selector) => h.evaluate((selector) => {
    const one = document.querySelector(selector)
    if (!one) return null
    const r = one.getBoundingClientRect()
    const cut = [one, ...one.querySelectorAll('*')].some((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), inside: r.left >= 0 && r.right <= innerWidth, sideways: document.documentElement.scrollWidth > innerWidth + 1, cut }
  }, selector)
  const floating = () => h.evaluate(() => document.querySelectorAll('[data-title-tips], [data-note-preview], [role="tooltip"]').length)

  // The welcome put away (onboarding:set above), as a person who has finished it sees the app.
  await h.reload()
  await h.waitForTimeout(2500)
  await h.keyboard.press('Escape')
  const stoicism = await v('article:new')
  await v('item:save', stoicism, { title: 'Stoicism', body: { type: 'doc', content: [para('Virtue is the only good; our judgements are up to us.')] } })
  const note = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('The Stoics held that only our judgements are up to us.')] })
  for (const width of [1200, 390]) {
    await size(width)
    await send('capture', note)
    const asked = Date.now()
    let offer = null
    for (let t = 0; t < 150000 && !offer; t += 250) (await h.waitForTimeout(250), (offer = await h.evaluate(() => document.querySelector('[data-note-offer]')?.textContent ?? null)))
    if (width === 1200) console.log(`first offer at ${N} notes after ${Date.now() - asked} ms`)
    check(`${N} notes, ${width}px: the offer line shows`, /Stoicism/.test(offer ?? ''), offer)
    const box = await fits('[data-note-offer]')
    const words = await fits('.tiptap.ProseMirror p')
    if (width === 390) console.log('window inner width at 390:', await h.evaluate(() => innerWidth))
    const spill = await h.evaluate(() => { const box = document.querySelector('[data-note-offer]').getBoundingClientRect(); return [...document.querySelectorAll('[data-note-offer] *')].some((one) => { const r = one.getBoundingClientRect(); return r.height && (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.right > box.right + 1) }) })
    check(`${N} notes, ${width}px: the offer line sits in the words' column, inside the window, nothing cut or spilling`, box && box.inside && !box.sideways && !box.cut && !spill && Math.abs(box.left - words.left) <= 2, JSON.stringify({ box, words, spill }))
    for (const button of ['[data-offer-action]', '[data-offer-away]']) {
      const r = await h.evaluate((s) => { const one = document.querySelector(s)?.getBoundingClientRect(); return one && { x: one.x + one.width / 2, y: one.y + one.height / 2, h: one.height } }, button)
      if (!r) continue
      await h.mouse.move(r.x, r.y)
      await h.waitForTimeout(900)
      check(`${N} notes, ${width}px: ${button} hovered shows at most one floating thing, its target ${Math.round(r.h)}px tall`, (await floating()) <= 1 && r.h >= 24, `${await floating()}`)
      await h.mouse.move(2, 2)
    }
    await both(`scale-${N}-${width}-offer`)
  }
  // One material: the offer line beside the app's hint line.
  if (N === 5) {
    const material = await h.evaluate(() => {
      const offer = document.querySelector('[data-note-offer]')
      const hint = document.createElement('div')
      hint.className = 'flex shrink-0 items-start gap-3 overflow-hidden rounded-xl border border-foreground/[0.07] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] py-2 pr-1.5 pl-3.5 text-control text-muted-foreground'
      document.body.append(hint)
      const [a, b] = [getComputedStyle(offer), getComputedStyle(hint)]
      const out = ['borderTopLeftRadius', 'borderTopColor', 'backgroundColor', 'color'].map((key) => [key, a[key], b[key]])
      hint.remove()
      return out
    })
    check('the offer line is the hint line’s material: corner, hairline, tint and ink the same', material.every(([, a, b]) => a === b), JSON.stringify(material))
  }

  // A task's right-click, row by row.
  await page.evaluate(() => window.api.haligtree('task:add', 'Hand in the Stoicism essay today 5pm'))
  for (const width of [1200, 390]) {
    await size(width)
    await h.reload()
    await h.waitForTimeout(2500)
    await h.keyboard.press('Escape')
    await send('view', 'day')
    await h.waitForTimeout(1500)
    await h.locator('[data-pane]').getByText('Hand in the Stoicism essay').first().click({ button: 'right' })
    await h.waitForTimeout(500)
    const rows = await h.locator('[role="menu"] [role="menuitem"]').all()
    let worst = 0
    for (const row of rows) {
      await row.hover()
      await h.waitForTimeout(650)
      worst = Math.max(worst, await floating())
    }
    const menu = await fits('[role="menu"]')
    check(`${width}px: the task menu (${rows.length} rows, “Add to Reminders” among them) hovered row by row shows at most one floating thing, inside the window`, worst <= 1 && menu?.inside && (await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].some((one) => /Add to Reminders/.test(one.textContent)))), `${worst} ${JSON.stringify(menu)}`)
    if (SHOT) await h.screenshot({ path: `${SHOT}/scale-${N}-${width}-task-menu-light.png` })
    await h.keyboard.press('Escape')
  }

  // The Week page's card, written by the stand-in.
  for (const width of [1200, 390]) {
    await size(width)
    await send('view', 'weekpage')
    await h.waitForTimeout(1500)
    await h.evaluate(() => document.querySelector('[data-ai-week-ask]')?.scrollIntoView({ block: 'center' }))
    await h.click('[data-ai-week-ask]').catch(() => {})
    await h.waitForTimeout(1500)
    await h.evaluate(() => document.querySelector('[data-ai-week-text]')?.scrollIntoView({ block: 'center' }))
    const card = await fits('[data-ai-week-text]')
    check(`${N} notes, ${width}px: the week card shows inside the window, nothing cut`, card && card.inside && !card.sideways && !card.cut, JSON.stringify(card))
    await both(`scale-${N}-${width}-week`)
    await h.evaluate(() => [...document.querySelectorAll('[data-ai-week] button')].find((one) => one.textContent === 'Not now')?.click())
  }

  // The scan line.
  const bytes = Array.from(readFileSync(new URL('./fixtures/scanned-book.pdf', import.meta.url)))
  const src = await h.evaluate((bytes) => window.api.saveFile('scanned-book.pdf', new Uint8Array(bytes)), bytes)
  for (const width of [1200, 390]) {
    await size(width)
    await send('pdf', `${src}|scanned-book.pdf`)
    await h.waitForTimeout(2500)
    const line = await fits('[data-pdf-scan]')
    const spill = await h.evaluate(() => { const box = document.querySelector('[data-pdf-scan]').getBoundingClientRect(); return [...document.querySelectorAll('[data-pdf-scan] *')].some((one) => { const r = one.getBoundingClientRect(); return r.height && (r.top < box.top - 1 || r.bottom > box.bottom + 1) }) })
    check(`${width}px: the scan line shows inside the window on one line, its button whole, nothing spilling out of it`, line && line.inside && !line.sideways && !spill && !(await h.evaluate(() => { const b = document.querySelector('[data-pdf-scan-read]'); return b && b.scrollWidth > b.clientWidth + 1 })), JSON.stringify({ line, spill }))
    await both(`scale-${N}-${width}-scan`)
  }
} finally {
  await qa.close().catch(() => {})
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
