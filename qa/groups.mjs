// Groups in a kept list: two articles dragged together into a group, named,
// coloured, folded, a third dragged in, a plain reorder that leaves the group
// alone, the menu, and Separate; then a restart to see it all kept. Shots in
// a light and a dark theme.
//
//   npx electron-vite build --outDir out-groups
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-groups/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/groups.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const TITLES = ['Spaced repetition, a primer', 'How memory palaces work', 'Reading list for October', 'Notes on Zettelkasten', 'The forgetting curve', 'Interleaving beats blocking']

const open = async () => {
  const c = await sandbox({ width: 1100, height: 760 })
  // Your own order, as a list: where groups show.
  await c.h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  return c
}
const articles = async (c) => { await c.go('articles'); await c.h.waitForTimeout(600) }
const row = (c, title) => c.h.locator('button[data-row]', { hasText: title }).first()
const head = (c) => c.h.locator('[data-group-row]').first()
const groupsNow = (c) => c.v('groups', 'article')

/** Press on one row and carry it to `at` (0 top, 1 bottom) of another, slowly, as a hand would. */
async function carry(c, from, to, at = 0.5, { hold = 0 } = {}) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2)
  await c.h.mouse.down()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 4 })
  await c.h.mouse.move(b.x + 60, b.y + b.height * at, { steps: 24 })
  await c.h.waitForTimeout(250)
  if (hold) await hold()
  await c.h.mouse.up()
  await c.h.waitForTimeout(700)
}

let c = await open()
try {
  await c.theme('light')
  await c.size(1100, 760)
  for (const title of TITLES) {
    const id = await c.v('article:new')
    await c.v('item:save', id, { title, attribution: title.includes('primer') ? 'https://gwern.net/spaced-repetition' : null })
  }
  await articles(c)
  check('the list is in your own order, with no groups yet', (await groupsNow(c)).length === 0)

  // 1. One row let go over the middle of another: a group of the two, its name ready to write.
  await carry(c, row(c, 'How memory palaces work'), row(c, 'Spaced repetition, a primer'), 0.5, {
    hold: async () => c.h.screenshot({ path: `${dir}/drag-join-light.png` })
  })
  let list = await groupsNow(c)
  check('a drop on the middle of a row makes a group of two', list.length === 1 && list[0].members.length === 2, JSON.stringify(list.map((g) => g.members.length)))
  const focused = await c.h.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  check('the new group starts with its name being written', focused === 'Group name', String(focused))
  await c.h.keyboard.type('Memory')
  await c.h.keyboard.press('Enter')
  await c.h.waitForTimeout(400)
  list = await groupsNow(c)
  check('renamed in place', list[0]?.name === 'Memory', list[0]?.name)

  // 2. Coloured from its menu: the row of dots.
  await head(c).click({ button: 'right' })
  await c.h.waitForTimeout(300)
  await c.h.screenshot({ path: `${dir}/menu-light.png` })
  await c.h.locator('[data-color-dot="blue"]').click()
  await c.h.waitForTimeout(300)
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  list = await groupsNow(c)
  check('coloured blue', list[0]?.color === 'blue', String(list[0]?.color))

  // 3. A third dragged onto the group's own row joins it, at the end.
  await carry(c, row(c, 'The forgetting curve'), head(c), 0.5)
  list = await groupsNow(c)
  check('a drop on the group row adds to it', list[0]?.members.length === 3, String(list[0]?.members.length))

  // 4. Between rows it only moves: the group is left as it was.
  const before = JSON.stringify(list)
  await carry(c, row(c, 'Interleaving beats blocking'), row(c, 'Reading list for October'), 0.05)
  check('a drop between rows only reorders', JSON.stringify(await groupsNow(c)) === before)

  // 5. Pointed at: the panel and its ×.
  await head(c).hover()
  await c.h.waitForTimeout(350)
  await c.h.screenshot({ path: `${dir}/open-hover-light.png` })

  // 6. Folded by a click; the fold is kept.
  await head(c).click()
  await c.h.waitForTimeout(500)
  list = await groupsNow(c)
  check('folds on a click, and says so in the database', list[0]?.folded === 1)
  const hidden = await row(c, 'The forgetting curve').count()
  check('a folded group hides its notes', hidden === 0, `${hidden} shown`)
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(300)
  await c.h.screenshot({ path: `${dir}/folded-light.png` })
} catch (error) {
  console.error(error)
  results.push(false)
}
await c.close()

