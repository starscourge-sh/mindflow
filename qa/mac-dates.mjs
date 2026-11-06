// Dates and times lit while writing (every Mac): typed into a note, a Journal day and an old note,
// "Friday at 3pm" and "14 Nov" are lit and resting on one says the day it means (an old note's
// "tomorrow" is the day after it was written); "the 1960s" and "a second" are not; quick capture
// keeps its own lighting; the Settings switch turns it off in an open note at once and back on.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-dates.mjs
// SHOT=<folder> keeps pictures, light and dark.
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, electron, page } = c
const DAY = 86_400_000
const clock = (offset) => electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
const lit = () => h.evaluate(() => [...document.querySelectorAll('.tiptap .mf-date-word')].map((one) => one.textContent))
const open = async (id) => {
  await c.send('capture', id)
  await h.waitForTimeout(1500)
}
const tipOn = async (text) => {
  const box = await h.evaluate((text) => {
    const one = [...document.querySelectorAll('.tiptap .mf-date-word')].find((el) => el.textContent === text)
    const r = one?.getBoundingClientRect()
    return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, text)
  if (!box) return null
  await h.mouse.move(box.x - 200, box.y - 120)
  await h.mouse.move(box.x, box.y, { steps: 4 })
  await h.waitForTimeout(1400)
  const said = await h.evaluate(() => [...document.querySelectorAll('[data-title-tips]')].map((one) => one.textContent).join(' | '))
  const floating = await h.evaluate(() => document.querySelectorAll('[data-title-tips], [data-note-preview], [role="menu"]').length)
  await h.mouse.move(5, 5)
  return { said, floating }
}
try {
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await open(id)
  await h.click('.tiptap.ProseMirror')
  await h.keyboard.press('End')
  await h.keyboard.type('Seminar on Friday at 3pm, essay due 14 Nov. The 1960s were a second wind.', { delay: 12 })
  await h.waitForTimeout(300)
  const words = await lit()
  check('a note lights “Friday at 3pm” and “14 Nov” as they are typed, and nothing else', JSON.stringify(words) === JSON.stringify(['Friday at 3pm', '14 Nov']), JSON.stringify(words))
  const tip = await tipOn('14 Nov')
  check('resting on “14 Nov” says its day in full, and only that floats', /\w+day 14 November/.test(tip?.said ?? '') && tip.floating === 1, JSON.stringify(tip))
  await h.waitForTimeout(2500)
  const kept = await h.evaluate(async (id) => JSON.stringify((await window.api.captures.get(id))?.body ?? ''), id)
  check('the words are kept as typed: nothing is written into the note', kept.includes('Seminar on Friday at 3pm, essay due 14 Nov') && !kept.includes('date'), kept.slice(0, 200))
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/dates-note`)

  // An old note: "tomorrow" is the day after it was written.
  await clock(-40 * DAY)
  const old = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hand in the draft tomorrow.' }] }] } }))
  await clock(0)
  await open(old)
  const was = new Date(Date.now() - 39 * DAY)
  const want = `${was.toLocaleDateString('en-GB', { weekday: 'long' })} ${was.getDate()} ${was.toLocaleDateString('en-GB', { month: 'long' })}`
  const oldTip = await tipOn('tomorrow')
  check(`an old note’s “tomorrow” says the day after it was written (${want})`, (oldTip?.said ?? '').includes(want), JSON.stringify(oldTip))

  // The Journal's day.
  await c.go('day')
  await h.waitForTimeout(800)
  const journal = await h.evaluate(() => !!document.querySelector('.tiptap.ProseMirror'))
  if (journal) {
    await h.click('.tiptap.ProseMirror')
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.press('Enter')
    await h.keyboard.type('Lunch with Ana at noon', { delay: 12 })
    await h.waitForTimeout(300)
  }
  check('a Journal day lights “noon” too, and never a bare “today”', journal && (await lit()).includes('noon') && !(await lit()).some((one) => /^today$/i.test(one)), JSON.stringify(await lit()))

  // Quick capture lights its own words: nothing twice.
  await page.click('.tiptap.ProseMirror').catch(() => {})
  await page.keyboard.type('call mum tomorrow 5pm', { delay: 12 })
  await page.waitForTimeout(500)
  const box = await page.evaluate(() => ({ ours: document.querySelectorAll('.mf-date-word').length, its: document.querySelectorAll('.box-token').length }))
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  check('quick capture keeps its own lighting, never a second', box.ours === 0 && box.its > 0, JSON.stringify(box))

  // The switch: off, then on, in the open note at once.
  await open(id)
  await v('settings:set', { datesLit: false }).catch(() => h.evaluate(() => window.api.settings?.set?.({ datesLit: false })))
  await h.waitForTimeout(800)
  const off = (await lit()).length
  await v('settings:set', { datesLit: true }).catch(() => h.evaluate(() => window.api.settings?.set?.({ datesLit: true })))
  await h.waitForTimeout(800)
  const on = (await lit()).length
  check('Settings › “Dates and times lit” off takes the light away at once, and on brings it back', off === 0 && on === 2, `off ${off}, on ${on}`)

  // Settings shows the switch with its sample.
  await c.go('settings')
  await h.evaluate(() => document.querySelector('[data-section="Writing"]')?.click())
  await h.waitForTimeout(600)
  const row = await h.evaluate(() => {
    const one = [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.includes('Dates and times lit'))
    one?.scrollIntoView({ block: 'center' })
    return one ? { sample: !!one.querySelector('[data-preview="dates-lit"] .mf-date-word'), switch: !!one.querySelector('[role="switch"]') } : null
  })
  check('Settings › Writing has “Dates and times lit”, its sample lit', row?.sample && row?.switch, JSON.stringify(row))
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/dates-setting`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
