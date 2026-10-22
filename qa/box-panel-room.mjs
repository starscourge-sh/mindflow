// Quick capture's side panel keeps real room for its list, at every height.
// With 2 pinned notes and 6 old captures asked for, what stacks above the
// Inbox (pinned, Tidy and Decide, the old captures) takes at most about 45% of
// the tab, and the Inbox list at least about 55%: 3 or more Inbox rows whole
// from 420 tall up, at least 1 at 280. Short, the pinned notes fold to one
// row of chips and fewer old cards show, never under 1; each card's words
// stop at 2 lines. The header's "old captures · pinned" chip says what is
// shown. Every other tab keeps its list at least 55% too.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/box-panel-room.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const { page, electron, h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const box = (fn, arg) => electron.evaluate(({ BrowserWindow }, [code, a]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')), a), [fn, arg])
const shot = async (name) => {
  if (!SHOT) return
  const png = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')).webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(`${SHOT}/${name}.png`, Buffer.from(png, 'base64'))
}
// The tab's body, what stacks above its list, and the list: rows whole inside it.
const measure = () => page.evaluate(() => {
  const scroller = [...document.querySelectorAll('.overflow-y-auto')].find((one) => one.closest('[data-panel]') || one.className.includes('pr-1'))
  if (!scroller) return null
  const body = scroller.closest('.flex-1.flex-col') ?? scroller.parentElement
  const s = scroller.getBoundingClientRect()
  const b = body.getBoundingClientRect()
  const stack = body.querySelector('[data-waiting-stack]') ?? body.querySelector(':scope > .shrink-0.border-b')
  const rows = [...scroller.querySelectorAll('[data-row][data-id]')].filter((row) => {
    const r = row.getBoundingClientRect()
    return r.height > 4 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1
  })
  const cards = [...document.querySelectorAll('[data-card]')]
  const folded = document.querySelector('[data-rot-folded]')
  const old = folded ? Number(/\d+/.exec(folded.innerText)?.[0]) : cards.length
  const clamped = cards.every((card) => {
    const words = card.querySelector('[data-row]')
    return !words || words.getBoundingClientRect().height <= parseFloat(getComputedStyle(words).lineHeight) * 2 + 2
  })
  const chip = document.querySelector('[data-waiting]')?.innerText.replace(/\s+/g, ' ').trim() ?? ''
  const pins = document.querySelectorAll('[data-pin]').length
  return {
    body: Math.round(b.height), stack: Math.round(stack?.getBoundingClientRect().height ?? 0), list: Math.round(s.height),
    rows: rows.length, cards: cards.length, old, folded: !!folded, clamped, chip, pins, compact: !!document.querySelector('[data-pins-compact]')
  }
})
try {
  await v('settings:set', { hintRate: 0, rotCount: 6, motion: false, safeMode: false, quietStart: '03:00', quietEnd: '03:01', pinnedQuestions: false, celebrate: false, boxDim: false })
  // The sandbox's old captures come back; these fill the Inbox, and two are pinned.
  for (let i = 0; i < 8; i++) (await page.evaluate((n) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Panel room probe capture ${n}: a thought long enough to run onto a second line in the narrow side panel, and then a third if nothing stopped it` }] }] } }), i + 1))
  for (const one of await v('pins')) await v('pin', one.type === 'capture' ? 'captures' : 'nuggets', one.id, false)
  const pins = (await page.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open').slice(0, 2)
  for (const one of pins) await v('pin', 'captures', one.id, true)
  const waiting = await v('rot:waiting')
  check('6 old captures are waiting to come back', waiting >= 6, `rot:waiting ${waiting}`)

  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.keyboard.press('Control+1')
  await wait(500)
  for (const theme of ['paper', 'dark']) {
    await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
    await wait(400)
    for (const height of [280, 420, 600, 900]) {
      await box('const b = win.getBounds(); win.setMinimumSize(200, 200); win.setMaximumSize(4000, 4000); win.setBounds({ ...b, height: a }); win.setMaximumSize(b.width, a); win.setMinimumSize(200, a)', height)
      await page.evaluate(() => window.api.showPrompt())
      await wait(900)
      // As if it had the focus, so the shots show it at full strength.
      await page.evaluate(() => (document.documentElement.dataset.blurred = 'off'))
      const m = await measure()
      await shot(`inbox-${height}-${theme === 'paper' ? 'light' : 'dark'}`)
      const need = height >= 420 ? 3 : 1
      check(`${theme} ${height}: the Inbox shows ${need}+ whole rows`, m && m.rows >= need, JSON.stringify(m))
      check(`${theme} ${height}: what stacks above takes at most ~45%`, m && m.stack <= m.body * 0.47, m && `${m.stack}/${m.body} = ${Math.round((100 * m.stack) / m.body)}%`)
      check(`${theme} ${height}: at least 1 old card, or the row that says how many, each at most 2 lines`, m && (m.cards >= 1 || m.folded) && m.clamped, m && `${m.cards} cards${m.folded ? `, folded: ${m.old}` : ''}`)
      const said = m ? (/(\d+) old capture/.exec(m.chip) ?? [])[1] : null
      const pinSaid = m ? (/(\d+) pinned/.exec(m.chip) ?? [])[1] : null
      check(`${theme} ${height}: the header chip says what is shown`, m && Number(said) === m.old && Number(pinSaid) === m.pins, m && `"${m.chip}" vs ${m.old} old, ${m.pins} pins`)
    }
  }
  // Every height between, 20 at a time: the same rule all the way, no height where it breaks.
  const bad = []
  for (let height = 280; height <= 900; height += 20) {
    await box('const b = win.getBounds(); win.setMinimumSize(200, 200); win.setMaximumSize(4000, 4000); win.setBounds({ ...b, height: a }); win.setMaximumSize(b.width, a); win.setMinimumSize(200, a)', height)
    await wait(350)
    const m = await measure()
    const said = Number((/(\d+) old capture/.exec(m?.chip ?? '') ?? [])[1])
    if (!m || m.rows < (height >= 420 ? 3 : 1) || m.stack > m.body * 0.47 || said !== m.old || !m.clamped) bad.push(`${height}: ${JSON.stringify(m)}`)
  }
  check('every height from 280 to 900 keeps the rows, the 45% and an honest chip', !bad.length, bad.join(' | ').slice(0, 900))
  // Every other tab: its list keeps the room too, at the shortest and a middle height.
  for (const height of [280, 600]) {
    await box('const b = win.getBounds(); win.setMinimumSize(200, 200); win.setMaximumSize(4000, 4000); win.setBounds({ ...b, height: a }); win.setMaximumSize(b.width, a); win.setMinimumSize(200, a)', height)
    for (const key of ['2', '3', '4', '5']) {
      await page.keyboard.press(`Control+${key}`)
      await wait(600)
      const m = await measure()
      check(`tab ${key} at ${height}: its list has at least ~55%`, m && m.list >= m.body * 0.53, m && `${m.list}/${m.body}`)
    }
  }
  await page.keyboard.press('Control+1')
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
