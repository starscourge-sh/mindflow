// The layout and reach fixes from the "similar issues" sweep, kept fixed, in
// Paper and Dark: long task names wrap (Close the day, the Matrix), pickers
// stay inside the window, dates in another year say the year, Settings' times
// are Vigil's own field (named, typed any way), every small tick and "?" takes
// a 24px click, important notes are body-size words, faint words reach 4.5:1,
// the page previews head their groups in plain words, and a restore asks in
// Vigil's own sheet.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sim-two.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 760 })
const { h, go, v, theme } = c
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })

// Contrast of an element's colour against what is really behind it.
const CONTRAST = `(() => {
  const parse = (s) => { const m = s.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 } }
  const behind = (el) => { for (let one = el; one; one = one.parentElement) { const bg = parse(getComputedStyle(one).backgroundColor); if (bg.a > 0.9) return bg } return parse(getComputedStyle(document.body).backgroundColor) }
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) })
  return (el, colour) => { const bg = behind(el.parentElement ?? el); const fg = mix(parse(colour), bg); const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 }
})()`
// Words drawn see-through (a /70-style colour) that fall under 4.5:1.
const FAINT = `(() => { const c = ${CONTRAST}; const out = []
  for (const el of document.querySelectorAll('main span, main p, main div, main label, [role=dialog] span, [role=dialog] p')) {
    if (el.closest('[aria-hidden=true], [data-peek-card], button:disabled, .private-text')) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue
    const col = getComputedStyle(el).color; const a = col.match(/[\\d.]+/g)?.map(Number)[3]
    if (a === undefined || a >= 1) continue
    const ratio = c(el, col); if (ratio < 4.5) out.push(el.textContent.trim().slice(0, 30) + ' ' + ratio)
  } return out })()`
// A click target's size, its ::after reach counted.
const HIT = `((el) => { const r = el.getBoundingClientRect(); const a = getComputedStyle(el, '::after'); let w = r.width, hh = r.height
  if (a.content !== 'none' && a.position === 'absolute') { w = Math.max(w, r.width - parseFloat(a.left || 0) - parseFloat(a.right || 0)); hh = Math.max(hh, r.height - parseFloat(a.top || 0) - parseFloat(a.bottom || 0)) }
  return { w: Math.round(w), h: Math.round(hh) } })`

