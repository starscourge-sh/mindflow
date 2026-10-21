// Worst-case data, and each place it used to break: long titles with long
// tags, a URL as a title, emoji and other scripts, dates in other years, a
// crowded calendar, a task made from twelve captures, a one-minute task, a
// For tomorrow line that names a past day, tags in other languages, and a
// 5,000-letter title. Fails on each break the break-ui audit found.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/break-ui.mjs
// SHOTS=<folder> also saves a picture of each place.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const on = (hm) => new Date(`${TODAY}T${hm}:00`).toISOString()
const LONG = 'Email the department about the extension for the Comparative Literature 302 essay on Frankenstein and the Romantic sublime'
const URL = 'https://docs.example-university.ac.za/courses/ENG302/assignments/final-essay-submission-guidelines-2026-revised-v3-FINAL.pdf'
const TAG = 'comparative-literature-and-critical-theory-seminar'
const EMOJI = '🎓📚✍️🎉👩🏽‍🎓'
const ev = (title, from, to) => ({ title, start: on(from), end: on(to), allDay: false, calendar: 'College', color: '#2f80ed' })
// 22 events today: the first ones in the morning, fourteen short revision blocks after 16:00, one late at night.
process.env.MINDFLOW_QA_CALENDAR = JSON.stringify([
  ev('Overnight shift at the library desk', '22:00', '23:59'),
  ...Array.from({ length: 14 }, (_, i) => ev(`Revision block ${i + 1}`, `${pad(16 + Math.floor(i / 3))}:${pad((i % 3) * 20)}`, `${pad(16 + Math.floor(i / 3))}:${pad((i % 3) * 20 + 15)}`)),
  ev('Lab', '09:00', '09:30'), ev('Tutorial', '09:00', '11:00'), ev('Study group', '09:15', '09:45'), ev('Seminar', '13:00', '14:00'),
  ev('Reading group', '14:00', '15:00'), ev('Office hours', '15:00', '15:30'), ev('Supervision', '21:00', '21:20')
])

