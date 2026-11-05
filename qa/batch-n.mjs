// Settings, the writing room, the ask sheet, quotes and sources (batch N).
//  1. The ask sheet is the Day page's: a serif title (the question), a quiet hint line, a writing line, keycaps.
//  2. A quote saved as a gem: "Who said it?" offers "Unattributed"; "What does it say to you?" is optional
//     (Enter on nothing keeps the gem without a line), and the quote is never listed as having no source again.
//  3. The writing room's foot is one bar: "How it reads" and "Tools" (the rest inside), "Esc to leave";
//     it fades while you type and comes back as the pointer moves.
//  4. The word aim bar has an x that clears the aim.
//  5. "How it reads" shows whole: its top never moves once it is on screen.
//  6. Settings: "Tilt pictures" and "Caption follows the pointer" samples share one right edge.
//  7. "Open Haligtree to" offers only pages shown in the sidebar; one hidden since opens the first shown page.
//  8. "Text and controls size" is in Settings with a sample, and ⌘K offers "Make everything bigger".
//
//   npx electron-vite build --outDir out-n
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-n/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/batch-n.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const dark = async (on) => { await h.evaluate((d) => document.documentElement.classList.toggle('dark', d), on); await wait(300) }
const shoot = async (name) => {
  if (!shots) return
  await h.screenshot({ path: `${shots}/${name}-light.png` })
  await dark(true)
  await h.screenshot({ path: `${shots}/${name}-dark.png` })
  await dark(false)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // 1 and 2. A quote, saved as a gem.
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The obstacle is the way, said someone.' }] }] } }))
  const qid = typeof id === 'string' ? id : id?.id
  await c.send('capture', qid); await wait(2000)
  await h.click('[data-note-head] button[aria-label="More"]'); await wait(500)
  await h.locator('[role=menu] [data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: 'Turn it into' }).first().hover(); await wait(500)
  await h.locator('[data-slot="dropdown-menu-sub-content"] [role=menuitem]').filter({ hasText: 'Save as a gem' }).first().click(); await wait(800)
  const who = await h.evaluate(() => ({ title: document.querySelector('[data-ask-title]')?.textContent, skip: document.querySelector('[data-ask-skip]')?.textContent }))
  check('2. "Who said it?" offers "Unattributed"', who.title === 'Who said it?' && who.skip === 'Unattributed', JSON.stringify(who))
  await h.click('[data-ask-skip]'); await wait(800)
  const sheet = await h.evaluate(() => {
    const title = document.querySelector('[data-ask-title]'); const hint = document.querySelector('[data-ask-hint]'); const field = document.querySelector('[data-ask-field]')
    if (!title || !field) return null
    const t = getComputedStyle(title); const f = getComputedStyle(field)
    return { title: title.textContent, hint: hint?.textContent, titleSize: parseFloat(t.fontSize), titleFont: t.fontFamily, fieldBox: f.borderTopWidth, fieldLine: f.borderBottomWidth, fieldFont: f.fontFamily, keys: document.querySelectorAll('[data-ask-keys] kbd').length, skip: document.querySelector('[data-ask-skip]')?.textContent }
  })
  // The sheet at the app's own size (ask-sheet.mjs): the question as a bold line, the rest a hint under it, the app's field.
  check('1. the sheet says the question as a heading line, the rest a hint under it', sheet?.title === 'What does it say to you?' && sheet.hint && sheet.titleSize < 20, JSON.stringify(sheet))
  check('1. the field is the app\'s own field, a box with a hairline all round', sheet?.fieldBox === '1px' && sheet.fieldLine === '1px', JSON.stringify(sheet))
  check('1. Cancel and its button with their keys, and a visible way to keep it without a line', sheet?.keys === 2 && sheet.skip === 'Keep it without', JSON.stringify(sheet))
  check('1. every button on it shows the hand', await h.evaluate(() => [...document.querySelectorAll('[data-ask] button')].every((b) => getComputedStyle(b).cursor === 'pointer')))
  await shoot('n-ask')
  await h.keyboard.press('Enter'); await wait(1200)
  const kept = await h.evaluate((one) => window.api.captures.get(one), qid)
  check('2. Enter on nothing saves the gem without a line', kept?.status === 'promoted', kept?.status)
  check('2. kept as "Unattributed"', kept?.attribution === 'Unattributed', kept?.attribution)
  const missing = await v('sources:missing')
  check('2. and it is not listed as a quote with no source', !missing.some((one) => one.label?.includes('obstacle')), JSON.stringify(missing.map((one) => one.label)))

  // 3, 4, 5. The writing room.
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('The morning was grey. I walked to the river and back.'), para('Last plain line. Its second sentence.')] } })
  await go('day'); await wait(800)
  await h.click('[data-room-open]'); await wait(700)
  const bar = await h.evaluate(() => {
    const foot = document.querySelector('[data-room-foot]')
    const buttons = [...foot.querySelectorAll('button')].filter((b) => b.getClientRects().length)
    const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))
    return { buttons: buttons.map((b) => b.textContent.trim()), rows: tops.size }
  })
  check('3. the foot is one bar with two tools in sight, "How it reads" and "Tools"', bar.rows === 1 && bar.buttons.length === 2 && bar.buttons[0] === 'How it reads' && /Tools/.test(bar.buttons[1]), JSON.stringify(bar))
  await h.click('[data-room-tools]'); await wait(400)
  const inside = await h.evaluate(() => [...document.querySelectorAll('[data-room-tools-panel] button')].map((b) => b.textContent.trim()))
  check('3. Tools holds Focus, Word aim, Proofread and the sound', ['sentence', 'paragraph', 'Word aim…', 'Proofread'].every((one) => inside.includes(one)) && inside.some((one) => /while writing/.test(one)), JSON.stringify(inside))
  await shoot('n-room-tools')
  await h.keyboard.press('Escape'); await wait(300)
  check('3. Esc closes the panel first, the room stays', !(await h.locator('[data-room-tools-panel]').count()) && !!(await h.evaluate(() => document.querySelector('[data-room]'))))
  await h.click('[data-room] .tiptap p:last-child'); await h.keyboard.press('End')
  await h.keyboard.type(' More words', { delay: 20 }); await wait(600)
  check('3. typing, the bar fades', await h.evaluate(() => getComputedStyle(document.querySelector('[data-room-foot]')).opacity === '0'))
  await h.mouse.move(300, 300); await h.mouse.move(340, 340, { steps: 4 }); await wait(600)
  check('3. the pointer moving brings it back', await h.evaluate(() => getComputedStyle(document.querySelector('[data-room-foot]')).opacity === '1'))
  await shoot('n-room-bar')

  // 5. How it reads: its top, sampled every frame from when it shows.
  const tops = await h.evaluate(() => new Promise((resolve) => {
    const seen = []
    const start = performance.now()
    const look = () => {
      const one = document.querySelector('[data-prose-report]')
      if (one) seen.push(Math.round(one.getBoundingClientRect().top))
      if (performance.now() - start < 6000) requestAnimationFrame(look)
      else resolve(seen)
    }
    document.querySelector('[data-report-ask]').click()
    requestAnimationFrame(look)
  }))
  check('5. "How it reads" shows whole, its top never moving', tops.length > 5 && new Set(tops).size === 1, JSON.stringify([...new Set(tops)]))
  await shoot('n-report')
  await h.click('[data-report-ask]'); await wait(300)

  // 4. The word aim's x.
  await h.click('[data-room-tools]'); await wait(300)
  await h.click('[data-aim-ask]'); await wait(500)
  const seen = await h.evaluate(() => { const one = document.querySelector('[data-ask]'); let o = 1; for (let at = one; at; at = at.parentElement) o *= Number(getComputedStyle(at).opacity); return { o, focused: !!document.activeElement?.closest('[data-ask]'), panel: !!document.querySelector('[data-room-tools-panel]') } })
  check('4. Word aim\'s question is fully on show, its field has the keys, the panel gone', seen.o === 1 && seen.focused && !seen.panel, JSON.stringify(seen))
  await h.keyboard.type('500'); await h.keyboard.press('Enter'); await wait(700)
  check('4. the aim bar has an x', await h.locator('[data-aim-clear]').count() === 1)
  await shoot('n-aim')
  await h.click('[data-aim-clear]'); await wait(600)
  check('4. the x clears the aim', !(await h.evaluate(() => document.querySelector('[data-word-aim]'))))
  await h.keyboard.press('Escape'); await wait(500)

  // 6, 7, 8. Settings.
  await v('settings:set', { sidebarShown: ['day', 'articles', 'nuggets', 'today'], startPage: 'inbox' })
  await go('settings'); await wait(800)
  await h.click('[data-section="Appearance"]'); await wait(600)
  const edges = await h.evaluate(() => ['Tilt pictures in notes', 'Caption follows the pointer'].map((title) => Math.round(document.querySelector(`[data-setting-title="${title}"] [data-picture-sample] img`)?.getBoundingClientRect().right ?? -1)))
  check('6. the two picture samples share one right edge', edges[0] > 0 && edges[0] === edges[1], JSON.stringify(edges))
  const offered = await h.evaluate(() => [...document.querySelectorAll('[data-start-page] button')].map((b) => ({ label: b.textContent.trim(), on: b.getAttribute('aria-pressed') ?? b.getAttribute('data-on') ?? b.getAttribute('aria-checked') })))
  check('7. "Open Haligtree to" offers only shown pages (no Inbox, Review)', offered.length && !offered.some((one) => /Inbox|Review/.test(one.label)), JSON.stringify(offered))
  const row = h.locator('[data-setting-title="Text and controls size"]')
  check('8. Settings has "Text and controls size" with its sample', await row.count() === 1 && await row.locator('[data-controls-sample]').count() === 1)
  await row.scrollIntoViewIfNeeded(); await wait(300)
  if (shots) await row.screenshot({ path: `${shots}/n-size-light.png` })
  await h.locator('[data-setting-title="Tilt pictures in notes"]').scrollIntoViewIfNeeded(); await wait(300)
  await shoot('n-samples')
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('bigger', { delay: 30 }); await wait(500)
  check('8. ⌘K offers "Make everything bigger"', await h.evaluate(() => document.body.innerText.includes('Make everything bigger')))
  await h.keyboard.press('Escape'); await wait(300)

  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