const LONG = 'Email the department about https://example.com/archive/2026/a-really-long-address-that-never-breaks-anywhere-at-all and the reading list for fragment seven'
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, closeDay: true, reviewReminder: '09:00' })
  await v('onboarding:set', { pageHints: false })
  await v('task:add', `${LONG} today`)
  await v('task:add', 'https://example.com/one/really/long/link/with/no/spaces/that/runs/on/and/on/past/the/edge/of/a/card')

  for (const name of ['paper', 'dark']) {
    await theme(name)
    const T = name === 'paper' ? 'Paper' : 'Dark'

    // Settings: Vigil's own time fields, named; number fields named, no spin arrows; the "?" a 24px target.
    await go('settings')
    // Every section in turn: what each holds, gathered.
    const gathered = { stock: 0, own: [], numbers: [], text: '', more: null }
    for (const section of await h.$$eval('[data-section]', (all) => [...new Set(all.map((one) => one.dataset.section))])) {
      await h.click(`[data-section="${section}"]`)
      await h.waitForTimeout(500)
      const here = await h.evaluate(`(() => ({ stock: document.querySelectorAll('input[type=time]').length, own: [...document.querySelectorAll('[data-time-field]')].map((one) => one.getAttribute('aria-label')),
        numbers: [...document.querySelectorAll('input[type=number]')].map((one) => ({ name: one.getAttribute('aria-label'), arrows: getComputedStyle(one).appearance })),
        text: document.querySelector('[data-setting]')?.closest('.overflow-y-auto')?.innerText ?? '', more: (() => { const one = document.querySelector('[data-setting-more]'); return one && (${HIT})(one) })() }))()`)
      gathered.stock += here.stock
      gathered.own.push(...here.own)
      gathered.numbers.push(...here.numbers)
      gathered.text += here.text
      gathered.more ??= here.more
      if (here.own.includes('Day ends at')) gathered.at = section
    }
    const times = { stock: gathered.stock, own: gathered.own }
    check(`${T}: Settings has no system time field, every time is Vigil's own and named`, times.stock === 0 && times.own.length >= 5 && times.own.every(Boolean), JSON.stringify(times))
    const numbers = gathered.numbers
    check(`${T}: Review's per-day fields are named and have no spin arrows`, numbers.length >= 2 && numbers.every((one) => one.name && one.arrows === 'textfield'), JSON.stringify(numbers))
    const more = gathered.more
    check(`${T}: the "?" beside a setting takes a 24px click`, more && more.w >= 24 && more.h >= 24, JSON.stringify(more))
    const seen = gathered.text
    check(`${T}: Settings says the exceptions and the consequences in plain sight`, seen.includes('Pinned ones and ones with a reminder stay') && seen.includes('Turned off, the files go within the hour'))
    if (name === 'paper' && !gathered.at) check('Typing a time in “Day ends at” (no Vigil time field to type in)', false)
    if (name === 'paper' && gathered.at) {
      // Typed any way, kept on Enter.
      if (gathered.at) await h.click(`[data-section="${gathered.at}"]`)
      await h.waitForTimeout(500)
      const field = h.locator('[data-time-field="Day ends at"]')
      await field.scrollIntoViewIfNeeded()
      await field.click()
      await h.waitForTimeout(250)
      const listed = await h.locator('[role=listbox] [role=option]').count()
      await shot(`settings-time-${name}`)
      await field.fill('9pm')
      await field.press('Enter')
      await h.waitForTimeout(400)
      check('Typing “9pm” in “Day ends at” keeps 21:00, with the half hours listed under it', (await v('settings')).dayEnd === '21:00' && listed === 48, `listed ${listed}, kept ${(await v('settings')).dayEnd}`)
      await field.focus()
      await field.press('ArrowUp')
      await h.waitForTimeout(300)
      check('↑ steps it a quarter hour', (await v('settings')).dayEnd === '21:15', (await v('settings')).dayEnd)
      await field.press('Escape')
      await v('settings:set', { dayEnd: '22:00' })
    }
    await shot(`settings-${name}`)

    // Close the day: a long task wraps instead of being cut.
    await go('today')
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
    await h.waitForTimeout(700)
    const closing = await h.evaluate(() => {
      const row = [...document.querySelectorAll('[data-close-task]')].find((one) => one.textContent.includes('fragment seven'))
      const words = row?.querySelector('span')
      return words ? { cut: getComputedStyle(words).textOverflow === 'ellipsis', over: words.scrollWidth > words.clientWidth + 1, lines: Math.round(words.getBoundingClientRect().height / parseFloat(getComputedStyle(words).lineHeight)) } : null
    })
    check(`${T}: “Close the day” wraps a long task to two lines, never “…” on one`, closing && !closing.cut && !closing.over && closing.lines >= 2, JSON.stringify(closing))
    await shot(`close-day-${name}`)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(400)

    // The Matrix: a task that is one long link stays inside its card; an empty box says so readably.
    await go('matrix')
    const matrix = await h.evaluate(`(() => { const c = ${CONTRAST}; const card = [...document.querySelectorAll('[data-task-title]')].find((one) => one.textContent.startsWith('https://example.com/one'))
      const empty = document.querySelector('[data-box-empty]') ?? [...document.querySelectorAll('main p')].find((one) => /Drop a task|nothing|Empty/i.test(one.textContent) && one.closest('[data-quadrant], section'))
      return { over: card ? card.scrollWidth > card.clientWidth + 1 : null, empty: empty ? { size: parseFloat(getComputedStyle(empty).fontSize), ratio: c(empty, getComputedStyle(empty).color) } : null } })()`)
    check(`${T}: in the Matrix a one-word link breaks inside its card`, matrix.over === false, JSON.stringify(matrix))
    check(`${T}: an empty Matrix box's words are readable (13px+, 4.5:1)`, !matrix.empty || (matrix.empty.size >= 13 && matrix.empty.ratio >= 4.5), JSON.stringify(matrix.empty))
    await shot(`matrix-${name}`)

    // The week page in another year says the year.
    await go('week')
    let said = ''
    for (let i = 0; i < 20; i++) {
      said = await h.evaluate(() => document.querySelector('button[aria-label="Week after"]')?.closest('div')?.innerText ?? '')
      if (/20\d\d/.test(said)) break
      await h.locator('button[aria-label="Week after"]').click()
      await h.waitForTimeout(250)
    }
    await h.waitForTimeout(500)
    said = await h.evaluate(() => document.querySelector('button[aria-label="Week after"]')?.closest('div')?.innerText ?? '')
    check(`${T}: a week in next year says the year`, /20\d\d/.test(said), said.replace(/\s+/g, ' ').slice(0, 80))
    await shot(`week-next-year-${name}`)

    // Faint words across the pages they were found on.
    const faint = []
    for (const page of ['home', 'inbox', 'goals', 'questions', 'settings', 'matrix', 'nuggets']) {
      await go(page)
      faint.push(...(await h.evaluate(FAINT)).map((one) => `${page}: ${one}`))
    }
    check(`${T}: no see-through words under 4.5:1 on Home, Inbox, Goals, Questions, Settings, Matrix, Gems`, faint.length === 0, `${faint.length}: ${faint.slice(0, 6).join(' | ')}`)

    // The page previews: groups headed in plain words, sentence case, 11px+.
    await go('home')
    const row = h.locator('aside button[data-side-row][aria-label="Upcoming"]').first()
    let label = null
    if (await row.isVisible().catch(() => false)) {
      const r = await row.boundingBox()
      await h.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 })
      for (let i = 0; i < 60 && !label; i++) {
        label = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-peek-card] div')].find((el) => el.childNodes.length === 1 && el.textContent === 'Tomorrow'); if (!one) return null; const s = getComputedStyle(one); return { size: parseFloat(s.fontSize), caps: s.textTransform, spacing: s.letterSpacing } })
        if (!label) await h.waitForTimeout(50)
      }
      await shot(`peek-${name}`)
      await h.mouse.move(600, 400)
    }
    check(`${T}: the Upcoming preview heads its groups in plain 11px+ words, not spaced capitals`, label && label.size >= 11 && label.caps === 'none' && (label.spacing === 'normal' || parseFloat(label.spacing) === 0), JSON.stringify(label))
  }

  // Safe mode's notice: body size, the lead in bold.
  await v('settings:set', { safeMode: true })
  await go('today')
  await go('home')
  await h.waitForTimeout(800)
  const safe = await h.evaluate(() => { const one = document.querySelector('[data-safe-note]') ?? [...document.querySelectorAll('p')].find((el) => el.textContent.includes('Safe mode is on')); return one ? { size: parseFloat(getComputedStyle(one).fontSize), bold: !!one.querySelector('strong') } : null })
  check('Home: “Safe mode is on” is body-size words with the lead in bold', safe && safe.size >= 14 && safe.bold, JSON.stringify(safe ?? (await h.evaluate(() => document.body.innerText.slice(0, 300)))))
  await shot('safe-mode-dark')
  await v('settings:set', { safeMode: false })

  // Pickers stay inside the window: the question picker's list is capped.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:pick-question', { detail: { answer: () => {} } })))
  await h.waitForTimeout(500)
  const capped = await h.evaluate(() => { const list = document.querySelector('[role=dialog][aria-label="Add to a question"] [cmdk-list]'); return list ? { max: parseFloat(getComputedStyle(list).maxHeight), room: innerHeight } : null })
  check('“Add to a question” lists at most half the window, so its foot stays in view', capped !== null && capped.max <= capped.room * 0.5 + 1, JSON.stringify(capped))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // A restore asks in Vigil's own sheet, and Escape says no.
  const sheet = await h.evaluate(async () => {
    if (!window.api.answerRestore) return null
    window.dispatchEvent(new CustomEvent('vigil:restore-ask', { detail: { name: 'mindflow-2026-10-14.db', token: 'probe' } }))
    await new Promise((done) => setTimeout(done, 400))
    const one = document.querySelector('[data-restore-ask]')
    return one ? { text: one.textContent, bold: [...one.querySelectorAll('strong')].map((el) => el.textContent) } : null
  })
  await shot('restore-ask-dark')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  const gone = await h.evaluate(() => !document.querySelector('[data-restore-ask]'))
  check('Restore from a backup asks in Vigil’s own sheet, “Then Vigil starts again” in bold, Esc says no', sheet && sheet.bold.some((one) => one.includes('Then Vigil starts again')) && gone, JSON.stringify(sheet?.bold))

  // Controls that showed only on hover show for the keyboard too.
  const focusRules = await h.evaluate(() => {
    const rules = []
    for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) rules.push(rule.cssText) } catch {} }
    const all = rules.join('\n')
    return { link: /focus-within[^{]*\.tiptap-bookmark-copy/.test(all), drawing: /focus-within[^{]*\.tiptap-excalidraw-tools/.test(all), video: /focus-within[^{]*\.tiptap-media-controls/.test(all) }
  })
  check('A link card’s Copy, a drawing’s tools and a video’s controls show on keyboard focus too', focusRules.link && focusRules.drawing && focusRules.video, JSON.stringify(focusRules))
} finally {
  if (c.errors.length) console.log('errors', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
