// Folding a sidebar group while one of its places is open: the open place
// stays under the heading without flying up and dropping back in. Each frame
// of the fold, every copy of its row on screen sits no higher than where it
// ends up, under the heading.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/fold-current.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 900 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const heading = (name) => h.locator('aside nav button[aria-expanded]', { hasText: name }).first()
const row = (label) => h.locator(`aside nav button[data-side-row][aria-label="${label}"]`).first()

for (const [group, place] of [['Saved', 'Gems'], ['Saved', 'Questions'], ['Tasks', 'Today']]) {
  if ((await heading(group).getAttribute('aria-expanded')) !== 'true') { await heading(group).click(); await wait(700) }
  await row(place).click()
  await wait(700)
  // Each frame for 900ms after the click: the top of every copy of the row on screen.
  const frames = await h.evaluate(async ({ group, place }) => {
    const head = [...document.querySelectorAll('aside nav button[aria-expanded]')].find((one) => one.textContent.trim().startsWith(group))
    const tops = []
    head.click()
    const start = performance.now()
    while (performance.now() - start < 900) {
      await new Promise((done) => requestAnimationFrame(done))
      tops.push([...document.querySelectorAll(`aside nav button[data-side-row][aria-label="${place}"]`)]
        .filter((one) => !one.closest('[inert]') && one.getBoundingClientRect().height > 0)
        .map((one) => Math.round(one.getBoundingClientRect().top)))
    }
    return { tops, headBottom: Math.round(head.getBoundingClientRect().bottom) }
  }, { group, place })
  const last = frames.tops.at(-1)
  const end = last?.[0]
  const above = frames.tops.flat().filter((top) => top < end - 2)
  check(`${group} folded on ${place}: it ends under the heading, once`, last?.length === 1 && end >= frames.headBottom - 2, `${JSON.stringify(last)}, heading ends ${frames.headBottom}`)
  check(`${group} folded on ${place}: no frame has it above where it lands`, above.length === 0, above.length ? `highest ${Math.min(...above)} vs ${end}` : `lands at ${end}`)
  await heading(group).click()
  await wait(700)
}

await c.close?.()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
