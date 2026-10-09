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
async function carry(c, from, to, at = 0.5, { hold, up = true, shift = false } = {}) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2)
  if (shift) await c.h.keyboard.down('Shift')
  await c.h.mouse.down()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 4 })
  await c.h.mouse.move(b.x + 60, b.y + b.height * at, { steps: 24 })
  if (hold) await hold()
  else await c.h.waitForTimeout(250)
  if (up) await c.h.mouse.up()
  if (shift) await c.h.keyboard.up('Shift')
}
/** The rows as drawn, top to bottom, and which are picked. */
const order = (c) => c.h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *)')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => one.textContent.replace(/(now|\d+(mo|[dwyhm])).*$/, '').trim()))
const picked = (c) => c.h.evaluate(() => [...document.querySelectorAll('[data-row][data-picked]:not([data-lifted] *)')].map((one) => one.textContent.replace(/(now|\d+(mo|[dwyhm])).*$/, '').trim()))
const memberTitles = async (c, name) => {
  const group = await named(c, name)
  const items = await c.v('items', 'article')
  return (group?.members ?? []).map((id) => items.find((one) => one.id === id)?.title)
}

let c = process.env.ONLY ? null : await open()
if (c) try {
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
      check('and no insertion line', await c.h.locator('[data-drop-line]').count() === 0)
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
      check('near a row\'s edge, only a line shows', await c.h.locator('[data-drop-line]').count() === 1 && await c.h.locator('[data-preview]').count() === 0)
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
  check('⌃⌘N makes a group of the picked rows', list.length === 2 && list.some((one) => one.members.length === 2 && /^Group \d+$/.test(one.name)), JSON.stringify(list.map((one) => one.name)))
  check('with its name being written', (await c.h.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Group name')
  await c.h.keyboard.type('Reading')
  await c.h.keyboard.press('Enter')
  await c.h.waitForTimeout(400)

  // 7b. Several picked move together. ⌘-click one, ⇧-click a range, then carry one of them, ⇧ still down.
  await c.h.mouse.move(900, 700)
  await row(c, "Mnemosyne's problem").click({ modifiers: ['Meta'] })
  await row(c, 'Who is the monster').click({ modifiers: ['Shift'] })
  await row(c, 'Interleaving beats blocking').click({ modifiers: ['Meta'] })
  await c.h.waitForTimeout(200)
  check('⌘-click and ⇧-click pick three', (await picked(c)).length === 3, JSON.stringify(await picked(c)))
  await carry(c, row(c, 'Who is the monster'), row(c, 'Spaced repetition, a primer'), 0.5, {
    shift: true,
    hold: async () => {
      await c.h.waitForTimeout(200)
      check('the picks survive the press', (await picked(c)).length === 3)
      check('carrying three, the label counts them', (await said(c)) === 'Add 3 to Memory', await said(c))
      const stack = await c.h.evaluate(() => {
        const ghost = document.querySelector('[data-ghost]')?.getBoundingClientRect()
        const badge = document.querySelector('[data-carried]')?.getBoundingClientRect()
        const fans = [...document.querySelectorAll('[data-fanned]')].map((one) => one.getBoundingClientRect())
        const room = document.querySelector('[data-room]')
        return { fans: fans.length, upLeft: fans.every((one) => one.top < ghost.top && one.left < ghost.left), badgeBelow: !!badge && badge.top > ghost.bottom - 12 && Math.abs((badge.left + badge.width / 2) - (ghost.left + ghost.width / 2)) < 4, rows: Number(room?.getAttribute('data-room')), roomHeight: room?.getBoundingClientRect().height, row: document.querySelector('[data-row]')?.getBoundingClientRect().height }
      })
      check('three carried show as a fanned stack, the count hanging under it', stack.fans === 2 && stack.upLeft && stack.badgeBelow, JSON.stringify(stack))
      check('and the room opened is a row for each', stack.rows === 3 && Math.abs(stack.roomHeight - 3 * stack.row) < stack.row * 0.5, JSON.stringify(stack))
      await frames(c, 'p-stack-join', 4, 40)
    }
  })
  await c.h.waitForTimeout(700)
  let members = await memberTitles(c, 'Memory')
  check('all three join the group, in their order', members.length === 6 && members.slice(1, 4).join('|') === 'Interleaving beats blocking|' + "Mnemosyne's problem: how memory fades|Who is the monster in Frankenstein?", members.join(' | '))
  check('and the picks are let go', (await picked(c)).length === 0)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('one ⌘Z puts all three back', (await named(c, 'Memory'))?.members.length === 3)

  // 7c. Near an edge, the picked rows land there together, in their order.
  await row(c, "Mnemosyne's problem").click({ modifiers: ['Meta'] })
  await row(c, 'Who is the monster').click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'Who is the monster'), row(c, 'Interleaving beats blocking'), 0.1, {
    hold: async () => (await c.h.waitForTimeout(200), await frames(c, 'q-stack-edge', 3, 40))
  })
  await c.h.waitForTimeout(700)
  const rows = await order(c)
  check('two picked rows move to the edge together', rows.slice(0, 3).join('|') === "Mnemosyne's problem: how memory fades|Who is the monster in Frankenstein?|Interleaving beats blocking", rows.slice(0, 3).join(' | '))

  // 7d. Two picked in a group, carried out: both leave it.
  await row(c, 'Spaced repetition, a primer').click({ modifiers: ['Meta'] })
  await row(c, 'The forgetting curve').click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'The forgetting curve'), row(c, 'Interleaving beats blocking'), 0.9, {
    hold: async () => {
      await c.h.waitForTimeout(200)
      check('carrying two out, the label counts them', (await said(c)) === 'Remove 2 from Memory', await said(c))
      await frames(c, 'r-stack-out', 3, 40)
    }
  })
  await c.h.waitForTimeout(700)
  check('both leave, and the group of one left comes apart', !(await named(c, 'Memory')) && (await c.h.locator('[data-group-row]', { hasText: 'Memory' }).count()) === 0)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('and one ⌘Z brings the group and all three back', (await named(c, 'Memory'))?.members.length === 3 && (await named(c, 'Memory'))?.name === 'Memory')

  // 7e. A row that is not picked goes alone, and the picks are let go.
  await row(c, 'Interleaving beats blocking').click({ modifiers: ['Meta'] })
  await carry(c, row(c, "Mnemosyne's problem"), row(c, 'Interleaving beats blocking'), 0.9)
  await c.h.waitForTimeout(700)
  const alone = await order(c)
  check('an unpicked row goes alone and the picks are let go', (await picked(c)).length === 0 && alone.slice(0, 3).join('|') === "Who is the monster in Frankenstein?|Interleaving beats blocking|Mnemosyne's problem: how memory fades", alone.slice(0, 3).join(' | '))

  // 7f. Picked rows let go on the middle of a row outside any group: a new group of all of them.
  await row(c, 'Interleaving beats blocking').click({ modifiers: ['Meta'] })
  await row(c, "Mnemosyne's problem").click({ modifiers: ['Meta'] })
  await carry(c, row(c, "Mnemosyne's problem"), row(c, 'Who is the monster'), 0.5, {
    hold: async () => {
      await c.h.waitForTimeout(200)
      check('over a lone row, the label says a group of three', (await said(c)) === 'New group of 3', await said(c))
    }
  })
  await c.h.waitForTimeout(700)
  const fresh = (await groupsNow(c)).find((one) => one.name !== 'Memory' && one.name !== 'Reading')
  check('a new group of the target and both picked', fresh?.members.length === 3, String(fresh?.members.length))
  await c.h.keyboard.press('Escape')
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('and ⌘Z takes it apart again', (await groupsNow(c)).length === 2)

  // 7g. A group is two notes or more. Reading holds two: taking one out, by
  // any way, takes the group apart, its other note left where it was; ⌘Z
  // puts the group and both back.
  const apart = async (how, take) => {
    const before = await order(c)
    const at = before.indexOf('Reading list for October')
    await take()
    await c.h.waitForTimeout(900)
    const after = await order(c)
    // Archived, the note only steps out of sight: the group is drawn apart, and comes back with it.
    const gone = (how === 'archived' || !(await named(c, 'Reading'))) && (await c.h.locator('[data-group-row]', { hasText: 'Reading' }).count()) === 0
    check(`${how}: the group of one comes apart`, gone, JSON.stringify((await groupsNow(c)).map((one) => one.name)))
    check(`${how}: its last note stays where the group was`, Math.abs(after.indexOf('Reading list for October') - at) <= 1, `${at} → ${after.indexOf('Reading list for October')}`)
    await c.h.keyboard.press('Meta+z')
    await c.h.waitForTimeout(900)
    const back = await named(c, 'Reading')
    check(`${how}: one ⌘Z brings the group and both notes back`, back?.members.length === 2 && (await c.h.locator('[data-group-row]', { hasText: 'Reading' }).count()) === 1, JSON.stringify(back ?? null))
  }
  await apart('dragged out', async () => {
    await carry(c, row(c, 'Notes on Zettelkasten'), row(c, 'Who is the monster'), 0.9, { hold: async () => (await c.h.waitForTimeout(200), await frames(c, 'z-dissolve-drag', 2, 40)) })
    await frames(c, 'z-dissolve-going', 5, 40)
  })
  await apart('Remove from group', async () => {
    await row(c, 'Notes on Zettelkasten').click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[role="menuitem"]', { hasText: 'Remove from group' }).click()
  })
  await apart('Move to group', async () => {
    await row(c, 'Notes on Zettelkasten').click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Move to group' }).hover()
    await c.h.waitForTimeout(350)
    // Into the submenu by the keys, as a hand would glide there: its first line is Memory.
    await c.h.keyboard.press('ArrowRight')
    await c.h.waitForTimeout(150)
    await c.h.keyboard.press('Enter')
  })
  await apart('archived', async () => {
    await row(c, 'Notes on Zettelkasten').click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[role="menuitem"]', { hasText: /^Archive$/ }).click()
  })
  // And one row alone can never be a group.
  await c.h.mouse.move(900, 700)
  // The cursor on a row (j), nothing picked.
  await c.h.keyboard.press('j')
  await c.h.waitForTimeout(200)
  const count = (await groupsNow(c)).length
  await c.h.keyboard.press('Control+Meta+n')
  await c.h.waitForTimeout(500)
  check('⌃⌘N on one row makes no group', (await groupsNow(c)).length === count)
  await row(c, 'Interleaving beats blocking').click({ button: 'right' })
  await c.h.waitForTimeout(250)
  const single = await c.h.locator('[data-slot="context-menu-content"] [role="menuitem"]').allTextContents()
  check('one row\'s menu offers no new group of one', !single.some((one) => one.startsWith('New group')), single.join(' | '))
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(250)

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
if (c) await c.close()

