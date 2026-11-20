// Wrapped's lead-ins (main/wrap-lines.ts): each page's plain statement, written by the app, said again on this Mac in the
// voice of the story's look. Someone opens this month's wrap, turns every card, closes it and opens it again. With the
// Mac's model stood in (HALIGTREE_QA_CAPS=ai), pages show the stand-in's rephrasings over their own sentences, no lead-in
// holds a digit, the stand-in's rephrasing with numbers in it is dropped and that page shows its plain statement (never a
// blank), the pages' own sentences and their numbers are untouched, and the second open shows the same lead-ins.
// Without it (HALIGTREE_QA_CAPS=macos26, the default), only pages comparing with last time have one, the plain statement.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_CAPS=ai node qa/wrap-lines.mjs
//   (and again with HALIGTREE_QA_CAPS=macos26 on a fresh copy)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Unset, the app reads this Mac itself, which may have Apple Intelligence: the run without it then tested nothing it says.
process.env.HALIGTREE_QA_CAPS ||= 'macos26'
const ai = process.env.HALIGTREE_QA_CAPS === 'ai'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const month = `month:${new Date().toISOString().slice(0, 7)}`

// Opens the month's wrap and turns every card, reading each card's lead-in and the rest of its words apart.
const walk = async () => {
  // In the Files look both times, so both opens speak in its voice (pulp, every look's).
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world: 'files' } })), month)
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
    // The first open shows plain statements on cards seen before the rephrasings came; the second shows the kept ones.
    check('pages show the rephrasings written on this Mac (the stand-in\'s)', Object.values(second).filter((one) => one.lead?.includes('(stand-in)')).length >= 2, JSON.stringify(second).slice(0, 600))
    check('the stand-in\'s rephrasing with numbers in it is dropped: the opening shows its plain statement, and no lead-in holds a digit', /^You (caught|focused) (more than|less than|as much as) last month\.$/.test(second.intro?.lead ?? '') && [...Object.values(first), ...Object.values(second)].every((one) => !one.lead || !/\d/.test(one.lead)) && !JSON.stringify([first, second]).includes('the stand-in counted'), JSON.stringify(second.intro ?? {}))
    check('every page that has a statement shows a lead-in, never a blank', ['intro', 'tags', 'busiest', 'outro'].filter((card) => second[card]).every((card) => second[card].lead), JSON.stringify(Object.fromEntries(Object.entries(second).map(([card, one]) => [card, one.lead]))))
    check('the pages\' own sentences stand as they were, numbers and all', Object.values(first).every((one) => !one.rest.includes('stand-in')) && (!first.tags || /came up most: \d/.test(first.tags.rest) || /\d+ things? caught/.test(first.tags.rest)), JSON.stringify(first.tags ?? {}).slice(0, 300))
    const kept = JSON.parse(readFileSync(join(await electron.evaluate(({ app }) => app.getPath('userData')), 'wrap-leads.json'), 'utf8'))[month]
    const voices = Object.values(kept.leads)
    check('the lead-ins are kept by voice, each free of digits, and the statements too', voices.length >= 1 && voices.every((one) => Object.keys(one).length >= 2 && Object.values(one).every((line) => !/\d/.test(line))) && !/\d/.test(kept.facts.replace(/“[^”]*”|#\S+/g, '')), JSON.stringify(kept.leads).slice(0, 400))
    const again = Object.entries(second).filter(([card, one]) => one.lead && kept.leads.pulp?.[card])
    check('opened again, each page shows the lead-in kept for its voice at once', again.length >= 2 && again.every(([card, one]) => one.lead === kept.leads.pulp[card]), JSON.stringify(again).slice(0, 400))
  } else {
    // The plain statements are the app's own, so every Mac has them, but only where they compare with last time:
    // the opening and focus ("more than last month") and a tag new or up; never the tag, busiest day, hour or closing
    // page's lead-in, which would say again what the page's own sentence says.
    const against = /^(You (caught|focused) (more than|less than|as much as) last (week|month)\.|#\S+ (was new this (week|month)|came up more than last (week|month))\.)$/
    check('without Apple Intelligence a page has a lead-in only to compare with last time, never the stand-in\'s', Object.keys(first).length >= 3 && leads.every(([card, one]) => ['intro', 'tags', 'focus'].includes(card) && against.test(one.lead)) && !JSON.stringify(first).includes('stand-in'), JSON.stringify(leads).slice(0, 600))
    check('without it, the opening still says how it went against last time', !first.intro || against.test(first.intro.lead ?? ''), JSON.stringify(first.intro ?? {}).slice(0, 300))
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
