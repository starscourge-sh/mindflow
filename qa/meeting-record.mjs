// Record a call or lecture, start to page: the card says what is recorded and asks people be told (first time only); the two
// tracks become You and the others, the others split into two voices by sound alone; live lines come in, the newest
// bright and the ones before faded; "Note this moment" keeps the moment with its line; pause stops the clock; stop
// makes the meeting's page (player, the words by speaker, the moments, what to take from it); naming a voice renames
// every line of it; a time plays from there; an action becomes a task with its owner and day; the recording is deleted
// with Undo. HALIGTREE_QA_CAPS=ai checks the Apple Intelligence headings (a stand-in from the meeting program's test
// mode); any other level the found lines. Silent: two made-up tracks (qa/meeting-lib.mjs), never the microphone or
// the Mac's sound. FRAMES=<folder> films the card and the page every 50ms.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-record.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { makeMeeting } from './meeting-lib.mjs'

const fixture = join(process.env.QA_DATA, 'meeting-fixture')
mkdirSync(fixture, { recursive: true })
const made = makeMeeting(fixture)
process.env.HALIGTREE_QA_MEETING = [made.you, made.others, made.script].join('|')
const FRAMES = process.env.FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860, at: CALM_HOUR })
const { electron, h, v } = c
// With Apple Intelligence or without, as the app itself reads this Mac (HALIGTREE_QA_CAPS stands a level in): on a Mac
// with it on (the test Mac, 15 Nov) a test run's recording gets the stand-in's take (main passes --ai-stand-in), so a
// run with no level said, read here as "without", failed its line. "Without" shows only on a Mac without it: the meeting
// program asks macOS itself (native/meeting.swift take), and a level said to main alone gave a page with no take at all.
const caps = await v('caps')
const AI = caps?.major >= 26 && caps?.ai === 'available'
console.log(`(${AI ? 'with' : 'without'} Apple Intelligence, as the app reads this Mac: ${JSON.stringify(caps && { major: caps.major, ai: caps.ai })})`)
const wait = (ms) => h.waitForTimeout(ms)
const card = async () => {
  for (let i = 0; i < 60; i += 1) {
    const one = electron.windows().find((w) => w.url().includes('view=meeting'))
    if (one) return one
    await wait(100)
  }
  return null
}
// Frames every 50ms of a window for `ms`, into FRAMES/name-0001.png.
const film = async (target, name, ms) => {
  if (!FRAMES) return wait(ms)
  const end = Date.now() + ms
  for (let i = 1; Date.now() < end; i += 1) {
    const at = Date.now()
    await target.screenshot({ path: join(FRAMES, `${name}-${String(i).padStart(4, '0')}.png`) }).catch(() => {})
    await wait(Math.max(0, 50 - (Date.now() - at)))
  }
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })

  // 1. The first time: what is recorded, and the line about telling people, before anything records.
  await v('meeting:start', null)
  const m = await card()
  check('the live card opens in a window of its own', !!m)
  await m.waitForSelector('[data-meeting-card="ready"]', { timeout: 8000 })
  const first = await m.evaluate(() => ({ text: document.querySelector('[data-meeting-card]').textContent, consent: document.querySelector('[data-meeting-consent]')?.textContent }))
  check('it says plainly what is recorded', /Your microphone and the sound from this Mac \(the call, in its app or the browser\)/.test(first.text), first.text)
  check('the first time, it asks that people be told', first.consent === 'Let people know you are recording. In many places you must.', first.consent)
  const top = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=meeting')).isAlwaysOnTop())
  check('the card floats over every app', top)
  await film(m, 'start', 300)
  await m.click('[data-meeting-start]')

  // 2. Live: lines come in, the newest bright, the earlier faded; the others told apart by voice.
  await m.waitForSelector('[data-meeting-card="live"]', { timeout: 8000 })
  await film(m, 'live', 5200)
  const live = await m.evaluate(() => [...document.querySelectorAll('[data-meeting-live-line]')].map((p) => ({ text: p.textContent, opacity: Number(getComputedStyle(p).opacity), color: getComputedStyle(p).color })))
  check('live lines appear as they are said', live.length >= 2, JSON.stringify(live))
  check('the newest line is in the ink and the ones before it in Faded Ink, none see-through', live.every((one) => one.opacity === 1) && live.slice(0, -1).every((one) => one.color !== live.at(-1)?.color), JSON.stringify(live.map((one) => [one.opacity, one.color])))
  const time = await m.evaluate(() => document.querySelector('[data-meeting-time]')?.textContent)
  check('the time runs', /^0:0[3-9]$/.test(time ?? ''), time)

  // 3. Note this moment: kept with the line being said.
  await m.click('[data-meeting-mark]')
  await wait(300)
  const marks = await m.evaluate(() => document.querySelectorAll('[data-meeting-live-line] [aria-label="Moment noted"]').length)
  check('"Note this moment" marks the line being said', marks === 1, marks)

  // 4. Pause holds the clock; Go on carries on.
  await m.click('[data-meeting-pause]')
  await m.waitForSelector('[data-meeting-card="paused"]')
  const held = await m.evaluate(() => document.querySelector('[data-meeting-time]').textContent)
  await wait(1500)
  const still = await m.evaluate(() => document.querySelector('[data-meeting-time]').textContent)
  check('paused, the clock holds', held === still, `${held} then ${still}`)
  await m.click('[data-meeting-pause]')
  await m.waitForSelector('[data-meeting-card="live"]')

  // 5. Tucked to a pill and back.
  await m.click('[aria-label="Tuck it away"]')
  await m.waitForSelector('[data-meeting-card="pill"]')
  const pill = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=meeting')).getBounds())
  check('tucked, the card is a small pill', pill.height < 100 && pill.width < 300, JSON.stringify(pill))
  await film(m, 'pill', 400)
  await m.click('[aria-label="Show the words"]')
  await m.waitForSelector('[data-meeting-card="live"]')

  // 6. To the end of the meeting, then stop: the meeting's page opens in the main window.
  // On to the last line, settled.
  const end = Date.now() + 25000
  while (Date.now() < end && !(await m.evaluate(() => [...document.querySelectorAll('[data-meeting-live-line][data-final]')].some((p) => /by the way/.test(p.textContent))))) await film(m, 'live-end', 250)
  await m.click('[data-meeting-stop]')
  await film(m, 'stop', 600)
  await h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  await wait(1200)
  if (FRAMES) await c.both(join(FRAMES, `page-${AI ? 'ai' : 'every'}`))
  const page = await h.evaluate(() => {
    const lines = [...document.querySelectorAll('[data-meeting-line]')].map((el) => ({ who: el.dataset.who, name: el.querySelector('[data-speaker]').textContent, text: el.querySelector('.mf-meeting-words').textContent, marked: el.hasAttribute('data-marked') }))
    return { lines, player: !!document.querySelector('[data-meeting-page] [data-wave]'), take: document.querySelector('[data-meeting-take]')?.dataset.meetingTake, voices: [...document.querySelectorAll('[data-meeting-voice]')].map((b) => b.textContent), moments: document.querySelectorAll('[data-meeting-page] [data-meeting-row]').length, summary: document.querySelector('[data-meeting-summary]')?.textContent ?? null }
  })
  check('stop makes the meeting page with the player', page.player)
  check('every line said is on the page, in order', page.lines.length === made.lines.length && page.lines.every((one, at) => one.text === made.lines[at].text), `${page.lines.length} of ${made.lines.length}`)
  check('your track is You', page.lines.filter((one, at) => made.lines[at].who === 'you').every((one) => one.who === 'you' && one.name === 'You'))
  // Marco and Thandi: two voices, each line of one under one speaker, never mixed.
  const voiceOf = (who) => [...new Set(page.lines.filter((_, at) => made.lines[at].who === who).map((one) => one.who))]
  check('the others are split into two speakers by voice alone', voiceOf('marco').length === 1 && voiceOf('thandi').length === 1 && voiceOf('marco')[0] !== voiceOf('thandi')[0] && voiceOf('marco')[0] !== 'you', `marco ${voiceOf('marco')}, thandi ${voiceOf('thandi')}`)
  check('who was there: You and Speaker 1 and 2', page.voices.join('|') === 'You|Speaker 1|Speaker 2', page.voices.join('|'))
  check('the noted moment is kept with its line', page.lines.filter((one) => one.marked).length === 1)
  check(AI ? 'with Apple Intelligence (a stand-in): the summary and its headings' : 'without Apple Intelligence: the lines found, said to be found', AI ? page.take === 'stand-in' && !!page.summary : page.take === 'found' && !page.summary, `${page.take} ${page.summary}`)

  // A moment is the line being said when it was noted: that line's own start and voice, in both places.
  const moment = await h.evaluate(() => {
    const row = document.querySelector('[data-meeting-page] [data-meeting-row]')
    const line = document.querySelector('[data-meeting-line][data-marked]')
    return { row: row.textContent, time: line.querySelector('.mf-meeting-time').textContent, name: line.querySelector('[data-speaker]').textContent, words: line.querySelector('.mf-meeting-words').textContent }
  })
  check('a noted moment shows its line\'s own start, voice and words, as the transcript does', moment.row.startsWith(moment.time) && moment.row.includes(moment.name) && moment.row.endsWith(moment.words), JSON.stringify(moment))
  // One tag: #recording in Properties, never a second chip in the words.
  const tagged = await h.evaluate(() => ({ property: !!document.querySelector('[data-tag-chip="recording"]'), words: [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain)')].some((one) => one.textContent.includes('#recording')) }))
  check('#recording shows once, as the property tag', tagged.property && !tagged.words, JSON.stringify(tagged))

  // Pointing at every transcript row moves nothing.
  // Measured from the page itself, so scrolling to each row (as the pointer reaches it) is not counted as moving.
  const boxes = () => h.evaluate(() => { const top = document.querySelector('[data-meeting-page]').getBoundingClientRect(); return [...document.querySelectorAll('[data-meeting-line], [data-meeting-line] *, [data-meeting-page] *')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.x - top.x)},${Math.round(r.y - top.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join('|') })
  const still0 = await boxes()
  for (const one of await h.locator('[data-meeting-line]').all()) { await one.hover(); await wait(60) }
  await h.locator('[data-meeting-page] [data-meeting-row]').first().hover(); await wait(200)
  const still1 = await boxes()
  const moved = still0.split('|').map((one, at) => [one, still1.split('|')[at], at]).filter(([a, b]) => a !== b)
  check('stillness: pointing at transcript and moment rows moves nothing', !moved.length, JSON.stringify(moved.slice(0, 4)))

  // 7. Naming a voice renames every line of it.
  const thandi = voiceOf('thandi')[0]
  await h.click(`[data-meeting-line][data-who="${thandi}"] [data-speaker]`)
  await h.waitForSelector('[data-meeting-naming] input')
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'naming.png') })
  await h.keyboard.type('Thandi')
  await h.keyboard.press('Enter')
  await wait(400)
  const named = await h.evaluate((who) => [...document.querySelectorAll(`[data-meeting-line][data-who="${who}"] [data-speaker]`)].map((el) => el.textContent), thandi)
  check('naming a speaker renames every line of that voice', named.length === 3 && named.every((one) => one === 'Thandi'), named.join(','))
  check('and the voice in who was there', await h.evaluate((who) => document.querySelector(`[data-meeting-voice="${who}"]`).textContent === 'Thandi', thandi))

  // The naming popover beside the app's other small popover ("Add property").
  if (FRAMES) {
    await h.click('[data-meeting-line][data-who="' + voiceOf('marco')[0] + '"] [data-speaker]'); await h.waitForSelector('[data-meeting-naming]'); await wait(250)
    const pop = await h.evaluate(() => { const r = document.querySelector('[data-meeting-naming]').getBoundingClientRect(); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 } })
    await h.screenshot({ path: join(FRAMES, 'naming-popover.png'), clip: pop }); await h.keyboard.press('Escape'); await wait(200)
    const add = h.getByText('Add property', { exact: true }).first()
    if (await add.isVisible().catch(() => false)) { await add.click({ timeout: 3000 }); await wait(400); await h.screenshot({ path: join(FRAMES, 'sibling-add-property.png') }); await h.keyboard.press('Escape'); await wait(200) }
  }
  // 8. A time plays the recording from that moment.
  await h.locator('[data-meeting-line] .mf-meeting-time').nth(3).click()
  await wait(500)
  const playing = await h.evaluate(() => { const a = document.querySelector('[data-meeting-page] audio'); const t = a.currentTime; a.pause(); return t })
  check('a line\'s time plays from its moment', playing >= made.lines[3].start - 0.2 && playing < made.lines[3].start + 1.5, `${playing} for ${made.lines[3].start}`)

  // 9. An action becomes a task, with its owner and the day said.
  const before = (await v('tasks')).length
  // The item is the line written down ("send them by Friday"), its row holding the button.
  const row = await h.evaluate(() => [...document.querySelectorAll('[data-meeting-task]')].findIndex((b) => /Friday/.test(b.closest('[data-meeting-item]').textContent)))
  await h.locator('[data-meeting-item]').nth(Math.max(0, row)).hover()
  await h.locator('[data-meeting-task]').nth(row).click()
  await wait(800)
  const tasks = await v('tasks')
  const task = tasks.find((one) => /^Thandi: .*send them/.test(one.title))
  check('an action becomes a task with its owner', tasks.length === before + 1 && !!task, tasks.at(-1)?.title)
  const friday = new Date(made.at ?? Date.now()); while (friday.getDay() !== 5) friday.setDate(friday.getDate() + 1)
  check('and the day said (Friday)', !!task && JSON.stringify(task).includes(friday.toISOString().slice(0, 10)), JSON.stringify(task ?? {}).slice(0, 300))

  // 10. The recording deleted, the words kept; Undo brings it back.
  await h.click('[data-meeting-page] [data-meeting-voices]', { button: 'right' })
  await wait(300)
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'menu.png') })
  await h.click('[data-meeting-drop-audio]', { timeout: 5000 })
  await wait(400)
  const gone = await h.evaluate(() => ({ player: !!document.querySelector('[data-meeting-page] [data-wave]'), said: !!document.querySelector('[data-meeting-no-audio]'), lines: document.querySelectorAll('[data-meeting-line]').length }))
  check('deleting the recording keeps the words', !gone.player && gone.said && gone.lines === made.lines.length, JSON.stringify(gone))
  await h.keyboard.press('Meta+z')
  await wait(500)
  check('⌘Z brings the recording back', await h.evaluate(() => !!document.querySelector('[data-meeting-page] [data-wave]')))
  // ⌘K to a moment: a search hit on a line opens the meeting there, the line lit, the player waiting at its time.
  await c.go('today'); await wait(600)
  await h.keyboard.press('Meta+k'); await wait(500)
  // Typed into the palette's own field, all of it (keys sent while it was still opening were lost).
  await h.waitForSelector('input[placeholder], [cmdk-input], input[type="search"]', { timeout: 5000 }).catch(() => {})
  await h.evaluate(() => document.activeElement?.select?.())
  await h.keyboard.type('share the research notes', { delay: 25 }); await wait(1200)
  const hit = await h.evaluate(() => [...document.querySelectorAll('[data-found-line]')].map((one) => one.textContent))
  // The meeting's row, as a person picks it from the list.
  // Picked from the list with Return, as from the keyboard: the meeting is the first row.
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-meeting-line][data-found]', { timeout: 8000 }).catch(() => {})
  const landed = await h.evaluate(() => { const one = document.querySelector('[data-meeting-line][data-found]'); const a = document.querySelector('[data-meeting-page] audio'); const r = one?.getBoundingClientRect(); return one && { words: one.textContent, at: Number(one.dataset.at), time: a.currentTime, paused: a.paused, seen: r.top > 0 && r.bottom < innerHeight } })
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'search-jump.png') })
  check('⌘K finds a line said in a meeting', hit.some((one) => /share the research notes/.test(one)), hit.join(' | '))
  check('and opens the page on it: in sight, lit, the player paused at its time', !!landed && /share the research notes/.test(landed.words) && landed.seen && landed.paused && Math.abs(landed.time - landed.at) < 0.3, JSON.stringify(landed))
  await wait(1800)
  check('the light goes after a moment', await h.evaluate(() => !document.querySelector('[data-meeting-line][data-found]')))

  // The same with the mouse, as most people pick: the hit clicked in the list.
  await c.go('today'); await wait(600)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.waitForSelector('input[placeholder], [cmdk-input], input[type="search"]', { timeout: 5000 }).catch(() => {})
  await h.evaluate(() => document.activeElement?.select?.())
  await h.keyboard.type('ship the beta next week', { delay: 25 }); await wait(1200)
  console.log('hits:', await h.evaluate(() => [...document.querySelectorAll('[data-found-line]')].map((one) => one.parentElement.textContent.slice(0, 80) + ' :: ' + one.textContent.slice(0, 60)).join(' | ')))
  await h.locator('[data-found-line]', { hasText: 'ship the beta next week' }).first().click({ timeout: 5000 })
  await h.waitForSelector('[data-meeting-line][data-found]', { timeout: 8000 }).catch(() => {})
  const clicked = await h.evaluate(() => { const one = document.querySelector('[data-meeting-line][data-found]'); const a = document.querySelector('[data-meeting-page] audio'); const r = one?.getBoundingClientRect(); return { found: !!one, words: one?.textContent, at: one ? Number(one.dataset.at) : null, time: a?.currentTime, paused: a?.paused, seen: !!r && r.top > 0 && r.bottom < innerHeight } })
  if (FRAMES) await h.screenshot({ path: join(FRAMES, `search-click-${AI ? 'ai' : 'every'}.png`) })
  check('clicked with the mouse, the hit opens the page on its line: in sight, lit, the player paused at its time', clicked.found && /ship the beta next week/.test(clicked.words) && clicked.seen && clicked.paused && Math.abs(clicked.time - clicked.at) < 0.3, JSON.stringify(clicked))

  // At phone width: nothing runs off the side, every line's name and time still beside its words.
  await c.size(390, 844)
  await h.evaluate(() => document.querySelector('[data-meeting-line]')?.scrollIntoView())
  await wait(500)
  if (FRAMES) await h.screenshot({ path: join(FRAMES, `phone-${AI ? 'ai' : 'every'}.png`) })
  const narrow = await h.evaluate(() => { const page = document.querySelector('[data-meeting-page]').getBoundingClientRect(); const over = [...document.querySelectorAll('[data-meeting-page] *, [data-meeting-line] *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length; return { over, scroll: document.scrollingElement.scrollWidth > innerWidth, width: Math.round(page.width) } })
  check('at phone width nothing runs off the side', !narrow.over && !narrow.scroll, JSON.stringify(narrow))
  // The card is gone once the meeting is kept.
  check('the card closes once the meeting is kept', !electron.windows().some((w) => w.url().includes('view=meeting')))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').filter((one) => /meeting-record|Timeout|waiting for/.test(one)).join(' / '))
} finally {
  await c.close()
  done()
}
