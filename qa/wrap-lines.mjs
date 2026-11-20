// Wrapped's lead-ins written on this Mac (main/wrap-lines.ts): someone opens this month's wrap, turns every card, closes
// it and opens it again. With the Mac's model stood in (HALIGTREE_QA_CAPS=ai), pages show the stand-in's lead-ins over
// their own sentences, no lead-in holds a digit, the stand-in's lead-in with numbers in it is dropped (that page shows its
// sentence alone), the pages' own sentences and their numbers are untouched, and the second open shows the same lead-ins.
// Without it (HALIGTREE_QA_CAPS=macos26), no page has a lead-in.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_CAPS=ai node qa/wrap-lines.mjs
//   (and again with HALIGTREE_QA_CAPS=macos26 on a fresh copy)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const ai = process.env.HALIGTREE_QA_CAPS === 'ai'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const month = `month:${new Date().toISOString().slice(0, 7)}`

// Opens the month's wrap and turns every card, reading each card's lead-in and the rest of its words apart.
const walk = async () => {
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: id })), month)
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  const seen = {}
  for (let i = 0; i < 14; i++) {
    await wait(i ? 2600 : 3200)
    const card = await h.$eval('[data-wrap-card]', (el) => el.getAttribute('data-wrap-card'))
    seen[card] = await h.$eval('[data-wrap-card]', (el) => {
      const lead = el.querySelector('[data-wrap-lead]')
      const all = el.innerText.replace(/\s+/g, ' ').trim()
      const said = lead?.innerText.trim() ?? null
      return { lead: said, rest: said ? all.replace(said, '') : all }
    })
    if (card === 'report') break
    await h.keyboard.press('ArrowRight')
  }
  await h.keyboard.press('Escape')
  await wait(600)
  return seen
}

try {
  const first = await walk()
  const leads = Object.entries(first).filter(([, one]) => one.lead)
  if (ai) {
    // A later open of the same month: the stand-in's lead-ins were written while the first open's cards turned.
    const second = await walk()
    check('pages show the lead-ins written on this Mac (the stand-in\'s)', leads.length >= 2 && leads.every(([, one]) => one.lead.includes("stand-in's lead")), JSON.stringify(first).slice(0, 600))
    check('no lead-in holds a digit, and the stand-in\'s one with numbers in it is not shown', [...Object.values(first), ...Object.values(second)].every((one) => !one.lead || !/\d/.test(one.lead)) && !JSON.stringify([first, second]).includes('the stand-in counted'), JSON.stringify(first.intro ?? {}))
    check('the pages\' own sentences stand as they were, numbers and all', Object.values(first).every((one) => !one.rest.includes('stand-in')) && (!first.tags || /came up most: \d/.test(first.tags.rest) || /\d+ things? caught/.test(first.tags.rest)), JSON.stringify(first.tags ?? {}).slice(0, 300))
    const kept = JSON.parse(readFileSync(join(await electron.evaluate(({ app }) => app.getPath('userData')), 'wrap-leads.json'), 'utf8'))[month]
    check('every kept lead-in is free of digits, and its facts too', Object.keys(kept.leads).length >= 2 && Object.values(kept.leads).every((one) => !/\d/.test(one)) && !/\d/.test(kept.facts.replace(/“[^”]*”|#\S+/g, '')), JSON.stringify(kept.leads))
    const again = Object.entries(second).filter(([card, one]) => one.lead && first[card]?.lead)
    check('opened again, the same pages show the same lead-ins', again.length >= 2 && again.every(([card, one]) => one.lead === first[card].lead), JSON.stringify(again).slice(0, 400))
  } else {
    check('without Apple Intelligence no page has a lead-in, each shows its own sentence', Object.keys(first).length >= 3 && !leads.length && !JSON.stringify(first).includes('stand-in'), JSON.stringify(first).slice(0, 600))
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
