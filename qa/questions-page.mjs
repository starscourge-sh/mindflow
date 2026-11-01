// Questions is a page of its own, hung under Writing in the sidebar: Writing has no "All / Questions"
// switch and lists pages only; Questions lists each question with its answer (or "No answer yet") on a
// line of its own under it, says in words which list you are on, and switching its lists moves nothing
// (tabs, the line saying where you are, the list's top, the toolbar's buttons). Frames every 50ms
// through each switch, light and dark, go to QA_SHOTS when it is set.
//
//   npx electron-vite build --outDir out-wr
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/questions-page.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1300), height: 860 })
const { h, v, go, look, close, errors } = s
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('sidebar:folders:article', 'true'))
  // Three held, one answered (its clues become a page), so both lists have rows.
  const ids = []
  for (const title of ['Why does the sea look blue?', 'Is Hamlet mad, or only pretending?', 'What did the Romans eat for breakfast?']) ids.push(await v('question:new', title))
  await v('clue', ids[0], 'Water takes up the red end of the light.')
  await v('question:close', ids[0], 'answered')
  await h.waitForTimeout(600)

  await go('articles')
  await h.waitForTimeout(800)
  const writing = await h.evaluate(() => ({
    chips: [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.textContent.trim()),
    questionRows: document.querySelectorAll('[role="main"] [data-row][data-type="question"]').length,
    side: !!document.querySelector('aside [data-side-row][aria-label="Questions"]')
  }))
  check('Writing has no “All / Questions” switch', writing.chips.length === 0, JSON.stringify(writing.chips))
  check('Writing lists no questions', writing.questionRows === 0, writing.questionRows)
  check('Questions is a row of its own in the sidebar', writing.side)
  if (shots) await h.screenshot({ path: `${shots}/writing.png` })

  // Into Questions from its sidebar row, as a person would.
  await h.locator('aside [data-side-row][aria-label="Questions"]').click()
  await h.waitForTimeout(900)
  const opened = await h.evaluate(() => ({
    current: document.querySelector('aside [data-side-row][aria-label="Questions"]')?.getAttribute('aria-current'),
    writingCurrent: document.querySelector('aside [data-side-row][aria-label="Writing"]')?.getAttribute('aria-current'),
    tabs: [...document.querySelectorAll('[data-question-filter] button')].map((one) => one.textContent.trim()),
    said: document.querySelector('[data-question-said] span:not(.invisible)')?.textContent,
    answers: [...document.querySelectorAll('[data-question-answer]')].map((one) => one.textContent.trim())
  }))
  check('its sidebar row is the page you are on, not Writing', opened.current === 'page' && opened.writingCurrent !== 'page', JSON.stringify(opened))
  if (shots) await h.screenshot({ path: `${shots}/questions.png` })
  check('Open comes first among its lists', opened.tabs[0]?.startsWith('O'), opened.tabs.join(', '))
  check('a line says which list you are on', /still holding/.test(opened.said ?? ''), opened.said)
  check('open questions: “no answer yet” said once under the tabs, not on every row', opened.answers.length === 0 && /no answer yet/.test(opened.said ?? ''), opened.answers.join(' | '))

  // Every box on the line and the list's top, before and after each switch: nothing moves.
  const boxes = () => h.evaluate(() => {
    const at = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') }
    const out = {}
    document.querySelectorAll('[data-question-filter] button').forEach((one, k) => (out[`tab${k}`] = at(one)))
    out.said = at(document.querySelector('[data-question-said]'))
    out.firstRow = (() => { const row = document.querySelector('[role="main"] [data-row]')?.closest('[data-row], [role="option"], li, button'); const r = row?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)}` : null })()
    out.newQuestion = at(document.querySelector('[data-new-writing]'))
    return out
  })
  const start = await boxes()
  const moved = []
  for (const [name, frames] of [['Answered', 'answered'], ['Looked up', 'looked'], ['Words', 'words'], ['Open', 'open']]) {
    for (const theme of ['light', 'dark']) {
      await look(theme)
      const tab = h.locator('[data-question-filter] button').nth(['Open', 'Answered', 'Looked up', 'Words'].indexOf(name))
      await tab.click()
      if (shots) for (let f = 0; f < 8; f++) { await h.screenshot({ path: `${shots}/switch-${frames}-${theme}-${String(f).padStart(2, '0')}.png` }); await h.waitForTimeout(50) }
      else await h.waitForTimeout(500)
      const now = await boxes()
      for (const key of ['tab0', 'tab1', 'tab2', 'tab3', 'said']) if (now[key] !== start[key]) moved.push(`${name}/${theme} ${key}: ${start[key]} -> ${now[key]}`)
      if (name !== 'Open') { await h.locator('[data-question-filter] button').nth(0).click(); await h.waitForTimeout(400) }
    }
  }
  await look('light')
  check('switching Questions’ lists moves no tab and not the line saying where you are', moved.length === 0, moved.join('; '))
  await h.locator('[data-question-filter] button').nth(1).click()
  await h.waitForTimeout(700)
  const answered = await h.evaluate(() => ({
    said: document.querySelector('[data-question-said] span:not(.invisible)')?.textContent,
    answers: [...document.querySelectorAll('[data-question-answer]')].map((one) => one.textContent.trim())
  }))
  check('Answered says so, and shows the answer page’s words under the question', /answered/.test(answered.said ?? '') && answered.answers.some((one) => /red end of the light/.test(one)), JSON.stringify(answered))
  if (shots) await h.screenshot({ path: `${shots}/answered.png` })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
