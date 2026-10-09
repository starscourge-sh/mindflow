// A fresh install, every page empty: each shows itself filled with a few
// made-up rows under an Example label, in light and dark, and none of it is
// ever saved. Then one real thing on three pages takes the example's place,
// and the side panels show their faint example values until a field is set.
//
//   npx electron-vite build --outDir out-examples
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-examples/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/examples.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-examples-'))
const { sandbox } = await import('./sandbox-lib.mjs')

const dir = process.env.SHOTS ?? '/tmp/examples'
mkdirSync(dir, { recursive: true })
const s = await sandbox({ width: 1200, height: 800, seeded: false })
const { h, v, page, electron, go } = s
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!ok) failed++ }

const PAGES = ['home', 'inbox', 'review', 'day', 'today', 'week', 'upcoming', 'routines', 'later', 'matrix', 'nuggets', 'articles', 'questions', 'goals', 'tags', 'stats', 'map', 'monthpage', 'yearpage', 'discarded', 'archived']
/** What is in the database, everything that could have been written to. */
const stored = async () => {
  const [captures, tasks, nuggets, articles, questions, goals, tags] = await Promise.all([
    h.evaluate(() => window.api.captures.list()), v('tasks'), v('items', 'nugget'), v('items', 'article'), v('items', 'question'), v('items', 'goal'), v('tags')])
  return { captures, tasks, nuggets, articles, questions, goals, tags }
}
const sizes = (all) => Object.entries(all).map(([key, list]) => `${key} ${list.length}`).join(', ')
const exampleIds = (all) => Object.values(all).flat().filter((one) => String(one.id ?? one.tag ?? '').startsWith('example:'))
/** The example on the page: there, its label's words, and how many faded rows it holds. */
const example = (win = h) => win.evaluate(() => {
  const frame = document.querySelector('[data-example-frame]')
  const body = frame?.querySelector('[data-example]')
  return { on: !!frame, label: frame?.querySelector('[role="note"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '', inert: !!body?.hasAttribute('inert'), text: body?.textContent?.length ?? 0 }
})

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.reload()
  await h.waitForTimeout(2000)
  const innerHeightOf = await h.evaluate(() => innerHeight)
  check('a fresh install holds nothing', !Object.values(await stored()).some((list) => list.length), sizes(await stored()))

  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    for (const id of PAGES) {
      await go(id)
      await h.waitForTimeout(700)
      const seen = await example()
      check(`${theme} ${id}: shows an example, labelled, with Try it`, seen.on && seen.inert && seen.text > 20 && /^Example\s*Try it:/.test(seen.label), seen.label.slice(0, 90))
      // Seen without scrolling: its label inside the window.
      const top = await h.evaluate(() => document.querySelector('[data-example-frame] [role="note"]')?.getBoundingClientRect().bottom ?? Infinity)
      check(`${theme} ${id}: the example is in view without scrolling`, top < innerHeightOf, `${Math.round(top)}`)
      await h.screenshot({ path: `${dir}/${id}-${theme}.png` })
    }
    // The box's Inbox tab.
    await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); win?.setBounds({ x: 60, y: 60, width: 900, height: 600 }); win?.show() })
    await page.evaluate((name) => localStorage.setItem('theme', name), theme)
    // Read afresh, so the box wears the theme whole rather than halfway through a change.
    await page.reload()
    await page.waitForTimeout(2500)
    for (const [key, tab] of [['1', 'inbox'], ['2', 'tasks'], ['4', 'saved']]) {
      await page.keyboard.press(`Control+${key}`)
      await page.waitForTimeout(1200)
      if (!(await example(page)).on) { await page.keyboard.press(`Control+${key}`); await page.waitForTimeout(1200) }
      const box = await example(page)
      check(`${theme} the box's ${tab} tab: shows an example`, box.on && box.inert, box.label.slice(0, 80))
      await page.screenshot({ path: `${dir}/box-${tab}-${theme}.png` })
    }
  }

  // Keys pressed over the examples reach nothing.
  for (const id of ['inbox', 'today', 'matrix', 'week', 'nuggets', 'tags']) {
    await go(id)
    for (const key of ['j', 'x', 'e', 'd', 'p', '1', 't', 'Enter']) { await h.keyboard.press(key); await h.waitForTimeout(60) }
    await h.keyboard.press('Escape')
  }
  await h.waitForTimeout(800)
  const after = await stored()
  check('looking at every example and pressing keys on them saved nothing', !Object.values(after).some((list) => list.length), sizes(after))

  // The eight new page hints.
  await v('onboarding:set', { pageHints: true, hintsSeen: [] })
  await s.theme('light')
  for (const id of ['matrix', 'routines', 'later', 'upcoming', 'stats', 'map', 'monthpage', 'articles']) {
    await go(id)
    await h.waitForTimeout(2600)
    const hint = await h.evaluate(() => document.querySelector('[role="note"] p')?.textContent ?? '')
    check(`${id} has a page hint`, hint.length > 30, hint.slice(0, 70))
    if (id === 'matrix' || id === 'map') await h.screenshot({ path: `${dir}/hint-${id}.png` })
  }
  await v('onboarding:set', { pageHints: false })
  await h.reload()
  await h.waitForTimeout(1500)

  // One real thing on three pages, each by the page's own way in.
  // Inbox: caught in the box.
  await page.click('.tiptap.ProseMirror')
  await page.keyboard.type('Middlemarch, chapter one #book', { delay: 15 })
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1500)
  await go('inbox')
  check('Inbox: the first capture takes the example\'s place', !(await example()).on && (await h.evaluate(() => document.body.textContent.includes('Middlemarch, chapter one'))))
  await h.screenshot({ path: `${dir}/real-inbox.png` })
  // Today: typed in the line at the top.
  await go('today')
  await h.click('form input, form [contenteditable="true"]')
  await h.keyboard.type('Call Mum today 6pm', { delay: 15 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  check('Today: the first task takes the example\'s place', !(await example()).on && (await h.evaluate(() => document.body.textContent.includes('Call Mum'))))
  await h.screenshot({ path: `${dir}/real-today.png` })
  // Questions: from the example's own Try it.
  await go('questions')
  await h.click('[data-example-frame] [role="note"] button')
  await h.waitForTimeout(700)
  await h.keyboard.type('Why do I reread the same books?', { delay: 15 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  await go('questions')
  check('Questions: the first question takes the example\'s place', !(await example()).on && (await h.evaluate(() => document.body.textContent.includes('Why do I reread'))))
  await h.screenshot({ path: `${dir}/real-questions.png` })

  const real = await stored()
  console.log('stored:', sizes(real))
  check('only the three real things were saved', real.captures.length === 1 && real.tasks.length === 1 && real.questions.length === 1 && !real.nuggets.length && !real.articles.length && !real.goals.length, sizes(real))
  check('no example id anywhere', exampleIds(real).length === 0)
  const words = JSON.stringify(real)
  check('no example words anywhere', !/Frankenstein|Netherfield|Elizabeth Bennet|Litany|Globe/.test(words))

  // The side panels' faint example values, on a fresh #book, decision, experiment, word, idea and task.
  const make = async (kind, text) => {
    const id = await h.evaluate((kind) => window.api.captures.create({ kind, body: { type: 'doc', content: [{ type: 'paragraph' }] } }), kind)
    await h.evaluate(([id, text]) => window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), [id, text])
    return id
  }
  const panels = {
    book: real.captures[0].id,
    decision: await make('decision', 'Take the job in Bath?'),
    experiment: await make('experiment', 'No phone before breakfast'),
    word: await make('word', 'Ineffable'),
    idea: await v('promote', await make('note', 'Fear is the mind-killer'))
  }
  const opened = async (type, id) => { await s.send(type, id); await h.waitForTimeout(1500) }
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    for (const [name, id] of [...Object.entries(panels), ['task', real.tasks[0].id]]) {
      await opened(name === 'idea' ? 'nugget' : name === 'task' ? 'task' : 'capture', id)
      if (name !== 'task' && (await h.getAttribute('button[aria-label="Details"]', 'aria-pressed').catch(() => null)) === 'false') await h.click('button[aria-label="Details"]')
      await h.waitForTimeout(800)
      const ghosts = await h.evaluate(() => document.querySelectorAll('[data-ghost], [data-ghost-field]').length)
      check(`${theme} ${name}: unset fields show a faint example`, ghosts > 0, `${ghosts}`)
      const words = await h.evaluate(() => document.body.textContent ?? '')
      if (name === 'book') check(`${theme} book: the takeaway says when it comes`, words.includes('shows once you mark it Finished'))
      if (name === 'decision') check(`${theme} decision: Working out shows a faint example`, /Working out\s*pros, cons/.test(words))
      if (name === 'experiment') check(`${theme} experiment: Started by shows a faint example`, words.includes("e.g. Monday's page"))
      await h.screenshot({ path: `${dir}/panel-${name}-${theme}.png` })
    }
  }
  // Looked at, never written: the fields stay empty.
  const fields = await Promise.all(Object.entries(panels).filter(([name]) => name !== 'idea').map(([, id]) => v('notes:fields', 'captures', id)))
  check('the faint examples were never saved', fields.every((one) => !Object.values(one ?? {}).some((value) => value !== '' && value !== null && value !== 0)), JSON.stringify(fields))
  const task = await v('task', real.tasks[0].id)
  check('the task\'s fields stayed empty', !task.estimate && !task.waitingOn && !task.recurrence && !task.blocker, JSON.stringify({ e: task.estimate, w: task.waitingOn, r: task.recurrence, b: task.blocker }))

  console.log('errors', s.errors)
  console.log(failed ? `${failed} FAILED` : 'ALL PASS')
  process.exitCode = failed ? 1 : 0
} finally {
  await s.close()
}
