// The sandbox's sidebar starts the way its owner laid it out (Feed with the
// writing, Goals to the Bin under it), the writing row is called "Writing",
// a person's photo says "Add a photo" on hover, and someone with no dates
// shows only "Born", someone living "1964 to now".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-side-person-line.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const { h, errors, close } = await sandbox({ width: 1300, height: 900 })
const person = async (name) => {
  await h.evaluate((n) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${n}` })), name)
  await h.waitForTimeout(1200)
}
try {
  const rows = await h.evaluate(() => [...document.querySelectorAll('aside nav [data-sortable-id]')].map((el) => el.getAttribute('data-sortable-id')))
  const want = ['inbox', 'home', 'day', 'articles', 'nuggets', 'feed', 'review', 'today', 'calendar']
  check('the sandbox sidebar starts Inbox, Home, Journal, Writing, Gems, Feed, Review, Tasks, Calendar', want.every((id, at) => rows[at] === id), JSON.stringify(rows))
  check('and Goals, Queue, Sources, Stats, Map, Bin and What Haligtree can do are on', ['goals', 'queue', 'sources', 'stats', 'map', 'discarded', 'powers'].every((id) => rows.includes(id)), JSON.stringify(rows))
  const label = await h.locator('aside nav [data-sortable-id="articles"]').innerText()
  check('the writing row is called Writing', /^Writing/.test(label.trim()), label)

  await person('Frank Herbert')
  const photo = h.locator('[data-person-photo]')
  await photo.hover()
  await h.waitForTimeout(300)
  const said = await photo.evaluate((el) => { const tip = el.querySelector('[data-photo-hint]'); return { text: tip.innerText, op: getComputedStyle(tip).opacity } })
  check('hovering the face says a photo goes there', said.text.includes('Add a photo') && Number(said.op) > 0.9, JSON.stringify(said))
  const fields = () => h.locator('[data-person-line] input').evaluateAll((all) => all.map((one) => [one.getAttribute('data-fact'), one.value, one.placeholder]))
  const before = await fields()
  check('with no dates, only "Born" shows', before.length === 2 && before[1][0] === 'Born', JSON.stringify(before))
  await h.locator('[data-fact="Born"]').fill('1920')
  await h.locator('[data-fact="Born"]').press('Enter')
  await h.waitForTimeout(800)
  const after = await fields()
  check('born and still living reads "1920 to now"', after.length === 3 && after[2][1] === '' && after[2][2] === 'now', JSON.stringify(after))
  // A photo opens whole on a click, and changes from its own small button.
  await person('Jane Austen')
  await h.locator('[data-person-photo="picture"]').hover()
  await h.waitForTimeout(400)
  if (process.env.SHOTS) await h.locator('[data-person-head]').screenshot({ path: `${process.env.SHOTS}/photo-hover.png` })
  check('a face with a photo says "See it" and shows "Change photo"', (await h.locator('[data-photo-hint]').innerText()).includes('See it') && await h.locator('[data-photo-change]').isVisible())
  await h.locator('[data-person-photo="picture"]').click()
  await h.waitForTimeout(800)
  check('clicking the photo opens it whole', await h.locator('.mf-look[role="dialog"]').count() === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  check('Esc puts it away', await h.locator('.mf-look[role="dialog"]').count() === 0)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
