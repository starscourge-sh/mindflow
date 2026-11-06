// One table standard (the user, 6 Nov: "I also like the table you have on the deleted tab (the Bin). Why does it seem
// like you are using a different standard when displaying the table on the cards/review screen?"). Review › All cards,
// in List and in Table, draws the Bin's rows (table-look.tsx): the same row height, the same quiet first column at the
// same left edge and width, the name in the same type, the last column flush with the same right edge, the same hover
// and picked tint; Table's column heads sit over their columns. Frames beside the Bin, light and dark, Paper and Satin.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/one-table.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
// A row as drawn: its box, its first column's box and type, the name's type, the last column's right edge, its fills.
const measure = (rowSel, leadSel, nameSel, whenSel) => h.evaluate(([rowSel, leadSel, nameSel, whenSel]) => {
  const row = document.querySelector(rowSel)
  if (!row) return null
  const box = row.getBoundingClientRect()
  const lead = row.querySelector(leadSel)
  const name = row.querySelector(nameSel)
  const when = [...row.querySelectorAll(whenSel)].at(-1)
  const style = (el) => (el ? { size: getComputedStyle(el).fontSize, colour: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight } : null)
  return {
    height: Math.round(box.height), padLeft: getComputedStyle(row).paddingLeft, radius: getComputedStyle(row).borderTopLeftRadius, cursor: getComputedStyle(row).cursor,
    leadX: lead ? Math.round(lead.getBoundingClientRect().left - box.left) : null, leadW: lead ? Math.round(lead.getBoundingClientRect().width) : null, lead: style(lead),
    nameX: name ? Math.round(name.getBoundingClientRect().left - box.left) : null, name: style(name),
    whenRight: when ? Math.round(box.right - when.getBoundingClientRect().right) : null, when: style(when)
  }
}, [rowSel, leadSel, nameSel, whenSel])
const fillOf = (sel) => h.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, sel)
const setCards = (patch) => h.evaluate((patch) => {
  const was = JSON.parse(localStorage.getItem('view:cards') ?? '{"sort":"due","group":"none","filter":{}}')
  localStorage.setItem('view:cards', JSON.stringify({ ...was, ...patch }))
}, patch)
const openCards = async (density) => {
  await setCards({ density, group: 'none' })
  await c.go('home')
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-list] [data-pick]')), 15000)
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)
}
try {
  // Something in the Bin: two gems.
  const one = await v('nugget:from', 'A gem for the Bin', {})
  const two = await v('nugget:from', 'Another gem for the Bin', {})
  await v('bin:put', one)
  await v('bin:put', two)
  await c.go('discarded')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-bin] [data-bin-row]')))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)
  const bin = await measure('[data-bin] [data-bin-row]', '[data-table-lead], span.w-24', '.private-text', 'button')
  // The Bin's last column is its button; its date sits just before it. What lines up across tables is the row's right edge.
  const binDate = await h.evaluate(() => { const row = document.querySelector('[data-bin] [data-bin-row]'); const when = row.querySelector('[data-table-when]') ?? [...row.children].at(-2); return { size: getComputedStyle(when).fontSize, colour: getComputedStyle(when).color } })
  console.log('Bin', JSON.stringify(bin))
  await h.hover('[data-bin] [data-bin-row]')
  await h.waitForTimeout(250)
  const binHover = await fillOf('[data-bin] [data-bin-row]')
  if (shots) await c.both(join(shots, 'one-table-bin'))

  for (const [density, said] of [['list', 'List'], ['compact', 'Table']]) {
    await openCards(density)
    const cards = await measure('[data-card-list] [data-pick]', '[data-table-lead]', '[data-card-list] [data-pick] > span:nth-child(2), [data-table-name]', '[data-table-when]')
    console.log(said, JSON.stringify(cards))
    check(`${said}: rows as tall as the Bin's (${bin.height}px)`, cards && Math.abs(cards.height - bin.height) <= 1, cards?.height)
    check(`${said}: the same inset and corner as the Bin's rows`, cards?.padLeft === bin.padLeft && cards?.radius === bin.radius, `${cards?.padLeft}/${cards?.radius} vs ${bin.padLeft}/${bin.radius}`)
    check(`${said}: the quiet first column where the Bin's is, as wide, in its type`, cards?.leadX === bin.leadX && cards?.leadW === bin.leadW && cards?.lead?.size === bin.lead?.size && cards?.lead?.colour === bin.lead?.colour, `${JSON.stringify([cards?.leadX, cards?.leadW, cards?.lead])} vs ${JSON.stringify([bin.leadX, bin.leadW, bin.lead])}`)
    check(`${said}: the name starts where the Bin's does, in the Bin's size`, cards?.nameX === bin.nameX && cards?.name?.size === bin.name?.size, `${cards?.nameX}/${cards?.name?.size} vs ${bin.nameX}/${bin.name?.size}`)
    check(`${said}: the last column ends at the row's padding, as the Bin's does`, cards?.whenRight === bin.whenRight && cards?.when?.size === binDate.size, `${cards?.whenRight}/${cards?.when?.size} vs ${bin.whenRight}/${binDate.size}`)
    const cut = await h.evaluate(() => [...document.querySelectorAll('[data-card-list] [data-table-lead]')].filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent))
    check(`${said}: no stage word is cut off`, !cut.length, JSON.stringify(cut.slice(0, 3)))
    check(`${said}: rows show the hand`, cards?.cursor === 'pointer' && bin.cursor === 'pointer', `${cards?.cursor} / ${bin.cursor}`)
    await h.hover('[data-card-list] [data-pick]')
    await h.waitForTimeout(250)
    check(`${said}: the Bin's hover`, (await fillOf('[data-card-list] [data-pick]')) === binHover, `${await fillOf('[data-card-list] [data-pick]')} vs ${binHover}`)
    if (density === 'compact') {
      // The column heads over their columns.
      const heads = await h.evaluate(() => {
        const head = document.querySelector('[data-table-head]')
        const row = document.querySelector('[data-card-list] [data-pick]')
        if (!head || !row) return null
        const at = (el) => Math.round(el.getBoundingClientRect().left)
        const cols = [...head.children].map((one) => ({ label: one.textContent, x: at(one) }))
        return { cols, lead: at(row.querySelector('[data-table-lead]')), answer: at(row.querySelector('[data-card-answer]')), when: Math.round(row.querySelector('[data-table-when]').getBoundingClientRect().right), headWhen: Math.round(head.lastElementChild.getBoundingClientRect().right), size: getComputedStyle(head).fontSize }
      })
      check('Table: column heads sit over their columns', heads && heads.cols[0].x === heads.lead && heads.cols[2].x === heads.answer && heads.headWhen === heads.when, JSON.stringify(heads))
      check('Table: heads in the first column\'s quiet type', heads?.size === bin.lead?.size, `${heads?.size} vs ${bin.lead?.size}`)
    }
    // Picked with ⌘-click: the Bin's picked tint.
    await h.click('[data-card-list] [data-pick]', { modifiers: ['Meta'] })
    await h.mouse.move(5, 5)
    await h.waitForTimeout(250)
    const picked = await fillOf('[data-card-list] [data-pick]')
    await c.go('discarded')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-bin] [data-bin-row]')))
    await h.click('[data-bin] [data-bin-row] [data-table-lead], [data-bin] [data-bin-row] span.w-24', { modifiers: ['Meta'] })
    await h.mouse.move(5, 5)
    await h.waitForTimeout(250)
    const binPicked = await fillOf('[data-bin] [data-bin-row]')
    check(`${said}: picked rows wear the Bin's picked tint`, picked === binPicked, `${picked} vs ${binPicked}`)
    await h.keyboard.press('Escape')
    if (shots) {
      await openCards(density)
      await c.both(join(shots, `one-table-cards-${density}`))
    }
  }
  if (shots) {
    // Review's two finishes, Satin and Paper, each light and dark.
    await openCards('compact')
    for (const to of ['satin', 'paper']) {
      await h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), to)
      await c.both(join(shots, `one-table-cards-compact-${to}`))
    }
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
