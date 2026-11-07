// A row carried to the page's edge with a note open beside the list: one card you can see the whole way, words clear of
// the dashed line, the strip beside the list and never over it, the card inside the strip, and it opens where it says.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/split-strip.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: Number(process.env.QA_WIDTH || 1400), height: 880 })
const { h, v, go, close } = s
if (process.env.QA_THEME) await s.theme(process.env.QA_THEME)
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => { if (shots) await h.screenshot({ path: `${shots}/${name}.png` }) }
const read = () => h.evaluate(() => {
  const seen = (one) => { for (let at = one; at; at = at.parentElement) if (+getComputedStyle(at).opacity < 0.05) return false; return true }
  const box = (one) => { if (!one) return null; const b = one.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom } }
  const cards = [...document.querySelectorAll('[data-carried-card], [data-split-card]')].filter((one) => one.getClientRects().length && seen(one))
  const zone = document.querySelector('[data-split-zone][data-hot]') ?? document.querySelector('[data-split-zone]')
  const dash = zone?.querySelector('span[aria-hidden]')
  const words = zone?.querySelector('span:last-child')
  const range = document.createRange()
  if (words) range.selectNodeContents(words)
  const row = [...document.querySelectorAll('[role="main"] [data-row][data-id]')].find((one) => one.getClientRects().length)
  return { cards: cards.length, zones: document.querySelectorAll('[data-split-zone]').length, hot: document.querySelectorAll('[data-split-zone][data-hot]').length, zone: box(zone), dash: box(dash), words: words ? box(range) : null, lines: words ? new Set([...range.getClientRects()].map((one) => Math.round(one.top))).size : 0, card: box(cards[0]), row: box(row), panes: document.querySelectorAll('[data-split-area] [data-pane]').length }
})
const close2 = (a, b) => Math.round(Math.min(a.l - b.l, b.r - a.r))
try {
  await v('settings:set', { hintRate: 0 })
  await go('articles')
  await wait(800)
  const rows = await h.locator('[role="main"] [data-row][data-id]').all()
  await rows[1].click()
  await wait(900)
  await shot('0-list-and-note')
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom } })
  for (const side of [process.env.QA_SIDE || 'left']) {
    const row = await h.locator('[role="main"] [data-row][data-id]').nth(2).boundingBox()
    const from = { x: row.x + 60, y: row.y + row.height / 2 }
    const to = { x: side === 'left' ? area.l + 30 : area.r - 30, y: (area.t + area.b) / 2 }
    await h.mouse.move(from.x, from.y)
    await h.mouse.down()
    await h.mouse.move(from.x + 4, from.y + 8, { steps: 3 })
    let least = 9
    for (let i = 1; i <= 16; i++) {
      await h.mouse.move(from.x + (to.x - from.x) * i / 16, from.y + (to.y - from.y) * i / 16)
      await wait(50)
      const now = await read()
      least = Math.min(least, now.cards)
      if (i % 4 === 0) await shot(`${side}-carry-${String(i).padStart(2, '0')}`)
    }
    // A hand keeps moving a little as it arrives.
    for (let i = 1; i <= 6; i++) { await h.mouse.move(to.x + (i % 2), to.y + i); await h.screenshot(); await wait(30) }
    // An off-screen window draws only when asked: its springs stand still between screenshots.
    for (let i = 0; i < 12; i++) { await h.screenshot(); await wait(50) }
    const at = await read()
    await shot(`${side}-rested`)
    check(`${side}: a card can be seen at every step of the way`, least === 1, least)
    check(`${side}: one card at rest in the strip`, at.cards === 1, at.cards)
    check(`${side}: the strip is lit`, at.hot === 1, JSON.stringify(at.zone))
    check(`${side}: the words stand clear of the dashed line, 6px or more each side`, at.words && close2(at.words, at.dash) >= 6, at.words && close2(at.words, at.dash))
    check(`${side}: the words break on two lines at most`, at.lines <= 2, at.lines)
    check(`${side}: the card stays inside the strip`, at.card && close2(at.card, at.zone) >= 0, at.card && close2(at.card, at.zone))
    check(`${side}: the list stays on the page beside the note`, !!at.row, JSON.stringify(at.row))
    check(`${side}: the strip sits beside the list, not over it`, at.row && at.zone.r <= at.row.l || at.row && at.zone.l >= at.row.r, JSON.stringify([at.zone, at.row]))
    check(`${side}: the card rests under the words, off them`, at.card && at.words && at.card.t >= at.words.b, JSON.stringify([at.card, at.words]))
    const panes = at.panes
    await h.mouse.up()
    await wait(1000)
    const after = await read()
    check(`${side}: let go, it opens in a new split`, after.panes === panes + 1, `${panes} to ${after.panes}`)
    await shot(`${side}-opened`)
  }
} finally {
  await close()
}
done()
