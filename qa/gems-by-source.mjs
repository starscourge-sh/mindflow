// Gems grouped by source (the user, 6 Nov: "go"). Display › Grouping offers "Source" on Gems, where gems have
// sources: each section headed by its source (face or book mark, its person, "· N gems"), the heading opening the
// source's page; sections by their newest gem; sources with one gem gathered in "One gem each" (each row naming its
// source), gems with none last under "No source". Every density keeps the heads; 500 and 5,000 gems still draw.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/gems-by-source.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
const heads = () => h.evaluate(() => [...document.querySelectorAll('[data-group-head]')].map((one) => ({ name: one.dataset.groupHead, count: Number(one.dataset.groupCount), source: one.dataset.sourceHead ?? '', text: one.textContent, button: one.tagName === 'BUTTON', cursor: getComputedStyle(one).cursor })))
// Every head in the list, as a person scrolling it to the end would meet them (a long list draws only what is in view).
const allHeads = () => h.evaluate(async () => {
  let box = document.querySelector('[data-group-head]')
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const seen = []
  const read = () => { for (const one of document.querySelectorAll('[data-group-head]')) if (!seen.includes(one.dataset.groupHead)) seen.push(one.dataset.groupHead) }
  read()
  if (box) {
    for (let top = 0; top <= box.scrollHeight; top += box.clientHeight / 2) { box.scrollTop = top; await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); read() }
    box.scrollTop = 0
  }
  return seen
})
const setView = (patch) => h.evaluate((patch) => {
  const was = JSON.parse(localStorage.getItem('view:nugget') ?? '{"sort":"newest","group":"kind","filter":{}}')
  localStorage.setItem('view:nugget', JSON.stringify({ ...was, ...patch }))
}, patch)
// Home first, then the view set: the list going away keeps its own view as it leaves.
const open = async (patch) => { await setView(patch); await h.reload(); await h.waitForTimeout(1500); await c.go('nuggets'); await waitFor(async () => (await heads()).length > 0) }
try {
  // Made in this order, so the newest gem is last: the Law Book's, then Seneca's, then Meditations'.
  const gem = (text, origin) => v('nugget:from', text, origin)
  await gem('The obstacle is the way', { medium: 'Meditations', attribution: 'Marcus Aurelius' })
  await gem('Waste no more time arguing what a good man should be', { medium: 'Meditations, p. 12', attribution: 'Marcus Aurelius' })
  await gem('A one-off from a website', { medium: 'example.com' })
  await gem('Another one-off', { medium: 'blog.net' })
  await gem('Luck is what happens when preparation meets opportunity', { attribution: 'Seneca' })
  await gem('We suffer more in imagination than in reality', { attribution: 'Seneca' })
  await gem('Equity follows the law', { medium: 'The Law Book' })
  await gem('He who does not trust enough will not be trusted', { medium: 'The Law Book' })
  await gem('You have power over your mind', { medium: 'meditations', attribution: 'Marcus Aurelius' })
  await gem('The best revenge is not to be like that', { medium: 'Meditations', attribution: 'Marcus Aurelius' })

  // Offered in Display where gems have sources, and picked there as a person picks it.
  await open({ group: 'kind', density: 'list', sort: 'newest' })
  await h.click('[data-display]')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[role=dialog]')))
  await h.evaluate(() => {
    const label = [...document.querySelectorAll('[role=dialog] *')].find((one) => one.childElementCount === 0 && one.textContent === 'Grouping')
    let row = label
    while (row && !row.querySelector('button')) row = row.parentElement
    row?.querySelector('button')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
  })
  await waitFor(() => h.evaluate(() => !!document.querySelector('[role=menu]')))
  const offered = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((one) => one.textContent.trim()))
  check('Display › Grouping offers "Source" beside Kind, None and Date', ['Kind', 'None', 'Date', 'Source'].every((one) => offered.includes(one)), JSON.stringify(offered))
  await h.locator('[role=menu] [role^=menuitem]', { hasText: /^Source$/ }).click()
  check('picking it groups the list by source, behind the Display sheet', await waitFor(async () => (await heads()).some((one) => one.source)), JSON.stringify((await heads()).map((one) => one.name)))
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')

  await open({ group: 'source', density: 'list' })
  const list = await heads()
  const whole = await allHeads()
  // Back at the top, the list draws its first rows again before they can be read.
  await waitFor(async () => (await heads()).some((one) => one.name === 'Seneca'))
  console.log(list.map((one) => `${one.name} ${one.count}${one.source ? ` (${one.source})` : ''}`).join(' | '))
  const names = list.map((one) => one.name)
  const at = (name) => names.indexOf(name)
  check('a section for each source with more than one gem', at('Meditations') >= 0 && at('The Law Book') >= 0 && at('Seneca') >= 0, names.join(', '))
  // As Sources files them: "Meditations, p. 12" is a page of its own there, so it is here (in "One gem each").
  check('sources go by their newest gem', at('Meditations') < at('The Law Book') && at('The Law Book') < at('Seneca'), names.join(', '))
  check('one-gem sources gather in "One gem each", after the sources', at('One gem each') > at('Seneca') && !names.includes('example.com') && !names.includes('blog.net'), names.join(', '))
  check('"No source" is last, after "One gem each"', whole.at(-1) === 'No source' && whole.at(-2) === 'One gem each', whole.join(', '))
  const meditations = list.find((one) => one.name === 'Meditations')
  check('a book heads with its mark, its person and its count', meditations?.source === 'medium' && /Marcus Aurelius/.test(meditations.text) && /· 3 gems/.test(meditations.text) && meditations.count === 3, meditations?.text)
  const seneca = list.find((one) => one.name === 'Seneca')
  check('a person heads with their face and count', seneca?.source === 'attribution' && /· 2 gems/.test(seneca.text) && (await h.evaluate(() => { const head = document.querySelector('[data-group-head="Seneca"]'); const mark = head?.firstElementChild; return !!mark && !mark.textContent.includes('Seneca') })), seneca?.text)
  check('source heads are buttons with the hand', list.filter((one) => one.source).every((one) => one.button && one.cursor === 'pointer'))
  // Rows in "One gem each" say where they are from.
  const said = await h.evaluate(async () => {
    // A long list draws what is in view: walked as a person scrolling to the end would.
    let box = document.querySelector('[data-group-head]')
    while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    const seen = new Set()
    for (let top = 0; box && top <= box.scrollHeight; top += box.clientHeight / 2) { box.scrollTop = top; await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); for (const one of document.querySelectorAll('[data-row-source]')) seen.add(one.textContent) }
    if (box) box.scrollTop = 0
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return [...seen]
  })
  check('rows in "One gem each" name their source', said.includes('example.com') && said.includes('blog.net'), JSON.stringify(said))
  // The order a person reads is the order the rows come in.
  const order = await h.evaluate(() => [...document.querySelectorAll('[data-group-head], [data-row]')].map((one) => one.dataset.groupHead ? `#${one.dataset.groupHead}` : 'row'))
  check('every section\'s rows come under its head', order[0]?.startsWith('#') && order.some((one) => one === 'row'), order.slice(0, 8).join(' '))
  if (shots) await c.both(join(shots, 'gems-by-source-list'))

  // Each density keeps the heads.
  for (const density of ['grid', 'small', 'compact']) {
    await open({ group: 'source', density })
    const now = await allHeads()
    check(`${density}: the same sections`, now.join() === whole.join(), now.join())
    if (shots) await c.both(join(shots, `gems-by-source-${density}`))
  }

  // Keyboard: ↓ steps from the first row, ⌘A picks every gem on show, Esc lets go.
  await open({ group: 'source', density: 'list' })
  await h.mouse.move(5, 5)
  await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(200)
  const first = await h.evaluate(() => document.querySelector('[data-row][data-cursor]')?.textContent?.slice(0, 60) ?? '')
  check('↓ starts on the first section\'s first row', /not to be like that/.test(first), first)
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(300)
  const picked = await h.evaluate(() => document.querySelectorAll('[data-row][data-picked], [data-row][aria-selected="true"]').length)
  check('⌘A picks the rows on show', picked >= 9, picked)
  await h.keyboard.press('Escape')

  // The head opens the source's page in Sources.
  await h.click('[data-group-head="Meditations"]')
  check('clicking a head opens its page in Sources', await waitFor(() => h.evaluate(() => document.querySelector('[data-source-name]')?.textContent?.includes('Meditations') ?? false)))
  if (shots) await h.screenshot({ path: join(shots, 'gems-by-source-opened.png') })

  // Writing never offers it.
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'source', filter: {} })))
  await c.go('articles')
  await h.waitForTimeout(800)
  check('Writing has no source sections', !(await h.evaluate(() => !!document.querySelector('[data-source-head]'))))

  // Filtered by Saved: Older, under date headings: the gems from before the last 30 days, each under its year; a filter
  // kept with an old word ("This year", before the spans were renamed) reads as Older too.
  for (const when of ['Older', 'This year']) {
    await open({ group: 'date', density: 'list', filter: { when: [when] } })
    const years = await allHeads()
    check(`Saved: ${when} shows the gems from past years, each under its year`, years.length > 0 && years.every((one) => /^\d{4}$/.test(one)), JSON.stringify(years))
  }
  await open({ filter: {} })

  // At scale: 500 then 5,000 gems, a hundred books and many one-off sites among them.
  for (const total of [500, 5000]) {
    const have = await v('items', 'nugget').then((all) => all.length)
    const add = total - have
    await h.evaluate(async (add) => {
      for (let i = 0; i < add; i++) {
        const book = i % 3 === 0 ? { medium: `Book ${i % 100}`, attribution: `Author ${i % 100}` } : i % 3 === 1 ? { medium: `site-${i}.example` } : {}
        await window.api.haligtree('nugget:from', `Gem ${i} at scale`, book)
      }
    }, add)
    const started = Date.now()
    await open({ group: 'source', density: 'list' })
    const took = Date.now() - started
    const now = await allHeads()
    check(`${total} gems: drawn with their sections in ${took} ms, "One gem each" and "No source" last`, now.length > 3 && took < 8000 && now.at(-1) === 'No source' && now.at(-2) === 'One gem each', `${now.length} sections: ${now.slice(0, 3).join(', ')} … ${now.slice(-2).join(', ')}`)
    if (shots) await c.both(join(shots, `gems-by-source-${total}`))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
