// Groups in a kept list, end to end, with frames of every change as it
// happens: a drag over a row's middle (the group about to form) and near its
// edge (only a line), a note carried out of its group, a group forming,
// picking rows with ⌘-click and the menu that speaks for them, ⌃⌘N, ← and →
// on a group's row, folding, Separate and its Undo; then a restart to see it
// all kept, the hand cursors, a dark theme, and the chips another sort shows.
//
//   npx electron-vite build --outDir out-groups
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-groups/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/groups.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const TITLES = ['Spaced repetition, a primer', 'How memory palaces work', 'Reading list for October', 'Notes on Zettelkasten', 'The forgetting curve', 'Interleaving beats blocking']

const open = async (fresh = true) => {
  const c = await sandbox({ width: 1100, height: 760 })
  // From a book with no folders yet: the sandbox's own are taken away, their notes left where they are.
  if (fresh) for (const list of ['article', 'nugget']) for (const group of await c.v('groups', list)) await c.v('groups:delete', group.id)
  // Your own order, as a list: where groups show.
  await c.h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  return c
}
const articles = async (c) => { await c.go('articles'); await c.h.waitForTimeout(600) }
const row = (c, title) => c.h.locator('button[data-row]', { hasText: title }).first()
// The sandbox's own pages fill the list past the window, which draws only the rows near the screen: scrolled to until drawn.
const reach = async (c, title) => {
  const one = row(c, title)
  if (await one.count()) return one
  await c.h.evaluate(() => { let box = document.querySelector('[data-pane] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; if (box) box.scrollTop = 0 })
  for (let i = 0; i < 30 && !(await one.count()); i++) {
    await c.h.mouse.move(700, 450)
    await c.h.mouse.wheel(0, 300)
    await c.h.waitForTimeout(120)
  }
  await one.scrollIntoViewIfNeeded().catch(() => {})
  return one
}
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
  // Pressed where the row is on screen: a row picked further up can be scrolled off by the time it is carried.
  const off = await from.evaluate((el) => { const box = el.getBoundingClientRect(); return box.top < 0 || box.bottom > innerHeight })
  if (off) await from.scrollIntoViewIfNeeded().catch(() => {})
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2)
  if (shift) await c.h.keyboard.down('Shift')
  await c.h.mouse.down()
  // The first nudge already heads for the target, as a hand's would: a nudge the other way scrolls the list away from it.
  await c.h.mouse.move(a.x + 60, a.y + a.height / 2 + (b.y + b.height * at < a.y + a.height / 2 ? -8 : 8), { steps: 4 })
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
      // Aimed again where the row has slid to once the group closed over the carried one's place: by where it was, the
      // pointer could land on a row that slid under it, and the label then named a different drop.
      await c.h.waitForTimeout(300)
      const there = await row(c, "Mnemosyne's problem").boundingBox()
      await c.h.mouse.move(there.x + 60, there.y + there.height * 0.85, { steps: 6 })
      await c.h.waitForTimeout(300)
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
  await (await reach(c, 'Notes on Zettelkasten')).click({ modifiers: ['Meta'] })
  await (await reach(c, 'Reading list for October')).click({ modifiers: ['Meta'] })
  await c.h.waitForTimeout(250)
  await c.h.mouse.move(900, 700)
  await frames(c, 'f-picked', 1, 0)
  await (await reach(c, 'Reading list for October')).click({ button: 'right' })
  await c.h.waitForTimeout(250)
  // The copies sit under Copy: open it so its lines are read too.
  await c.h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: /^Copy$/ }).hover().catch(() => {})
  await c.h.waitForTimeout(300)
  const lines = await c.h.locator('[data-slot="context-menu-content"] [role="menuitem"], [data-slot="context-menu-sub-content"] [role="menuitem"]').allTextContents()
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

  // 7b. Several picked move together. ⌘-click three, then carry one of them, ⇧ held down.
  await c.h.mouse.move(900, 700)
  await (await reach(c, "Mnemosyne's problem")).click({ modifiers: ['Meta'] })
  // ⌘-click each: the sandbox's own rows, dated from today, can fall between two of these, so a ⇧-click range would take them too.
  await (await reach(c, 'What The Matrix gets right')).click({ modifiers: ['Meta'] })
  await (await reach(c, 'Interleaving beats blocking')).click({ modifiers: ['Meta'] })
  await c.h.waitForTimeout(200)
  check('⌘-click picks three', (await picked(c)).length === 3, JSON.stringify(await picked(c)))
  await carry(c, row(c, 'What The Matrix gets right'), row(c, 'Spaced repetition, a primer'), 0.5, {
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
  check('all three join the group, in their order', members.length === 6 && members.slice(1, 4).join('|') === 'Interleaving beats blocking|What The Matrix gets right about choosing|' + "Mnemosyne's problem: how memory fades", members.join(' | '))
  check('and the picks are let go', (await picked(c)).length === 0)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('one ⌘Z puts all three back', (await named(c, 'Memory'))?.members.length === 3)

  // 7c. Near an edge, the picked rows land there together, in their order.
  await (await reach(c, "Mnemosyne's problem")).click({ modifiers: ['Meta'] })
  await (await reach(c, 'What The Matrix gets right')).click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'What The Matrix gets right'), row(c, 'Interleaving beats blocking'), 0.1, {
    hold: async () => (await c.h.waitForTimeout(200), await frames(c, 'q-stack-edge', 3, 40))
  })
  await c.h.waitForTimeout(700)
  const rows = await order(c)
  check('two picked rows move to the edge together', rows.slice(0, 3).join('|') === "What The Matrix gets right about choosing|Mnemosyne's problem: how memory fades|Interleaving beats blocking", rows.slice(0, 3).join(' | '))

  // 7d. Two picked in a group, carried out: both leave it.
  await (await reach(c, 'Spaced repetition, a primer')).click({ modifiers: ['Meta'] })
  await (await reach(c, 'The forgetting curve')).click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'The forgetting curve'), row(c, 'Interleaving beats blocking'), 0.9, {
    hold: async () => {
      await c.h.waitForTimeout(200)
      check('carrying two out, the label counts them', (await said(c)) === 'Remove 2 from Memory', await said(c))
      await frames(c, 'r-stack-out', 3, 40)
    }
  })
  await c.h.waitForTimeout(700)
  // A group is a folder: left with one note, it stays.
  check('both leave, and the group stays with the one left', (await named(c, 'Memory'))?.members.length === 1 && (await c.h.locator('[data-group-row]', { hasText: 'Memory' }).count()) === 1)
  await c.h.keyboard.press('Meta+z')
  await c.h.waitForTimeout(800)
  check('and one ⌘Z brings the group and all three back', (await named(c, 'Memory'))?.members.length === 3 && (await named(c, 'Memory'))?.name === 'Memory')

  // 7e. A row that is not picked goes alone, and the picks are let go.
  await (await reach(c, 'Interleaving beats blocking')).click({ modifiers: ['Meta'] })
  await carry(c, row(c, "Mnemosyne's problem"), row(c, 'Interleaving beats blocking'), 0.9)
  await c.h.waitForTimeout(700)
  const alone = await order(c)
  check('an unpicked row goes alone and the picks are let go', (await picked(c)).length === 0 && alone.slice(0, 3).join('|') === "What The Matrix gets right about choosing|Interleaving beats blocking|Mnemosyne's problem: how memory fades", alone.slice(0, 3).join(' | '))

  // 7f. Picked rows let go on the middle of a row outside any group: a new group of all of them.
  await (await reach(c, 'Interleaving beats blocking')).click({ modifiers: ['Meta'] })
  await (await reach(c, "Mnemosyne's problem")).click({ modifiers: ['Meta'] })
  await carry(c, row(c, "Mnemosyne's problem"), row(c, 'What The Matrix gets right'), 0.5, {
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

  // 7g. A group is a folder: Reading holds two, and taking one out, by any
  // way, leaves it holding the other; ⌘Z puts both back.
  const apart = async (how, take) => {
    await take()
    await c.h.waitForTimeout(900)
    const left = await memberTitles(c, 'Reading')
    // Archived, the note only steps out of sight: it is still the group's.
    check(`${how}: the group stays, holding the other note`, left.includes('Reading list for October') && (how === 'archived' || left.length === 1) && (await c.h.locator('[data-group-row]', { hasText: 'Reading' }).count()) === 1, left.join(' | '))
    await c.h.keyboard.press('Meta+z')
    await c.h.waitForTimeout(900)
    const back = await named(c, 'Reading')
    check(`${how}: one ⌘Z brings both notes back`, back?.members.length === 2 && (await c.h.locator('[data-group-row]', { hasText: 'Reading' }).count()) === 1, JSON.stringify(back ?? null))
  }
  await apart('dragged out', async () => {
    await carry(c, row(c, 'Notes on Zettelkasten'), row(c, 'What The Matrix gets right'), 0.9, { hold: async () => (await c.h.waitForTimeout(200), await frames(c, 'z-dissolve-drag', 2, 40)) })
    await frames(c, 'z-dissolve-going', 5, 40)
  })
  await apart('Remove from group', async () => {
    await (await reach(c, 'Notes on Zettelkasten')).click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[role="menuitem"]', { hasText: 'Remove from group' }).click()
  })
  await apart('Move to group', async () => {
    await (await reach(c, 'Notes on Zettelkasten')).click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Move to group' }).hover()
    await c.h.waitForTimeout(350)
    // Into the submenu by the keys, as a hand would glide there: its first line is Memory.
    await c.h.keyboard.press('ArrowRight')
    await c.h.waitForTimeout(150)
    await c.h.keyboard.press('Enter')
  })
  await apart('archived', async () => {
    await (await reach(c, 'Notes on Zettelkasten')).click({ button: 'right' })
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
  await (await reach(c, 'Interleaving beats blocking')).click({ button: 'right' })
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
  check('and its count shows', /\b3$/.test((await head(c, 'Memory').locator('[data-count]').textContent()) ?? ''), await head(c, 'Memory').locator('[data-count]').textContent())
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
c = process.env.ONLY ? null : await open(false)
if (c) try {
  await articles(c)
  const memory = await named(c, 'Memory')
  check('after a restart the groups are kept', memory?.color === 'blue' && memory.members.length === 3 && memory.folded === 1 && !!(await named(c, 'Reading')), JSON.stringify(await groupsNow(c)))
  check('and Memory is still drawn folded', (await row(c, 'The forgetting curve').count()) === 0)
  const rest = await row(c, 'Interleaving beats blocking').evaluate((el) => getComputedStyle(el).cursor)
  check('a row at rest shows the plain arrow', rest === 'default', rest)
  // A faint grip at its left edge, only after a moment's rest on it.
  await row(c, 'Interleaving beats blocking').hover()
  await c.h.waitForTimeout(80)
  const early = await row(c, 'Interleaving beats blocking').evaluate((el) => Number(getComputedStyle(el.closest('[data-sortable-id]').querySelector('[data-grip]')).opacity))
  await c.h.waitForTimeout(700)
  const late = await row(c, 'Interleaving beats blocking').evaluate((el) => Number(getComputedStyle(el.closest('[data-sortable-id]').querySelector('[data-grip]')).opacity))
  check('the grip comes in only after resting a moment', early < 0.2 && late > 0.8, `${early} then ${late}`)
  await frames(c, 'grip-light', 1, 0)
  // The grip in the margin is the handle: the open hand over it.
  const gripCursor = await c.h.evaluate(() => { const g = document.querySelector('[data-sortable-id] [data-grip]'); return g ? getComputedStyle(g).cursor : 'no grip' })
  check('the grip shows the open hand', gripCursor === 'grab', gripCursor)
  // Pressed but not moved, as a click to open it: still the plain arrow.
  const box = await row(c, 'Interleaving beats blocking').boundingBox()
  await c.h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await c.h.mouse.down()
  const pressed = await c.h.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [box.x + box.width / 2, box.y + box.height / 2])
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)
  check('a row pressed to open it keeps the plain arrow', pressed === 'default', pressed)
  // That press opened it, as a click does: back to the list.
  await c.go('home')
  await articles(c)
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
  await carry(c, row(c, 'Interleaving beats blocking'), row(c, 'What The Matrix gets right'), 0.5, {
    up: false,
    hold: async () => (await c.h.waitForTimeout(250), await frames(c, 'a-middle-dark', 4, 40))
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(400)
  await carry(c, row(c, 'How memory palaces work'), row(c, 'What The Matrix gets right'), 0.85, {
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
  await (await reach(c, 'Interleaving beats blocking')).click({ modifiers: ['Meta'] })
  await (await reach(c, 'What The Matrix gets right')).click({ modifiers: ['Meta'] })
  await carry(c, row(c, 'What The Matrix gets right'), row(c, "Mnemosyne's problem"), 0.1, { up: false, hold: async () => (await c.h.waitForTimeout(250), await frames(c, 's-stack-dark', 2, 40)) })
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
  // In another sort the groups are still groups, kept together at the top, and nothing switches the sort.
  const heads = await c.h.locator('[data-group-row]').count()
  const firstRows = await c.h.evaluate(() => [...document.querySelectorAll('[data-group-row], [data-row]:not([data-lifted] *)')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => (one.hasAttribute('data-group-row') ? 'group' : 'row')))
  check('in another sort, groups still show as groups, at the top, with no chips', heads === 2 && firstRows[0] === 'group' && (await c.h.locator('[data-chip]').count()) === 0, firstRows.slice(0, 4).join(','))
  await c.h.mouse.move(900, 700)
  await frames(c, 'o-newest-dark', 1, 0)
  const loose = await c.h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *)')].filter((one) => !one.closest('[data-group-block]')).map((one) => one.textContent.slice(0, 16)))
  // A loose row carried to an edge between loose rows: it offers to move there in your own order, and Esc leaves the sort alone.
  await carry(c, row(c, loose[loose.length - 1]), row(c, loose[0]), 0.1, {
    up: false,
    hold: async () => (await c.h.waitForTimeout(200), await frames(c, 'o-edge-sorted', 1, 0), check('sorted, an edge between loose rows offers to switch to Custom order', (await c.h.locator('[data-drop-line]').count()) === 1 && (await said(c)) === 'Move here · Custom order', `${await c.h.locator('[data-drop-line]').count()} lines, says "${await said(c)}"`))
  })
  await c.h.keyboard.press('Escape')
  await c.h.mouse.up()
  await c.h.waitForTimeout(600)
  check('and the sort is still Newest', (await c.h.evaluate(() => JSON.parse(localStorage.getItem('view:article')).sort)) === 'newest')
  // Into a group by its middle still works, sorted or not.
  const grouped = (await groupsNow(c)).reduce((sum, one) => sum + one.members.length, 0)
  await carry(c, row(c, loose[0]), c.h.locator('[data-group-block]').first().locator('[data-row]').first(), 0.5)
  await c.h.waitForTimeout(700)
  check('sorted, a row still joins a group, and the sort stays', (await c.h.evaluate(() => JSON.parse(localStorage.getItem('view:article')).sort)) === 'newest' && (await groupsNow(c)).reduce((sum, one) => sum + one.members.length, 0) === grouped + 1)
  // ⌥↓ while sorted some other way asks, and leaves the sort alone.
  await c.h.mouse.move(900, 700)
  await c.h.keyboard.press('j')
  await c.h.keyboard.press('Alt+ArrowDown')
  await c.h.waitForTimeout(400)
  const asked = await c.h.evaluate(() => document.body.textContent.includes('Moving rows needs “Custom order”'))
  check('⌥↓ in another sort asks to switch, and the sort stays', asked && (await c.h.evaluate(() => JSON.parse(localStorage.getItem('view:article')).sort)) === 'newest')
  await frames(c, 'p-ask-dark', 1, 0)

  // As tiles: each group a folder card; a click opens it in place with a chip back.
  const tilesView = async (patch) => {
    await c.h.evaluate((patch) => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'grid', ...patch })), patch)
    await c.h.reload()
    await c.h.waitForTimeout(1500)
    await articles(c)
    await c.h.mouse.move(900, 700)
  }
  await tilesView({})
  check('in a grid, each group is a folder card', (await c.h.locator('[data-folder]').count()) === 2)
  await frames(c, 'q-folders-dark', 1, 0)
  await c.h.locator('[data-folder]').first().click()
  await c.h.waitForTimeout(500)
  const insideTiles = await c.h.locator('button[data-row]').count()
  check('a folder opens in place, with a chip back', (await c.h.locator('[data-folder-back]').count()) === 1 && insideTiles >= 2 && insideTiles <= 4 && (await c.h.locator('[data-folder]').count()) === 0, `${insideTiles} tiles`)
  await frames(c, 'r-folder-open-dark', 1, 0)
  await c.h.locator('[data-folder-back]').click()
  await c.h.waitForTimeout(500)
  check('and the chip goes back to the folders', (await c.h.locator('[data-folder]').count()) === 2)
  await c.theme('light')
  await c.size(1100, 760)
  await tilesView({ density: 'small' })
  await frames(c, 's-folders-small-light', 1, 0)
  await tilesView({})
  await frames(c, 't-folders-light', 1, 0)
  // Grouped by date, the list is cut into sections and says where the groups are. (Not by kind: Writing's pages are all
  // one kind, and one kind is drawn as no grouping at all, display.tsx, with the groups in the list as ever.)
  await tilesView({ density: 'list', group: 'date' })
  check('grouped by date, a quiet note says the groups show in the list view', (await c.h.locator('[data-groups-note]').count()) === 1)
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
  for (const el of document.querySelectorAll('[data-sortable-id]')) if (el.style.transform && el.style.transform !== 'none') bad.push(`left moved: ${el.textContent.slice(0, 20)} ${el.style.transform}`)
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
    // By id: two notes can share a name (the sandbox's #learn-haligtree cards), and the other may be in a group already.
    const byId = (one) => c.h.locator(`button[data-row][data-id="${one.id}"]`).first()
    await byId(ungrouped[g * 1]).click({ modifiers: ['Meta'] })
    await byId(ungrouped[g * 1 + 2]).click({ modifiers: ['Meta'] })
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
  // Two of them, far down the list (it draws only the rows near what shows): scrolled to, and moved by the menu, as a hand would from there.
  const hide = others.slice(0, 2)
  const reveal = async (title) => {
    if (!(await row(c, title).count())) await c.h.evaluate(() => { const box = document.querySelector('[data-row]')?.closest('.overflow-y-auto'); if (box) box.scrollTop = 0 })
    for (let i = 0; i < 40 && !(await row(c, title).count()); i++) {
      await c.h.evaluate(() => { const box = document.querySelector('[data-row]')?.closest('.overflow-y-auto'); if (box) box.scrollTop += box.clientHeight * 0.8 })
      await c.h.waitForTimeout(120)
    }
    await row(c, title).scrollIntoViewIfNeeded()
  }
  const moveTo = async (title, down) => {
    await reveal(title)
    await row(c, title).click({ button: 'right' })
    await c.h.waitForTimeout(250)
    await c.h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Move to group' }).hover()
    await c.h.waitForTimeout(350)
    await c.h.keyboard.press('ArrowRight')
    await c.h.waitForTimeout(150)
    for (let i = 0; i < down; i++) await c.h.keyboard.press('ArrowDown')
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(700)
  }
  // Into the first group.
  await moveTo(titleOf(hide[0]), 0)
  // Between the groups: into the second, then out of it, which leaves it just after.
  await moveTo(titleOf(hide[1]), 1)
  await reveal(titleOf(hide[1]))
  await row(c, titleOf(hide[1])).click({ button: 'right' })
  await c.h.waitForTimeout(250)
  await c.h.locator('[role="menuitem"]', { hasText: 'Remove from group' }).click()
  await c.h.waitForTimeout(700)
  check('a hidden row sits between the groups', await c.h.evaluate((id) => {
    const at = document.querySelector(`[data-row][data-id="${id}"]`)
    const blocks = [...document.querySelectorAll('[data-group-block]')]
    return !!at && !at.closest('[data-group-block]') && blocks.some((b) => b.compareDocumentPosition(at) & Node.DOCUMENT_POSITION_FOLLOWING) && blocks.some((b) => b.compareDocumentPosition(at) & Node.DOCUMENT_POSITION_PRECEDING)
  }, hide[1].id))
  await unfiltered(true)
  let groupsHere = await c.v('groups', 'nugget')
  check('a hidden row sits in the first group', groupsHere.some((one) => one.members.includes(hide[0].id)))
  const names = groupsHere.map((one) => one.name)
  check('three groups, each named apart', groupsHere.length === 3 && new Set(names).size === 3, JSON.stringify(names))
  await c.h.mouse.move(900, 700)
  await c.h.waitForTimeout(400)
  await frames(c, 'u-filtered-light', 1, 0)
  // The hint, once, the first time the list is in your own order.
  check('a one-time hint says rows can be carried', (await c.h.locator('[data-own-order-hint]').count()) === 1)
  await c.h.locator('[data-own-order-hint] button').click()
  await c.h.waitForTimeout(200)
  check('and Got it puts it away', (await c.h.locator('[data-own-order-hint]').count()) === 0)
  // Renamed, the new name shows at once and the old never flashes back.
  const old = (await c.h.locator('[data-group-row]').first().textContent()).trim()
  await c.h.locator('[data-group-row]').first().dblclick()
  await c.h.waitForTimeout(200)
  await c.h.keyboard.press('Meta+a')
  await c.h.keyboard.type('Planets')
  await c.h.keyboard.press('Enter')
  const seenNames = []
  for (let i = 0; i < 25; i++) { seenNames.push((await c.h.locator('[data-group-row]').first().textContent()).trim()); await c.h.waitForTimeout(16) }
  check('a new name shows at once and stays', seenNames.every((one) => one.startsWith('Planets')), `${old} → ${[...new Set(seenNames)].join(' / ')}`)
  // Only a chip itself toggles a filter; no second way to clear beside them.
  const chipsBox = await c.h.locator('button[aria-pressed]').last().boundingBox()
  const filterBefore = await c.h.evaluate(() => localStorage.getItem('view:nugget'))
  await c.h.mouse.click(chipsBox.x + chipsBox.width + 60, chipsBox.y + chipsBox.height / 2)
  await c.h.waitForTimeout(300)
  check('a click beside the chips changes nothing', (await c.h.evaluate(() => localStorage.getItem('view:nugget'))) === filterBefore)
  check('no separate clear button beside the chips', (await c.h.locator('[aria-label="Clear the filters"]').count()) === 0)
  // A private row's eye and a group's × sit on one line down the right.
  const firstGroup = c.h.locator('[data-group-block]').first()
  await c.v('private', 'nuggets', await firstGroup.locator('[data-row]').first().getAttribute('data-id'), true)
  await c.h.waitForTimeout(800)
  await firstGroup.locator('[data-group-row]').hover()
  await c.h.waitForTimeout(400)
  const columns = await c.h.evaluate(() => {
    const eye = [...document.querySelectorAll('[data-group-block] [data-row] .sr-only')].find((one) => one.textContent === 'Private')?.parentElement?.querySelector('svg')?.getBoundingClientRect()
    const cross = document.querySelector('[data-group-block] button[aria-label^="Separate"] svg')?.getBoundingClientRect()
    return eye && cross ? { eye: eye.left + eye.width / 2, cross: cross.left + cross.width / 2 } : null
  })
  check('the eye and the × share one column', !!columns && Math.abs(columns.eye - columns.cross) <= 2, JSON.stringify(columns))
  await frames(c, 'column-light', 1, 0)
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