// 7. A restart: name, colour, members and the fold all kept. Then dark.
c = await open()
try {
  await articles(c)
  const list = await groupsNow(c)
  check('after a restart the group is kept', list.length === 1 && list[0].name === 'Memory' && list[0].color === 'blue' && list[0].members.length === 3 && list[0].folded === 1, JSON.stringify(list[0] ?? null))
  check('and is still drawn folded', (await c.h.locator('[data-group-row]').count()) === 1 && (await row(c, 'The forgetting curve').count()) === 0)

  // The hand: open at rest on a row in your own order, closed while carrying.
  const rest = await row(c, 'Interleaving beats blocking').evaluate((el) => getComputedStyle(el).cursor)
  check('a row at rest shows an open hand', rest === 'grab', rest)
  // Held over the folded group's row, it springs open; Escape lets the row go where it was.
  let carrying = ''
  let sprung = false
  await carry(c, row(c, 'Interleaving beats blocking'), head(c), 0.15, {
    hold: async () => {
      carrying = await c.h.evaluate(() => getComputedStyle(document.body).cursor)
      await c.h.waitForTimeout(800)
      sprung = (await head(c).getAttribute('aria-expanded')) === 'true'
      await c.h.screenshot({ path: `${dir}/spring-open-light.png` })
      await c.h.keyboard.press('Escape')
    }
  })
  check('carrying shows a closed hand', carrying === 'grabbing', carrying)
  check('held over a folded group for a moment, it opens', sprung)
  check('and the open is kept', (await groupsNow(c))[0]?.folded === 0)
  check('Escape let the row go where it was', (await groupsNow(c))[0]?.members.length === 3)
  await head(c).click()
  await c.h.waitForTimeout(500)

  await c.theme('dark')
  await c.size(1100, 760)
  await articles(c)
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(300)
  await c.h.screenshot({ path: `${dir}/folded-dark.png` })
  await head(c).click()
  await c.h.waitForTimeout(500)
  await head(c).hover()
  await c.h.waitForTimeout(350)
  await c.h.screenshot({ path: `${dir}/open-hover-dark.png` })
  await carry(c, row(c, 'Notes on Zettelkasten'), row(c, 'Reading list for October'), 0.5, {
    hold: async () => c.h.screenshot({ path: `${dir}/drag-join-dark.png` })
  })
  let after = await groupsNow(c)
  check('a second group, from two rows outside the first', after.length === 2, String(after.length))
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  await head(c).click({ button: 'right' })
  await c.h.waitForTimeout(300)
  await c.h.screenshot({ path: `${dir}/menu-dark.png` })
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)

  // 8. Separate, by the ×: the notes stay, the group goes.
  const count = (await c.v('items', 'article')).length
  await head(c).hover()
  await c.h.waitForTimeout(300)
  const memory = c.h.locator('[data-group-block]', { has: c.h.locator('[data-group-row]', { hasText: 'Memory' }) })
  await memory.locator('[data-group-row]').hover()
  await c.h.waitForTimeout(300)
  await memory.locator('button[aria-label="Separate"]').click()
  await c.h.waitForTimeout(600)
  after = await groupsNow(c)
  check('Separate takes the group away', after.length === 1 && after[0].name !== 'Memory', JSON.stringify(after.map((g) => g.name)))
  check('and keeps every note', (await c.v('items', 'article')).length === count)
  check('its notes show again, at the top level', (await row(c, 'The forgetting curve').count()) === 1)
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(300)
  await c.h.screenshot({ path: `${dir}/separated-dark.png` })

  // 9. Another sort: flat, each grouped row with its group's name small beside its age.
  await c.h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await c.h.reload()
  await c.h.waitForTimeout(1500)
  await articles(c)
  const chips = await c.h.locator('[data-chip]').allTextContents()
  check('in another sort, grouped rows carry a chip', chips.length === 2 && chips.every((one) => one === 'New group') && (await c.h.locator('[data-group-row]').count()) === 0, JSON.stringify(chips))
  await c.h.mouse.move(900, 700)
  await c.h.screenshot({ path: `${dir}/chips-dark.png` })
  await c.theme('light')
  await c.size(1100, 760)
  await articles(c)
  await c.h.mouse.move(900, 700)
  await c.h.screenshot({ path: `${dir}/chips-light.png` })
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  check('no errors in the page', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.find((one) => /PAGEERROR/.test(one)) ?? '')
} catch (error) {
  console.error(error)
  results.push(false)
}
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