// 10. A restart: names, colour, members and the fold kept. The hands. Then dark, and another sort.
c = process.env.ONLY ? null : await open()
if (c) try {
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
  // Several carried, in the dark: the stack at an edge, and the chip over a middle.
  await row(c, 'Interleaving beats blocking').click({ modifiers: ['Meta'] })
  await row(c, 'Who is the monster').click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'Who is the monster'), row(c, "Mnemosyne's problem"), 0.1, { up: false, hold: async () => (await c.h.waitForTimeout(250), await frames(c, 's-stack-dark', 2, 40)) })
  await c.h.mouse.move(400, 300, { steps: 6 })
  const lone = await row(c, 'Spaced repetition, a primer').boundingBox()
  await c.h.mouse.move(lone.x + 60, lone.y + lone.height / 2, { steps: 12 })
  await c.h.waitForTimeout(300)
  await frames(c, 't-stack-join-dark', 2, 40)
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)

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
if (c) await c.close()

// 11. Ideas with a kind filter on, several groups, and rows the filter hides in
// and between them: every row and group row drawn apart from every other, in a
// light and a dark theme, before and after drags, with nothing left moved.
const overlaps = (c) => c.h.evaluate(() => {
  const boxes = [...document.querySelectorAll('[data-row]:not([data-lifted] *), [data-group-row]:not([data-lifted] *)')]
    .map((el) => ({ name: el.textContent.slice(0, 24), box: el.getBoundingClientRect() })).filter((one) => one.box.height > 0)
  const bad = []
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].box, b = boxes[j].box
      if (a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`${boxes[i].name} / ${boxes[j].name}`)
    }
  // Panels: each group's apart from the next.
  const panels = [...document.querySelectorAll('[data-group-block]')].map((el) => el.getBoundingClientRect()).sort((a, b) => a.top - b.top)
  for (let i = 1; i < panels.length; i++) if (panels[i].top < panels[i - 1].bottom + 2) bad.push(`panels ${i - 1} and ${i} touch (${Math.round(panels[i].top - panels[i - 1].bottom)}px)`)
  // Nothing left moved once nothing is carried.
  for (const el of document.querySelectorAll('[data-sortable-id]')) if (el.style.transform) bad.push(`left moved: ${el.textContent.slice(0, 20)} ${el.style.transform}`)
  return bad
})
c = await open()
try {
  await c.h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'manual', group: 'none', filter: { kind: ['note'] }, density: 'list' })))
  await c.theme('light')
  await c.size(1100, 760)
  const all = await c.v('items', 'nugget')
  const notes = all.filter((one) => one.kind === 'note' && !one.archivedAt)
  const others = all.filter((one) => one.kind !== 'note' && !one.archivedAt)
  console.log(`ideas: ${all.length}, notes on show: ${notes.length}`)
  // Three groups the way the hand makes them, each left as New group: two notes picked, ⌃⌘N, Escape.
  await c.go('nuggets')
  await c.h.waitForTimeout(800)
  const titleOf = (one) => one.title.slice(0, 18)
  for (let g = 0; g < 3; g++) {
    const shown = (await order(c)).filter(Boolean)
    const free = notes.filter((one) => shown.some((t) => t.startsWith(titleOf(one)))).filter((one) => true)
    const ungrouped = []
    const grouped = new Set((await c.v('groups', 'nugget')).flatMap((one) => one.members))
    for (const one of free) if (!grouped.has(one.id)) ungrouped.push(one)
    await row(c, titleOf(ungrouped[g * 1])).click({ modifiers: ['Meta'] })
    await row(c, titleOf(ungrouped[g * 1 + 2])).click({ modifiers: ['Meta'] })
    await c.h.keyboard.press('Control+Meta+n')
    await c.h.waitForTimeout(500)
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(400)
  }
  // Rows the filter hides, inside the first group and between the groups, as a filter changed later would leave them.
  const unfiltered = async (on) => {
    await c.h.evaluate((on) => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'manual', group: 'none', filter: on ? { kind: ['note'] } : {}, density: 'list' })), on)
    await c.h.reload()
    await c.h.waitForTimeout(1500)
    await c.go('nuggets')
    await c.h.waitForTimeout(800)
  }
  await unfiltered(false)
  const hide = others.slice(0, 2)
  await carry(c, row(c, titleOf(hide[0])), c.h.locator('[data-group-block]').first().locator('[data-row]').first(), 0.5)
  await c.h.waitForTimeout(700)
  await carry(c, row(c, titleOf(hide[1])), c.h.locator('[data-group-row]').nth(1), 0.1)
  await c.h.waitForTimeout(700)
  await unfiltered(true)
  let groupsHere = await c.v('groups', 'nugget')
  check('a hidden row sits in the first group', groupsHere.some((one) => one.members.includes(hide[0].id)))
  const names = groupsHere.map((one) => one.name)
  check('three groups, each named apart', groupsHere.length === 3 && new Set(names).size === 3, JSON.stringify(names))
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(400)
  await frames(c, 'u-filtered-light', 1, 0)
  let bad = await overlaps(c)
  check('with a filter on, no rows overlap and panels keep apart', bad.length === 0, bad.slice(0, 4).join('; '))
  // Drag a free note into the second group's middle row, and look at the gap.
  const second = c.h.locator('[data-group-block]').nth(1)
  const member = second.locator('[data-row]').first()
  const outside = (await order(c)).filter(Boolean)
  const loose = notes.find((one) => !groupsHere.some((g) => g.members.includes(one.id)) && outside.some((t) => t.startsWith(titleOf(one))))
  const before = await member.boundingBox()
  await carry(c, row(c, titleOf(loose)), member, 0.5, {
    hold: async () => {
      await c.h.waitForTimeout(250)
      const next = await second.locator('[data-row]').nth(1).boundingBox().catch(() => null)
      const rowHeight = before.height
      const lifted = await member.boundingBox()
      const gap = next ? next.y - (lifted.y + lifted.height) : 0
      check('the room opened is one row', Math.abs(gap - rowHeight) < rowHeight * 0.5, `${Math.round(gap)} vs a row of ${Math.round(rowHeight)}`)
      await frames(c, 'v-filtered-join-light', 2, 40)
    }
  })
  await c.h.waitForTimeout(900)
  bad = await overlaps(c)
  check('after the drop nothing is left moved or overlapping', bad.length === 0, bad.slice(0, 4).join('; '))
  // Edge drops through the groups, then fold and unfold each, then look again.
  const shownNow = (await order(c)).filter(Boolean)
  await carry(c, row(c, shownNow[shownNow.length - 1].slice(0, 18)), row(c, shownNow[1].slice(0, 18)), 0.1)
  await c.h.waitForTimeout(800)
  for (let i = 0; i < 3; i++) { await c.h.locator('[data-group-row]').nth(i).click(); await c.h.waitForTimeout(350) }
  for (let i = 0; i < 3; i++) { await c.h.locator('[data-group-row]').nth(i).click(); await c.h.waitForTimeout(350) }
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(400)
  bad = await overlaps(c)
  check('after edge drops and folds, still nothing overlaps', bad.length === 0, bad.slice(0, 4).join('; '))
  await frames(c, 'w-filtered-after-light', 1, 0)

  // A slow pass down the whole list with a row in hand, sampled every 16ms:
  // one ghost the whole way, and a group's panel lit the whole time the
  // pointer is within it.
  {
    // A loose row in view, near the bottom, to carry up and then down across every group.
    const loose = await c.h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *)')].filter((one) => !one.closest('[data-group-block]')).map((one) => one.getBoundingClientRect()).filter((box) => box.bottom < innerHeight - 10).pop())
    const from = { x: loose.x, y: loose.y, height: loose.height }
    const top = await c.h.locator('[data-group-block]').first().boundingBox()
    await c.h.mouse.move(from.x + 60, from.y + from.height / 2)
    await c.h.mouse.down()
    await c.h.mouse.move(from.x + 60, from.y + from.height / 2 - 10, { steps: 4 })
    await c.h.mouse.move(from.x + 60, top.y - 20, { steps: 10 })
    await c.h.waitForTimeout(200)
    await c.h.evaluate(() => void (window.__ghost = document.querySelector('[data-ghost]')))
    let swapped = 0, dark = [], inside = null, since = 0, shots = 0
    for (let y = top.y - 20; y < 740; y += 3) {
      await c.h.mouse.move(from.x + 60, y)
      await c.h.waitForTimeout(16)
      const seen = await c.h.evaluate((y) => {
        const ghost = document.querySelector('[data-ghost]')
        const block = [...document.querySelectorAll('[data-group-block]')].find((one) => { const box = one.getBoundingClientRect(); return y > box.top + 2 && y < box.bottom - 2 })
        const panel = block?.querySelector('[data-panel]')
        return { same: !!ghost && ghost === window.__ghost, group: block?.dataset.groupBlock ?? null, lit: panel ? Number(getComputedStyle(panel).opacity) : null, label: document.querySelector('[data-drag-label]')?.textContent ?? '' }
      }, y)
      if (!seen.same) swapped++
      if (seen.group !== inside) (inside = seen.group, since = Date.now())
      else if (inside && Date.now() - since > 260 && seen.lit < 0.9) dark.push(`${Math.round(y)}: ${seen.lit} (${seen.label})`)
      if (inside && shots < 6 && Math.round(y) % 30 < 3) await frames(c, `y-sweep-${shots++}`, 1, 0)
    }
    await c.h.keyboard.press('Escape')
    await c.h.mouse.up()
    await c.h.waitForTimeout(400)
    check('one ghost the whole way down', swapped === 0, `${swapped} samples saw another`)
    check('a group\'s panel stays lit while the pointer is within it', dark.length === 0, dark.slice(0, 4).join('; '))
  }
  await c.theme('dark')
  await c.size(1100, 760)
  await c.go('nuggets')
  await c.h.waitForTimeout(900)
  await c.h.mouse.move(900, 700)
  bad = await overlaps(c)
  check('in the dark, nothing overlaps', bad.length === 0, bad.slice(0, 4).join('; '))
  await frames(c, 'x-filtered-dark', 1, 0)
  void others
} catch (error) {
  console.error(error)
  results.push(false)
}
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
