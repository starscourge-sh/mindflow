// Two things: carried to a side, Dia's two tall cards come up, the one under
// the pointer lit as the place; and Home's
// "More like" rows never show the app's help deck or a #bit, and a row can be
// taken off Home from its own menu, with the way back on the tag's page.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/drop-room-tag-rows.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/drop-room'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, go, errors, close } = s
const wait = (ms = 600) => h.waitForTimeout(ms)
const rows = () => h.evaluate(() => [...document.querySelectorAll('section h2, section h3, section [role="heading"]')].map((el) => el.textContent.trim()).filter((t) => t.startsWith('More like')))
try {
  await go('home')
  await wait(1500)
  const first = await rows()
  check('Home has "More like" rows', first.length > 0, JSON.stringify(first))
  check('no row for the help deck or #bit', !first.some((t) => /learn-haligtree|#bit\b/.test(t)), JSON.stringify(first))
  const tag = first[0]?.replace(/^More like #/, '')
  const section = h.locator('section', { hasText: `More like #${tag}` }).last()
  await section.locator('[data-menu="home-row"]').click()
  await wait(300)
  await h.getByRole('menuitem', { name: `Hide #${tag} from Home` }).click()
  await wait(1500)
  const after = await rows()
  check('"Hide from Home" takes the row off', !after.includes(`More like #${tag}`), JSON.stringify(after))
  await s.send('tag', tag)
  await wait(1500)
  await h.locator('[data-pane] [aria-label="More"]').first().click()
  await wait(300)
  const back = h.getByRole('menuitem', { name: 'Show its row on Home' })
  check('the tag page offers "Show its row on Home"', await back.count() === 1)
  await back.click()
  await wait(300)
  await go('home')
  await wait(1500)
  check('and it is back on Home', (await rows()).includes(`More like #${tag}`), JSON.stringify(await rows()))

  // The drop place: a Feed post carried to the right edge.
  await go('feed')
  await wait(1500)
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width } })
  const post = h.locator('[data-feed-title]').first()
  const pb = await post.boundingBox()
  const y = (area.top + area.bottom) / 2
  await h.mouse.move(pb.x + 20, pb.y + pb.height / 2)
  await h.mouse.down()
  await h.mouse.move(pb.x + 30, pb.y + pb.height / 2 + 10, { steps: 4 })
  await h.mouse.move(area.right - 200, y, { steps: 10 })
  await h.mouse.move(area.right - 50, y, { steps: 8 })
  await wait(400)
  const card = await h.evaluate(() => { const el = document.querySelector('[data-split-zone="right"]'); const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), hot: el.hasAttribute('data-hot') } })
  check('the places are Dia\'s tall cards, there whole from the start', card.w >= 180 && card.h >= (area.bottom - area.top) * 0.6, JSON.stringify(card))
  check('the card under the pointer is the place', card.hot, JSON.stringify(card))
  await h.screenshot({ path: `${SHOTS}/dia-cards.png` })
  await h.mouse.up()
  await wait(1500)
  check('letting go there opens a second pane', await h.evaluate(() => document.querySelectorAll('[data-pane]').length) === 2)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
