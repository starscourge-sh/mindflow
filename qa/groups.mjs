// Groups in a kept list, end to end, with frames of every change as it
// happens: a drag over a row's middle (the group about to form) and near its
// edge (only a line), a note carried out of its group, a group forming,
// picking rows with ⌘-click and the menu that speaks for them, ⌃⌘N, ← and →
// on a group's row, folding, Separate and its Undo; then a restart to see it
// all kept, the hand cursors, a dark theme, and the chips another sort shows.
//
//   npx electron-vite build --outDir out-groups
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-groups/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/groups.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const TITLES = ['Spaced repetition, a primer', 'How memory palaces work', 'Reading list for October', 'Notes on Zettelkasten', 'The forgetting curve', 'Interleaving beats blocking']

const open = async () => {
  const c = await sandbox({ width: 1100, height: 760 })
  // Your own order, as a list: where groups show.
  await c.h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  return c
}
const articles = async (c) => { await c.go('articles'); await c.h.waitForTimeout(600) }
const row = (c, title) => c.h.locator('button[data-row]', { hasText: title }).first()
const head = (c, name) => (name ? c.h.locator('[data-group-row]', { hasText: name }) : c.h.locator('[data-group-row]')).first()
const groupsNow = (c) => c.v('groups', 'article')
const named = async (c, name) => (await groupsNow(c)).find((one) => one.name === name)
const said = (c) => c.h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')

/** A few frames of whatever is moving now, of the list only. */
async function frames(c, name, count = 5, gap = 45) {
  for (let i = 0; i < count; i++) {
    await c.h.screenshot({ path: `${dir}/${name}-${i}.png`, clip: { x: 228, y: 80, width: 864, height: 560 } })
    if (gap) await c.h.waitForTimeout(gap)
  }
}

