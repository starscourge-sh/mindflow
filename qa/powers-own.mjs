// In your own notes: ticks from real data, and Show me with nothing to point at offers the sandbox.
import { sandbox } from './sandbox-lib.mjs'
const out = process.env.OUT ?? `${process.env.QA_DATA}/shots`
const s = await sandbox({ width: 1200, height: 800, seeded: false })
let fails = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) fails++ }
try {
  await s.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false })
  await s.h.reload(); await s.h.waitForTimeout(1500)
  await s.h.keyboard.press('Escape')
  const q = await s.v('question:new', 'Who is the monster?')
  await s.v('clue', q, 'The creature reads Paradise Lost')
  await s.v('tag:set', 'bug', { action: true })
  await s.go('home')
  check('Home offers the page', await s.h.getByText(/See (what it can do|everything else Vigil can do)/).count() > 0)
  await s.h.screenshot({ path: `${out}/own-home.png` })
  await s.go('powers'); await s.h.waitForTimeout(1500)
  const ticked = await s.h.evaluate(() => [...document.querySelectorAll('[data-power]')].filter((card) => card.querySelector('[title="You have used this"]')).map((card) => card.dataset.power))
  check('ticks only what was used', ticked.includes('clue') && ticked.includes('questions') && !ticked.includes('book') && !ticked.includes('board'), ticked.join(','))
  check('tally shown', await s.h.getByText(/You have used \d+ of \d+/).count() === 1)
  await s.h.screenshot({ path: `${out}/own-top.png` })
  let offered = null
  for (const id of ['remind', 'later', 'routines', 'goals', 'bit']) {
    await s.go('powers')
    const card = s.h.locator(`[data-power="${id}"]`)
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: /Show me/ }).click()
    await s.h.waitForTimeout(3500)
    if (await s.h.getByText('Try in the sandbox').count() && id) { offered = id; break }
    await s.h.keyboard.press('Escape')
  }
  check('nothing to point at offers the sandbox', !!offered, offered ?? '')
  await s.h.screenshot({ path: `${out}/own-offer.png` })
  console.log('errors:', s.errors.join('\n'))
} finally { await s.close() }
process.exit(fails ? 1 : 0)