const c = await sandbox({ width: 1000, height: 760, at: '19:30' })
const { h, page, v, go, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const shoot = async (name, target = h) => { if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {}) }
const lone = (text) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|�/.test(text)
const add = async (title, patch = {}) => { const made = await v('task:add', title); const id = made?.id ?? made; if (Object.keys(patch).length) await v('task:save', id, patch); return id }
const capture = (text) => h.evaluate((t) => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } }), text)
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return key(d) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, celebrate: false, macCalendar: true, workHours: 8, closeDayAt: '19:00', closeDay: true, tomorrowBox: true })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  const ids = {}
  ids.long = await add(`${LONG} #${TAG}`, { due: on('10:00'), estimate: 600, important: 1 })
  ids.url = await add(`Read ${URL}`, { due: on('11:00'), estimate: 45 })
  ids.a = await add('a', { due: on('20:00'), estimate: 1 })
  ids.old = await add('Return the library book', { due: '1999-01-01T14:00:00.000Z' })
  ids.far = await add('Renew passport before it runs out', { due: '2099-12-31T10:00:00.000Z' })
  ids.emoji = await add(`${EMOJI} Finish thesis chapter 4`, { due: on('12:00'), estimate: 90 })
  await v('task:done', ids.emoji)
  // Lineage: a task from twelve captures whose names differ only at the end.
  const caps = []
  for (let i = 0; i < 12; i++) caps.push(await capture(i === 0 ? `${EMOJI.repeat(6)} thesis` : `${LONG}, fragment ${i + 1}`))
  await v('tasks:from', caps, `${LONG} (twelve fragments)`)
  // Tags in other languages and an emoji.
  const tagged = await capture('Reading notes #français #日本語 #عربي #📚 and #2nd')
  // A question whose cut point falls inside an emoji.
  const q = await v('question:new', 'What did Shelley’s creature learn from 📖 Milton and Plutarch?')
  await v('question:pin', q?.id ?? q, true).catch(() => {})
  // A quote that starts with its own quote mark.
  await h.evaluate((t) => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } }), `“${LONG}”`)
  const shown = (await v('settings')).sidebarShown
  await h.reload(); await wait(2500)
  // THEME=dark (or any theme) runs the same checks, and takes the pictures, in that theme.
  if (process.env.THEME) await c.theme(process.env.THEME)

  // 1. Dates in another year say the year.
  await go('today'); await wait(1200)
  const todayText = await h.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  check('a task due in 1999 says 1999', /1 Jan 1999/.test(todayText))
  await go('upcoming'); await wait(1000)
  check('a task due in 2099 says 2099', /31 Dec 2099/.test(await h.evaluate(() => document.body.innerText)))

  for (const width of [1000, 720]) {
    await size(width, 760)
    // 2, 6. Today List: the title keeps its room beside a long tag, and the tag ends in an ellipsis.
    await go('today'); await wait(1200)
    await shoot(`${width}-today`)
    const row = await h.evaluate((id) => {
      const one = document.querySelector(`[data-row][data-id="${id}"] [data-task-title]`)
      if (!one) return null
      const title = one.querySelector('.truncate')?.getBoundingClientRect().width ?? 0
      const tag = one.querySelector('[data-tag]')
      return { title, tags: one.querySelector('[data-tags]')?.getBoundingClientRect().width ?? 0, cut: tag ? getComputedStyle(tag).textOverflow : '' }
    }, ids.long)
    check(`${width}: Today List keeps the title wider than its tags`, row && row.title > row.tags && row.title > 120, JSON.stringify(row))
    check(`${width}: a long tag ends in an ellipsis`, row?.cut === 'ellipsis')
    // 14. List and Page count the same day.
    const list = await h.evaluate(() => document.querySelector('[data-day-progress]')?.dataset.said ?? '')
    // 17. The page leaves room under its last line for the Top button.
    const room = await h.evaluate(() => { const box = [...document.querySelectorAll('.overflow-y-auto')].find((one) => one.querySelector('[data-day-progress]')); const inner = box?.firstElementChild; return inner ? parseFloat(getComputedStyle(inner).paddingBottom) : 0 })
    check(`${width}: Today leaves room under its last line for the Top button`, room >= 56, `${room}px`)
    if (width === 1000) {
      // The look chips roll their labels, so each is read by its first half.
      const lookAt = (name) => h.evaluate((n) => [...document.querySelectorAll('header button[aria-pressed]')].findIndex((one) => { const t = one.textContent.trim(); return [...t.slice(0, t.length / 2)].filter((_, i) => i % 2 === 0).join('') === n }), name)
      const pageAt = await lookAt('Page')
      if (pageAt >= 0) {
        await h.locator('header button[aria-pressed]').nth(pageAt).click(); await wait(1200)
        const pageSaid = await h.evaluate(() => document.querySelector('[data-now-count]')?.innerText ?? '')
        check('List and Page give the same total', !!list && pageSaid.replace(/\s+/g, '') === list.replace(/\s+/g, ''), `${list} / ${pageSaid}`)
        await shoot('1000-today-page')
        await h.locator('header button[aria-pressed]').nth(await lookAt('List')).click(); await wait(800)
      } else check('the Page look is there', false)
    }

    // 3, 4. The week view: no load line or card cut short.
    await go('week'); await wait(1300)
    await shoot(`${width}-week`)
    const loads = await h.evaluate(() => [...document.querySelectorAll('[data-day-load] > span')].map((one) => ({ t: one.innerText, over: one.scrollWidth - one.clientWidth, right: one.getBoundingClientRect().right, col: one.closest('[data-day]')?.getBoundingClientRect().right ?? Infinity })))
    check(`${width}: every part of the week's load lines fits its column`, loads.length > 0 && loads.every((one) => one.over <= 1 && one.right <= one.col + 1), JSON.stringify(loads.filter((one) => one.over > 1 || one.right > one.col + 1).slice(0, 3)))
    // A card's title keeps to one line (qa/calendar.mjs): a long one ends in "…" inside its card, its whole name on hover.
    const cards = await h.evaluate(() => [...document.querySelectorAll('[data-day] [data-task-title]')].map((one) => ({ t: one.innerText.slice(0, 30), over: one.scrollWidth - one.clientWidth, cut: getComputedStyle(one).textOverflow === 'ellipsis' && getComputedStyle(one).overflow === 'hidden', whole: !!one.getAttribute('title') || !!one.closest('[data-tip]') })))
    check(`${width}: no week card title runs past its card`, cards.every((one) => one.over <= 1 || (one.cut && one.whole)), JSON.stringify(cards.filter((one) => one.over > 1 && !(one.cut && one.whole)).slice(0, 3)))
    const metas = await h.evaluate(() => [...document.querySelectorAll("[data-day] [data-task-meta]")].flatMap((one) => { const box = one.getBoundingClientRect(); return [...one.querySelectorAll("*")].filter((kid) => kid.getBoundingClientRect().right > box.right + 1).map((kid) => `${kid.tagName}.${String(kid.className).slice(0, 30)}:${(kid.textContent || "").slice(0, 14)}:${Math.round(kid.getBoundingClientRect().right - box.right)}`) }))
    check(`${width}: week card tags and dates stay inside the card`, !metas.length, metas.slice(0, 3).join(" ; "))

    // 2. Close the day: the long-tag task keeps its name, and its buttons stay in the sheet.
    await go('today'); await wait(600)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day'))); await wait(1600)
    await shoot(`${width}-close-day`)
    const close = await h.evaluate((id) => {
      const li = document.querySelector(`[data-close-task="${id}"]`)
      if (!li) return null
      const box = li.getBoundingClientRect()
      return { title: li.querySelector('.line-clamp-2, .truncate')?.getBoundingClientRect().width ?? 0, out: [...li.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > box.right + 1).length }
    }, ids.long)
    check(`${width}: Close the day shows the task's name beside a long tag`, close && close.title > 100, JSON.stringify(close))
    check(`${width}: Close the day keeps every button inside the row`, close && close.out === 0, JSON.stringify(close))
    await h.keyboard.press('Escape'); await wait(900)

    // 4. Today's Matrix: the long tag stays inside its card.
    await go('matrix'); await wait(1200)
    await shoot(`${width}-matrix`)
    const matrix = await h.evaluate(() => [...document.querySelectorAll('[data-task-meta] [data-tags]')].map((one) => { const card = one.closest('[data-task-meta]').getBoundingClientRect(); return one.getBoundingClientRect().right <= card.right + 1 }))
    check(`${width}: Matrix tags stay inside their cards`, matrix.length > 0 && matrix.every(Boolean), `${matrix.length} cards`)

    // 7, 8. Today by the hour: in time order, with how many more; never "about 0m".
    await go('day'); await wait(1500)
    await shoot(`${width}-timeline`)
    const line = await h.evaluate(() => ({ rows: [...document.querySelectorAll('[data-day-timeline] [data-line-event]')].map((one) => one.innerText.replace(/\s+/g, ' ')), more: document.querySelector('[data-more-events]')?.innerText ?? '', all: document.querySelector('[data-day-timeline]')?.innerText ?? '' }))
    check(`${width}: Today by the hour says how many more events there are`, /And 10 more events/.test(line.more), line.more)
    check(`${width}: a one-minute task is not "about 0m"`, !/about 0 ?m/.test(line.all) && /about 1 ?min?\b/.test(line.all))
    const times = line.rows.map((one) => one.match(/^(\d{1,2}:\d\d)/)?.[1]).filter(Boolean).map((t) => Number(t.replace(':', '.')))
    check(`${width}: the events shown are in time order and include the next ones`, times.every((t, i) => !i || t >= times[i - 1]) && line.rows.some((one) => /Supervision/.test(one)) && line.rows.some((one) => /Overnight/.test(one)), times.join(' '))
    if (width === 1000) {
      await h.locator('[data-more-events]').click(); await wait(600)
      check('“And 10 more events” shows all 22', (await h.locator('[data-day-timeline] [data-line-event]').count()) === 22)
      await h.locator('[data-more-events]').click(); await wait(400)
    }

    // 5. Everything: the Made from menu with twelve captures.
    await go('all'); await wait(1200)
    const made = h.locator('[data-page="all"] [data-made-chip] button').first()
    await made.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {})
    if (await made.count()) { await made.click(); await wait(900) }
    // 13. Every kind chip can be seen whole.
    const chips = await h.evaluate(() => { const row = document.querySelector('[data-everything-filter] [data-hover-quiet]'); if (!row) return null; const box = row.getBoundingClientRect(); return { all: row.querySelectorAll('button[aria-pressed]').length, whole: [...row.querySelectorAll('button[aria-pressed]')].filter((one) => { const r = one.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1 }).length } })
    if (width === 1000) check('1000: every kind chip in Everything is seen whole', chips && chips.all === chips.whole, JSON.stringify(chips))
    const twelve = h.locator('[data-made-n="12"]').first()
    // The list redraws after the box is ticked; on a busy machine that can take longer than the wait above.
    await twelve.waitFor({ state: 'attached', timeout: 4000 }).catch(() => {})
    // Each kind is an island showing its first few: open them whole, as a person looking for it would.
    for (let round = 0; round < 20 && !(await twelve.count()); round++) {
      const more = h.locator('[data-page="all"] [data-island-more]', { hasText: /^Show \d/ }).first()
      if (!(await more.count())) break
      await more.click(); await wait(400)
    }
    // The list draws only the rows near the screen. The task usually sits near the top, but when the
    // sandbox was seeded before the probe's clock moved to 19:30, the seed's tasks are newer and push
    // it down: scroll down the list to it, as a person would.
    for (let step = 0; step < 40 && !(await twelve.count()); step++) {
      const moved = await h.evaluate(() => {
        let box = document.querySelector('[data-page=all] [data-row]')?.parentElement
        while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
        if (!box) return false
        const was = box.scrollTop
        box.scrollTop += box.clientHeight * 0.8
        return box.scrollTop !== was
      })
      await wait(250)
      if (!moved) break
    }
    if (await twelve.count()) {
      await twelve.scrollIntoViewIfNeeded(); await twelve.hover(); await wait(1300)
      await shoot(`${width}-cue-tip`)
      const tips = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content], [role=tooltip]')].map((one) => one.innerText))
      check(`${width}: the Made from tip never breaks an emoji`, tips.length > 0 && !tips.some(lone), tips.join(' | ').slice(0, 120))
      check(`${width}: no row card opens over the cue's tip`, !(await h.evaluate(() => !!document.querySelector('[data-row-card]'))))
      await twelve.click(); await wait(900)
      await shoot(`${width}-cue-menu`)
      const menu = await h.evaluate(() => { const box = document.querySelector('[role=menu]')?.getBoundingClientRect(); const items = [...document.querySelectorAll('[role=menu] [data-made-pick]')].map((one) => one.innerText.trim()); const cut = [...document.querySelectorAll("[role=menu] [data-made-pick] span")].filter((one) => { const r = document.createRange(); r.selectNodeContents(one); return [...r.getClientRects()].some((line) => line.right > one.getBoundingClientRect().right + 1) || /…$/.test(getComputedStyle(one).textOverflow === "ellipsis" && one.scrollWidth > one.clientWidth ? "…" : "") }).map((one) => one.innerText.slice(0, 12)).join(";"); return box ? { right: box.right, bottom: box.bottom, w: innerWidth, hh: innerHeight, items, cut } : null })
      check(`${width}: the Made from menu stays inside the window`, menu && menu.right <= menu.w && menu.bottom <= menu.hh, JSON.stringify(menu && { right: menu.right, w: menu.w }))
      check(`${width}: its twelve names can be told apart, none cut again at its end`, menu && new Set(menu.items).size === 12 && !menu.items.some(lone) && !menu.cut, `${menu?.items.slice(1, 3).join(' | ')} cut ${menu?.cut}`)
      await h.keyboard.press('Escape'); await wait(400)
    } else check(`${width}: the twelve-capture cue is there`, false)
    if (await made.count()) { await made.click(); await wait(400) }
  }

  // 9. For tomorrow: "from Tuesday" stays in the words, and the line stays on tomorrow.
  await size(1000, 760)
  await go('today'); await wait(1400)
  const box = '[data-tomorrow-box]'
  if (await h.locator(box).count()) {
    await h.locator(`${box} textarea`).last().click()
    await h.keyboard.type('Attach the doctor’s note from Tuesday'); await h.keyboard.press('Enter'); await wait(1000)
    // A day of its own that is never tomorrow, whatever today is: three days on.
    const away = new Date(); away.setDate(away.getDate() + 3)
    await h.keyboard.type(`Call the library on ${away.toLocaleDateString('en-GB', { weekday: 'long' })}`); await h.keyboard.press('Enter'); await wait(1000)
    await h.evaluate(() => document.activeElement?.blur?.()); await wait(500)
    await h.locator(box).scrollIntoViewIfNeeded(); await shoot('tomorrow-box')
    const tasks = await v('tasks')
    const note = tasks.find((one) => /doctor/.test(one.title))
    check('a For tomorrow line keeps “from Tuesday” in its words', note?.title === 'Attach the doctor’s note from Tuesday', note?.title)
    check('… and stays on tomorrow', note && key(new Date(note.dueAt)) === day(1), note?.dueAt)
    const moved = await h.evaluate(() => document.querySelector('[data-tomorrow-moved]')?.innerText ?? '')
    check('a line its own day moves says so plainly, with “Keep for tomorrow”', /For .*Keep for tomorrow/s.test(moved), moved.replace(/\s+/g, ' '))
    await h.locator('[data-tomorrow-moved] button').first().click(); await wait(900)
    const call = (await v('tasks')).find((one) => /Call the library/.test(one.title))
    check('“Keep for tomorrow” brings it back to tomorrow', call && key(new Date(call.dueAt)) === day(1), call?.dueAt)
  } else check('the For tomorrow box is there', false)

  // 10. Tags in any letters, and emoji; found by search too.
  const tags = (await v('tags')).map((one) => one.tag)
  check('tags in other languages and emoji are tags', ['français', '日本語', 'عربي', '📚'].every((one) => tags.includes(one)) && !tags.includes('2nd'), tags.filter((one) => !/^[a-z]/.test(one)).join(' '))
  const found = await h.evaluate(() => window.api.captures.find('#français'))
  check('searching #français finds it', found.some((one) => one.id && /français/.test(one.label ?? '')) || found.length > 0)
  await h.evaluate((id) => window.api.openInHome('capture', id), tagged); await wait(1400)
  const marks = await h.evaluate(() => [...document.querySelectorAll('.ProseMirror [data-token="tag"], .ProseMirror .token-tag, .ProseMirror [class*="tag"]')].map((one) => one.textContent))
  check('the editor marks #français and #📚 as tags', marks.some((one) => /français/.test(one)) && marks.some((one) => /📚/.test(one)), marks.slice(0, 6).join(' '))

  // 16. A 5,000-letter title is cut to fit, the words kept in its notes.
  const huge = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ')
  const big = await add(huge)
  const bigTask = (await v('tasks')).find((one) => one.id === big)
  check('a 5,000-letter task title is cut to about 500', bigTask && [...bigTask.title].length <= 500 && bigTask.title.endsWith('…'), String(bigTask?.title.length))
  const full = await v('task', big)
  check('… and its words are kept in full in the notes', JSON.stringify(full?.notes ?? '').includes('word499'))

  // 17 (sweep). The sidebar's Tags: switched on, your tags show under the heading.
  await v('settings:set', { sidebarShown: (shown ?? []).filter((one) => one !== 'tags') }); await wait(800)
  await v('settings:set', { sidebarShown: [...(shown ?? []).filter((one) => one !== 'tags'), 'tags'] }); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-side-tag]')?.scrollIntoView({ block: 'center' })); await wait(500)
  const sideTags = await h.evaluate(() => [...document.querySelectorAll('[data-side-tag]')].filter((one) => one.closest('[inert]') === null).length)
  check('switching Tags on in the sidebar shows your tags', sideTags > 0, String(sideTags))
  await shoot('sidebar-tags')

  // 11, 12, 15. Quick capture: the offers line, Similar to, and a link's site.
  const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
  const fresh = async () => { await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700); await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(300) }
  await fresh()
  await page.keyboard.type('Shelley creature learns from Plutarch and Milton by the fire'); await page.waitForTimeout(1600)
  const offers = await page.evaluate(() => [...document.querySelectorAll('[data-box-offers]')].map((one) => one.innerText).join(' '))
  check('quick capture’s offers line never breaks an emoji', !lone(offers), offers.slice(0, 90))
  await shoot('box-offer', page)
  await fresh()
  await page.keyboard.type(`“${LONG}” said Professor Wiśniewska`); await page.waitForTimeout(1800)
  const like = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((one) => one.getAttribute('aria-label')).find((t) => /^Similar to/.test(t)) ?? '')
  check('“Similar to” never quotes a quote twice', !!like && !/““|“"/.test(like) && !lone(like), like)
  await shoot('box-quote', page)
  await fresh()
  await page.keyboard.type(URL); await page.waitForTimeout(1500)
  const site = await page.evaluate(() => `${document.body.innerText} ${[...document.querySelectorAll('input')].map((one) => one.value).join(' ')}`)
  check('a link’s Where from says “Example University”', /Example University/.test(site) && !/Example-university/.test(site))
  await shoot('box-url', page)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.evaluate(() => window.api.hidePrompt?.()).catch(() => {})
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