/** Press on one row and carry it to `at` (0 top, 1 bottom) of another, slowly, as a hand would; `hold` runs before letting go. */
async function carry(c, from, to, at = 0.5, { hold, up = true } = {}) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2)
  await c.h.mouse.down()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 4 })
  await c.h.mouse.move(b.x + 60, b.y + b.height * at, { steps: 24 })
  if (hold) await hold()
  else await c.h.waitForTimeout(250)
  if (up) await c.h.mouse.up()
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

  // 1. Over the middle of a row: it lifts, a panel opens around it with room for the carried one, and the label says New group.
  await carry(c, row(c, 'How memory palaces work'), row(c, 'Spaced repetition, a primer'), 0.5, {
    up: false,
    hold: async () => {
      await frames(c, 'a-middle', 6, 40)
      check('over a row\'s middle, a preview of the group shows', await c.h.locator('[data-preview]').count() === 1)
      check('and the label says so', (await said(c)) === 'New group', await said(c))
      check('and no insertion line', await c.h.locator('[data-line]').count() === 0)
    }
  })
  // 2. Let go: the group forms, its row unfolding above with the name ready to write.
  await c.h.mouse.up()
  await frames(c, 'b-form', 7, 35)
  await c.h.waitForTimeout(300)
  let list = await groupsNow(c)
  check('let go there, a group of two forms', list.length === 1 && list[0].members.length === 2)
  const focused = await c.h.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  check('its name is being written', focused === 'Group name', String(focused))
  await c.h.keyboard.type('Memory')
  await c.h.keyboard.press('Enter')
  await c.h.waitForTimeout(400)
  check('renamed in place', !!(await named(c, 'Memory')))

  // 3. Near a row's edge: only the line, no preview, no lift.
  await carry(c, row(c, 'Interleaving beats blocking'), row(c, 'Reading list for October'), 0.1, {
    up: false,
    hold: async () => {
      await c.h.waitForTimeout(150)
      await frames(c, 'c-edge', 4, 40)
      check('near a row\'s edge, only a line shows', await c.h.locator('[data-line]').count() === 1 && await c.h.locator('[data-preview]').count() === 0)
    }
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)

  // 4. Over the middle of the group's row: Add to Memory.
  await carry(c, row(c, 'The forgetting curve'), head(c, 'Memory'), 0.5, {
    hold: async () => {
      await c.h.waitForTimeout(200)
      check('over a group\'s row, the label offers to add to it', (await said(c)) === 'Add to Memory', await said(c))
      await frames(c, 'd-add', 3, 40)
    }
  })
  await c.h.waitForTimeout(600)
  check('and it joins', (await named(c, 'Memory'))?.members.length === 3)

  // 5. A note carried out of its group: the group closes over its place, and the label says Remove from Memory.
  await carry(c, row(c, 'How memory palaces work'), row(c, "Mnemosyne's problem"), 0.85, {
    hold: async () => {
      await c.h.waitForTimeout(150)
      check('carried out, the label says it leaves', (await said(c)) === 'Remove from Memory', await said(c))
      await frames(c, 'e-out', 5, 40)
    }
  })
  await c.h.waitForTimeout(600)
  check('let go outside, it leaves the group', (await named(c, 'Memory'))?.members.length === 2)
  // ⌘Z puts it back.
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(700)
  check('⌘Z puts it back in', (await named(c, 'Memory'))?.members.length === 3)

  // 6. ⌘-click picks two; the menu speaks for both.
  await row(c, 'Notes on Zettelkasten').click({ modifiers: ['Meta'] })
  await row(c, 'Reading list for October').click({ modifiers: ['Meta'] })
  await c.h.waitForTimeout(250)
  await c.h.mouse.move(900, 700)
  await frames(c, 'f-picked', 1, 0)
  await row(c, 'Reading list for October').click({ button: 'right' })
  await c.h.waitForTimeout(250)
  const lines = await c.h.locator('[data-slot="context-menu-content"] [role="menuitem"]').allTextContents()
  check('the menu speaks for the two picked', lines.some((one) => one.startsWith('New group with 2 notes')) && lines.some((one) => one.startsWith('Duplicate 2 notes')) && lines.some((one) => one.startsWith('Copy 2 links')) && lines.some((one) => one.startsWith('Archive 2 notes')), lines.join(' | '))
  await frames(c, 'g-menu', 1, 0)
  await c.h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Move to group' }).hover()
  await c.h.waitForTimeout(350)
  const sub = await c.h.locator('[data-slot="context-menu-sub-content"] [role="menuitem"]').allTextContents()
  check('Move to group lists Memory and New group…', sub.includes('Memory') && sub.includes('New group…'), sub.join(' | '))
  await frames(c, 'h-submenu', 1, 0)
  await c.h.keyboard.press('Escape')
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(250)

  // 7. ⌃⌘N groups the two picked, and its name is ready.
  await c.h.mouse.move(900, 700)
  await c.h.keyboard.press('Control+Meta+n')
  await frames(c, 'i-ctrlcmdn', 6, 35)
  await c.h.waitForTimeout(300)
  list = await groupsNow(c)
  check('⌃⌘N makes a group of the picked rows', list.length === 2 && list.some((one) => one.members.length === 2 && one.name === 'New group'))
  check('with its name being written', (await c.h.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Group name')
  await c.h.keyboard.type('Reading')
  await c.h.keyboard.press('Enter')
  await c.h.waitForTimeout(400)

  // 8. Colour from the menu, then ← and → on the group's row.
  await head(c, 'Memory').click({ button: 'right' })
  await c.h.waitForTimeout(250)
  await c.h.locator('[data-color-dot="blue"]').click()
  await c.h.waitForTimeout(300)
  await frames(c, 'j-colour', 1, 0)
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  check('coloured blue', (await named(c, 'Memory'))?.color === 'blue')
  await head(c, 'Memory').focus()
  await c.h.keyboard.press('ArrowLeft')
  await frames(c, 'j-fold', 6, 35)
  await c.h.waitForTimeout(300)
  check('← folds the group', (await named(c, 'Memory'))?.folded === 1)
  check('and its count shows', (await c.h.locator('[data-group-block] [data-count]').first().textContent()) === '3')
  await c.h.keyboard.press('ArrowRight')
  await c.h.waitForTimeout(450)
  check('→ unfolds it', (await named(c, 'Memory'))?.folded === 0)

  // 9. The ×: pointed at, the panel deepens and says what Separate keeps; clicked, it comes apart; ⌘Z puts it back.
  const memory = c.h.locator('[data-group-block]', { has: c.h.locator('[data-group-row]', { hasText: 'Memory' }) })
  await head(c, 'Memory').hover()
  await c.h.waitForTimeout(200)
  await memory.locator('button[aria-label^="Separate"]').hover()
  await c.h.waitForTimeout(700)
  const tip = await c.h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')].map((one) => one.textContent).join(' '))
  check('the × says what it keeps', tip.includes('Separate: keeps all 3 notes'), tip)
  await frames(c, 'k-x-hover', 1, 0)
  await memory.locator('button[aria-label^="Separate"]').click()
  await frames(c, 'l-separate', 8, 35)
  await c.h.waitForTimeout(600)
  check('Separate takes the group away and keeps its notes', !(await named(c, 'Memory')) && (await row(c, 'The forgetting curve').count()) === 1)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('⌘Z puts the group back together', (await named(c, 'Memory'))?.members.length === 3)
  // Folded, to see the fold kept after a restart.
  await head(c, 'Memory').click()
  await c.h.waitForTimeout(500)
} catch (error) {
  console.error(error)
  results.push(false)
}
await c.close()

// 10. A restart: names, colour, members and the fold kept. The hands. Then dark, and another sort.
c = await open()
try {
  await articles(c)
  const memory = await named(c, 'Memory')
  check('after a restart the groups are kept', memory?.color === 'blue' && memory.members.length === 3 && memory.folded === 1 && !!(await named(c, 'Reading')), JSON.stringify(await groupsNow(c)))
  check('and Memory is still drawn folded', (await row(c, 'The forgetting curve').count()) === 0)
  const rest = await row(c, 'Interleaving beats blocking').evaluate((el) => getComputedStyle(el).cursor)
  check('a row at rest shows an open hand', rest === 'grab', rest)
  let carrying = ''
  let sprung = false
  await carry(c, row(c, 'Interleaving beats blocking'), head(c, 'Memory'), 0.15, {
    up: false,
    hold: async () => {
      carrying = await c.h.evaluate(() => getComputedStyle(document.body).cursor)
      await c.h.waitForTimeout(800)
      sprung = (await head(c, 'Memory').getAttribute('aria-expanded')) === 'true'
    }
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)
  check('carrying shows a closed hand', carrying === 'grabbing', carrying)
  check('held over a folded group for a moment, it opens', sprung)

  await c.theme('dark')
  await c.size(1100, 760)
  await articles(c)
  await carry(c, row(c, 'Interleaving beats blocking'), row(c, 'Who is the monster'), 0.5, {
    up: false,
    hold: async () => (await c.h.waitForTimeout(250), await frames(c, 'a-middle-dark', 4, 40))
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)
  await carry(c, row(c, 'How memory palaces work'), row(c, 'Who is the monster'), 0.85, {
    up: false,
    hold: async () => (await c.h.waitForTimeout(250), await frames(c, 'e-out-dark', 4, 40))
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)
  await head(c, 'Memory').hover()
  await c.h.waitForTimeout(350)
  await frames(c, 'n-hover-dark', 1, 0)

  await c.h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await c.h.reload()
  await c.h.waitForTimeout(1500)
  await articles(c)
  const chips = await c.h.locator('[data-chip]').allTextContents()
  check('in another sort, grouped rows carry a chip', chips.filter((one) => one === 'Memory').length === 3 && chips.filter((one) => one === 'Reading').length === 2 && (await c.h.locator('[data-group-row]').count()) === 0, JSON.stringify(chips))
  await c.h.mouse.move(900, 700)
  await frames(c, 'o-chips-dark', 1, 0)
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
