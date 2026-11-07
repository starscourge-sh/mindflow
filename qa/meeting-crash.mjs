// A recording survives a crash. Made-up audio only, never the microphone or the Mac's sound, off screen and silent.
// The meeting program killed outright mid-recording; the app killed with the program alive; a pause during the crash;
// a second crash during recovery; a crash after keeping; another recording running; next to no sound; a full disk (a
// real one, a small disk image nothing can see); a program that refuses to start. Each restarts on the same data folder.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-crash.mjs
//   FRAMES=<folder> also writes the offer in light and dark, beside a normal notice, and at phone width.
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { makeMeeting } from './meeting-lib.mjs'

const FRAMES = process.env.FRAMES
const DATA = process.env.QA_DATA
const { check, done } = checks()
const fixture = join(DATA, 'meeting-fixture')
mkdirSync(fixture, { recursive: true })
const made = makeMeeting(fixture, { repeat: 4 })
process.env.HALIGTREE_QA_MEETING = [made.you, made.others, made.script].join('|')
const meetings = join(DATA, process.env.QA_ARGS?.includes('--sandbox') ? 'sandbox' : '', 'meetings')
const folders = () => (existsSync(meetings) ? readdirSync(meetings).filter((one) => !one.startsWith('.')) : [])
const FRAMES_ONLY = new Error('frames only')
/** A recording left behind by hand, from the made-up sound: for the cases that need several. */
const plant = (root, id, startedAt, seconds = 8) => {
  const from = join(root, id)
  mkdirSync(from, { recursive: true })
  for (const side of ['you', 'others']) writeFileSync(join(from, `${side}.pcm`), readFileSync(join(fixture, `${side}.wav`)).subarray(44, 44 + seconds * 32000))
  writeFileSync(join(from, 'recording.json'), JSON.stringify({ startedAt, event: null, words: 'test' }))
}
/** A recorder on a full disk: it records 8 seconds and cannot finish them, whether stopped or asked to recover. */
const noRoomProgram = () => {
  const file = join(DATA, 'no-room.sh')
  writeFileSync(file, `#!/bin/sh
if [ "$1" = record ]; then
  head -c 256000 /dev/zero > "$2/you.pcm"
  head -c 256000 /dev/zero > "$2/others.pcm"
  echo '{"ready":{"live":"test","locale":"en_ZA","test":true}}'
  read line
fi
cat <<'JSON'
{"error":{"code":"disk","message":"There is no room on this Mac's disk to finish the recording. Nothing is lost: free up some space and it can be finished."}}
JSON
exit 1
`)
  chmodSync(file, 0o755)
  return file
}
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sleep = (ms) => new Promise((go) => setTimeout(go, ms))

let c = null
const launch = async () => {
  c = await sandbox({ width: 1200, height: 860, at: CALM_HOUR })
  await c.v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  await c.h.waitForTimeout(800)
  return c
}
/** Gone at once, as a crash goes: nothing is told. */
const crash = async () => {
  const run = c.electron.process()
  await new Promise((gone) => (run.once('exit', gone), run.kill('SIGKILL')))
  c = null
}
const quit = async () => {
  await c.close()
  c = null
}
const helpers = () => {
  try {
    return execFileSync('pgrep', ['-f', `meeting record ${meetings}`]).toString().trim().split('\n').filter(Boolean).map(Number)
  } catch {
    return []
  }
}
const until = async (test, ms = 10000) => {
  const started = Date.now()
  while (Date.now() - started < ms) {
    if (await test()) return true
    await sleep(100)
  }
  return false
}
/** Started through the real card, in test mode; resolves with the card once it is recording. */
const start = async () => {
  await c.v('meeting:start', null)
  let card = null
  await until(() => (card = c.electron.windows().find((w) => w.url().includes('view=meeting'))))
  const first = await card.waitForSelector('[data-meeting-card="ready"], [data-meeting-card="live"]', { timeout: 10000 })
  if ((await first.getAttribute('data-meeting-card')) === 'ready') await card.click('[data-meeting-start]')
  await card.waitForSelector('[data-meeting-card="live"]', { timeout: 10000 })
  return card
}
const offers = () => c.h.locator('[data-recording-left]')
const offerShows = async (ms = 8000) => { try { await offers().first().waitFor({ timeout: ms }); return true } catch { return false } }
const offerText = async () => (await offers().first().textContent()).trim()
const stillOne = async (name) => {
  await c.h.waitForTimeout(1200)
  check(`${name}: the offer shows once, and stays`, (await offers().count()) === 1, await offers().count())
}
const notes = () => c.h.evaluate(async () => {
  const all = await window.api.captures.list()
  return (Array.isArray(all) ? all : all.captures ?? []).filter((one) => one.source === 'Meeting').length
})
/** What a kept page shows and holds. */
const pageSays = () => c.h.evaluate(async () => {
  const page = document.querySelector('[data-meeting-page]')
  const audio = page.querySelector('[data-meeting-player] audio')
  const duration = (src) => new Promise((go) => { if (!src) return go(0); const one = new Audio(); one.preload = 'metadata'; one.onloadedmetadata = () => go(one.duration); one.onerror = () => go(-1); one.src = src })
  const held = await window.api.captures.get(page.closest('[data-open]').dataset.open)
  const meeting = (typeof held.body === 'string' ? JSON.parse(held.body) : held.body).content.find((one) => one.type === 'meeting').attrs
  const peaks = await window.api.haligtree('media:peaks', audio.src)
  return {
    length: Number(page.querySelector('[data-sound-player]').dataset.length), file: await duration(audio.src), you: await duration(meeting.you), others: await duration(meeting.others),
    peaks: peaks?.seconds, stopped: page.querySelector('[data-meeting-stopped]')?.textContent ?? null, lines: meeting.lines, moments: meeting.moments, seconds: meeting.seconds, speakers: meeting.speakers, title: held.title
  }
})
const near = (a, b, by = 2) => Math.abs(a - b) <= by
/** Every line finished by `at` is on the page, its time, and its words, and who said it as the made-up meeting says. */
const wordsCheck = (name, got, at) => {
  const want = made.lines.filter((one) => one.end + 0.5 < at)
  const has = want.filter((one) => got.lines.some((line) => line.text === one.text && near(line.at, one.start, 0.2) && (one.who === 'you') === (line.who === 'you')))
  check(`${name}: the words said before it stopped are kept, with their times and speakers`, want.length >= 2 && has.length === want.length, `${has.length} of ${want.length} lines by ${at.toFixed(1)}s`)
}
const keepAndCheck = async (name, recorded) => {
  await c.h.click('[data-recording-left-keep]')
  await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  await c.h.waitForTimeout(1500)
  const got = await pageSays()
  check(`${name}: "Keep" gives a page whose length matches what was recorded`, near(got.length, recorded), `${got.length}s, recorded ${recorded.toFixed(1)}s`)
  check(`${name}: the sound plays that long, both tracks in step`, near(got.file, got.length, 0.3) && near(got.you, got.length, 0.3) && near(got.others, got.length, 0.3) && near(got.peaks, got.length, 0.3), `file ${got.file}, you ${got.you}, others ${got.others}, waveform ${got.peaks}`)
  check(`${name}: the page says plainly it stopped early`, /stopped early/.test(got.stopped ?? ''), got.stopped)
  check(`${name}: the offer has gone and so has the folder`, (await offers().count()) === 0 && folders().length === 0, folders())
  return got
}

try {
  // ---- 1. The program killed outright, the app alive.
  await launch()
  check('a new book has nothing to offer', (await offers().count()) === 0)
  let card = await start()
  await sleep(4000)
  await c.v('meeting:mark')
  await sleep(4000)
  let pids = helpers()
  const before = await c.v('meeting:state')
  check('1: the program is recording', pids.length === 1, pids)
  process.kill(pids[0], 'SIGKILL')
  const recorded1 = (await c.v('meeting:state')).seconds ?? before.seconds
  await card.waitForSelector('text="The recording stopped"', { timeout: 8000 }).catch(() => {})
  const said = await card.locator('body').textContent()
  check('1: the card says the recording stopped and what is safe, not that nothing was recorded', /The recording stopped/.test(said) && /is safe/.test(said) && !/Nothing was recorded/.test(said), said.trim())
  if (FRAMES) for (const name of ['light', 'dark']) { await c.look(name); await card.waitForTimeout(400); await card.screenshot({ path: join(FRAMES, `card-stopped-${name}.png`) }) }
  if (FRAMES) await c.look('light')
  check('1: offered at once in the main window, without bringing it forward', await offerShows())
  await crash()
  await launch()
  check('1: after a restart it is offered', await offerShows())
  check('1: in the words the person would use', /^A recording from today at 14:1\d stopped early: \d+ sec kept/.test(await offerText().catch(() => '')), await offerText().catch(() => ''))
  await stillOne('1')
  const box = await offers().first().boundingBox().catch(() => null)
  // A notice comes above it, and it holds still; so does the page behind.
  const held = () => c.h.evaluate(() => [...document.querySelectorAll('[data-recording-left-keep], [data-recording-left-discard], nav, h1')].map((one) => { const r = one.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join() }).join(' '))
  const still = await held()
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: 'Moved to the Bin', tone: 'success', undo: () => {} } })))
  await c.h.waitForTimeout(450)
  check('1: a notice arriving moves neither choice nor the page', (await held()) === still, still)
  if (FRAMES && box) {
    // Beside a normal notice (up now), in both themes, then alone and at phone width.
    await c.both(join(FRAMES, 'offer-beside-notice'))
    await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
    await c.h.waitForTimeout(350)
    await c.both(join(FRAMES, 'offer'))
    await c.size(390, 844)
    await c.h.waitForTimeout(400)
    await c.both(join(FRAMES, 'offer-phone'))
    const phone = await c.h.evaluate(() => { const r = document.querySelector('[data-recording-left]').getBoundingClientRect(); return { x: r.x, right: r.right, width: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth, keep: document.querySelector('[data-recording-left-keep]').getBoundingClientRect().height } })
    check('phone width: nothing cut off, tap height at least 32', phone.x >= 8 && phone.right <= phone.width - 8 && !phone.sideways && phone.keep >= 32, JSON.stringify(phone))
    await c.size(1200, 860)
    const burst = async (name, n = 12) => { for (let i = 0; i < n; i += 1) await c.h.screenshot({ path: join(FRAMES, `${name}-${String(i).padStart(2, '0')}.png`) }) }
    await c.h.click('[data-recording-left-discard]')
    await burst('discard')
    await c.h.click('button:has-text("Undo")')
    await burst('undo')
    await c.h.click('[data-recording-left-keep]')
    await burst('keep', 20)
    await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
    await c.h.waitForTimeout(1500)
    await c.both(join(FRAMES, 'kept-page'))
    await crash()
    // The disk too full to finish: on the card, then on the offer.
    process.env.HALIGTREE_QA_MEETING_PROGRAM = noRoomProgram()
    await launch()
    const stoppedCard = await start()
    await c.v('meeting:stop')
    await stoppedCard.waitForSelector('text="The recording stopped"', { timeout: 8000 })
    for (const name of ['light', 'dark']) { await c.look(name); await stoppedCard.waitForTimeout(400); await stoppedCard.screenshot({ path: join(FRAMES, `card-no-room-${name}.png`) }) }
    await c.look('light')
    await c.v('meeting:stop')
    await offers().first().waitFor({ timeout: 8000 })
    await c.h.click('[data-recording-left-keep]')
    await c.h.waitForSelector('[data-recording-left-trouble]', { timeout: 8000 })
    await c.both(join(FRAMES, 'offer-no-room'))
    delete process.env.HALIGTREE_QA_MEETING_PROGRAM
    await crash()
    throw FRAMES_ONLY
  }
  const cursor = await c.h.evaluate(() => ['keep', 'discard'].map((one) => getComputedStyle(document.querySelector(`[data-recording-left-${one}]`)).cursor)).catch(() => [])
  check('1: both choices show the hand', cursor.every((one) => one === 'pointer') && cursor.length === 2, cursor)
  const got1 = await keepAndCheck('1', recorded1)
  wordsCheck('1', got1, recorded1)
  // A moment lands on the line being said when it was noted: that line's start, here at most the 4 seconds it was noted at.
  check('1: the moment noted is kept', got1.moments.length === 1 && got1.moments[0].at <= 5, JSON.stringify(got1.moments))
  check('1: the voices are told apart', got1.speakers.length >= 2, got1.speakers)
  check('1: kept once', (await notes()) === 1, await notes())
  await crash()
  await launch()
  check('1: not offered again after it was kept', (await offers().count()) === 0 && folders().length === 0)
  await c.h.waitForTimeout(800)

  // ---- 2. The app killed with the program alive.
  card = await start()
  await sleep(6000)
  const recorded2 = (await c.v('meeting:state')).seconds
  pids = helpers()
  check('2: the program is recording', pids.length === 1, pids)
  await crash()
  check('2: the program lets go once the app has gone', await until(() => helpers().length === 0), helpers())
  await launch()
  check('2: offered after the restart', await offerShows())
  await stillOne('2')
  // Discard, with Undo: the folder goes, comes back, and goes for good at the next opening.
  await c.h.click('[data-recording-left-discard]')
  await c.h.waitForSelector('text=Recording discarded', { timeout: 5000 })
  check('2: "Discard" takes the folder and the offer away', folders().length === 0 && await until(async () => (await offers().count()) === 0, 1000), folders())
  await c.h.click('button:has-text("Undo")')
  check('2: "Undo" brings the offer back', await offerShows(4000))
  check('2: and the folder', folders().length === 1, folders())
  await c.h.click('[data-recording-left-discard]')
  await c.h.waitForSelector('text=Recording discarded', { timeout: 5000 })
  await c.h.keyboard.press('Meta+z')
  check('2: \u2318Z brings it back too', await offerShows(4000) && folders().length === 1, folders())
  await c.h.focus('[data-recording-left-discard]')
  await c.h.keyboard.press('Enter')
  await c.h.waitForSelector('text=Recording discarded', { timeout: 5000 })
  await crash()
  await launch()
  check('2: discarded stays discarded after a restart', (await offers().count()) === 0 && folders().length === 0 && !existsSync(join(meetings, '.discarded')), readdirSync(meetings))
  check('2: nothing was kept', (await notes()) === 1, await notes())

  // ---- 3. A pause during the crash: paused time is not counted; the recording ends where the pause began.
  card = await start()
  await sleep(6000)
  await c.v('meeting:pause', true)
  const recorded3 = (await c.v('meeting:state')).seconds
  await sleep(4000)
  process.kill(helpers()[0], 'SIGKILL')
  await until(() => helpers().length === 0)
  await crash()
  // A recorder still busy finishing it, so the crash lands during "Keep" every time (a short recording finishes too fast to catch).
  const busy = join(DATA, 'busy.sh')
  writeFileSync(busy, '#!/bin/sh\nexec sleep 20\n')
  chmodSync(busy, 0o755)
  process.env.HALIGTREE_QA_MEETING_PROGRAM = busy
  await launch()
  check('3: paused and killed: offered', await offerShows())
  // ---- 4. A crash during recovery: nothing lost, offered again.
  await c.h.click('[data-recording-left-keep]')
  await c.h.waitForTimeout(500)
  await crash()
  delete process.env.HALIGTREE_QA_MEETING_PROGRAM
  await launch()
  check('4: crashed during "Keep": offered again, once', await offerShows())
  await stillOne('4')
  const beforeKeep = await notes()
  const copy = mkdtempSync(join(tmpdir(), 'crash-copy-'))
  cpSync(join(meetings, folders()[0]), join(copy, folders()[0]), { recursive: true })
  const got3 = await keepAndCheck('3', recorded3)
  wordsCheck('3', got3, recorded3)
  check('3: kept once', (await notes()) === (beforeKeep <= 2 ? 2 : beforeKeep), await notes())
  // ---- 5. A crash after the note was kept and before its folder was cleared: never kept twice.
  await crash()
  cpSync(copy, meetings, { recursive: true })
  rmSync(copy, { recursive: true, force: true })
  await launch()
  check('5: crashed after keeping: the folder is cleared, not offered', (await offers().count()) === 0 && folders().length === 0, folders())
  check('5: no second page', (await notes()) === 2, await notes())

  // ---- 6. Not while another recording is running; then offered.
  card = await start()
  await sleep(5000)
  process.kill(helpers()[0], 'SIGKILL')
  check('6: offered', await offerShows())
  await c.v('meeting:stop')
  await c.h.waitForTimeout(400)
  card = await start()
  await c.h.waitForTimeout(800)
  check('6: while another records, it is not offered', (await offers().count()) === 0)
  await sleep(4000)
  await c.v('meeting:stop')
  await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  check('6: a normal recording still ends in its page, saying nothing about stopping early', (await c.h.locator('[data-meeting-stopped]').count()) === 0)
  check('6: offered again once it is over', await offerShows())
  check('6: only the left-behind folder remains', folders().length === 1, folders())
  await c.h.click('[data-recording-left-discard]')
  await c.h.waitForSelector('text=Recording discarded', { timeout: 5000 })
  check('6: discarded', folders().length === 0)

  // ---- 7. Under a few seconds: cleared without asking.
  await c.v('meeting:stop')
  card = await start()
  await sleep(900)
  process.kill(helpers()[0], 'SIGKILL')
  await until(() => helpers().length === 0)
  await c.h.waitForTimeout(800)
  check('7: a second of sound is cleared without asking', (await offers().count()) === 0 && folders().length === 0, folders())
  await c.v('meeting:stop')
  await crash()

  // ---- 8. The disk runs out: stops itself and keeps what it has. A probe's disk in the app; a real one below.
  process.env.HALIGTREE_QA_MEETING_ROOM = String((16 << 20) + 500000)
  await launch()
  card = await start()
  await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  await c.h.waitForTimeout(1000)
  const got8 = await pageSays()
  check('8: disk full: recording stopped by itself, what it has kept as a page saying why', /stopped early because the disk was full/.test(got8.stopped ?? '') && got8.length > 1, `${got8.stopped} (${got8.length}s)`)
  check('8: its folder is cleared', folders().length === 0, folders())
  delete process.env.HALIGTREE_QA_MEETING_ROOM
  await crash()

  // ---- 9. No room to finish it on "Keep": says so, stays offered, nothing lost; then, with room, it keeps.
  await launch()
  card = await start()
  await sleep(8000)
  const recorded9 = (await c.v('meeting:state')).seconds
  await crash()
  const fake = noRoomProgram()
  await until(() => helpers().length === 0)
  process.env.HALIGTREE_QA_MEETING_PROGRAM = fake
  await launch()
  check('9: offered', await offerShows())
  await c.h.click('[data-recording-left-keep]')
  await c.h.waitForSelector('[data-recording-left-trouble]', { timeout: 8000 }).catch(() => {})
  const trouble = await c.h.locator('[data-recording-left-trouble]').textContent().catch(() => '')
  check('9: no room to finish: it says so and is still offered', /no room/.test(trouble) && (await offers().count()) === 1 && folders().length === 1, trouble)
  if (FRAMES) await c.both(join(FRAMES, 'offer-no-room'))
  delete process.env.HALIGTREE_QA_MEETING_PROGRAM
  await crash()
  await launch()
  check('9: room again: offered again', await offerShows())
  await keepAndCheck('9', recorded9)
  await crash()
  // Stopped by hand with no room to finish: the card says so, and it is offered.
  process.env.HALIGTREE_QA_MEETING_PROGRAM = fake
  await launch()
  card = await start()
  await c.v('meeting:stop')
  await card.waitForSelector('text="The recording stopped"', { timeout: 8000 }).catch(() => {})
  check('9: stopped with no room: the card says why, and that it is safe', /8 sec is safe, but the disk is too full/.test(await card.locator('body').textContent()), (await card.locator('body').textContent()).trim())
  check('9: and it is offered', await offerShows())
  await c.h.click('[data-recording-left-discard]')
  await c.h.waitForSelector('text=Recording discarded', { timeout: 5000 })
  delete process.env.HALIGTREE_QA_MEETING_PROGRAM
  await crash()

  // ---- 10. The program refusing to start: the app says so and stays up, leaving nothing behind.
  process.env.HALIGTREE_QA_MEETING_PROGRAM = join(DATA, 'no-such-program')
  await launch()
  await c.v('meeting:start', null)
  await until(() => (card = c.electron.windows().find((w) => w.url().includes('view=meeting'))))
  await card.waitForSelector('[data-meeting-card="ready"], [data-meeting-card="live"], text=Nothing was recorded', { timeout: 8000 }).catch(() => {})
  if (await card.locator('[data-meeting-start]').count()) await card.click('[data-meeting-start]')
  await card.waitForSelector('text=Nothing was recorded', { timeout: 8000 }).catch(() => {})
  check('10: it will not start: the card says so plainly', /could not start/.test(await card.locator('body').textContent()), await card.locator('body').textContent())
  check('10: nothing is left behind', folders().length === 0, folders())
  check('10: the app is still up', (await c.v('meeting:state')).state === 'failed')
  await c.v('meeting:stop')
  delete process.env.HALIGTREE_QA_MEETING_PROGRAM
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
  await quit()

  // ---- 11. Several left behind, each in its own book. In My book: its own, one at a time, oldest first, the book's own
  // kept there. The other book's is not offered here and not touched, and is offered there.
  const book = 'b-0123456789'
  writeFileSync(join(DATA, 'books.json'), JSON.stringify({ books: [{ id: book, name: 'Other', createdAt: new Date().toISOString() }] }))
  const inBook = join(DATA, 'books', book, 'meetings'), inMine = join(DATA, 'meetings')
  plant(inBook, uuid(3), new Date(Date.now() - 3600000).toISOString())
  plant(inMine, uuid(2), new Date(Date.now() - 86400000).toISOString())
  plant(inMine, uuid(1), new Date(Date.now() - 2 * 86400000).toISOString())
  plant(inMine, uuid(4), new Date(Date.now() - 3 * 86400000).toISOString())
  const args = process.env.QA_ARGS
  process.env.QA_ARGS = ''
  const past = async () => {
    c = await sandbox({ width: 1200, height: 860, seeded: false })
    await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
    await c.h.reload()
    await c.h.waitForTimeout(1200)
  }
  await past()
  check('11: three left in this book: the oldest first', await offerShows(15000) && (await offers().first().getAttribute('data-recording-left')) === uuid(4))
  // A double click answers one recording, never the next too.
  await c.h.dblclick('[data-recording-left-discard]')
  await c.h.waitForFunction((id) => document.querySelector(`[data-recording-left="${id}"]`), uuid(1), { timeout: 5000 })
  await c.h.waitForTimeout(400)
  check('11: a double click on "Discard" answers one', folders.length !== undefined && existsSync(join(inMine, uuid(1))) && !existsSync(join(inMine, uuid(4))), readdirSync(inMine))
  check('11: one at a time, saying how many more', (await offers().count()) === 1 && (await offers().first().getAttribute('data-recording-left')) === uuid(1) && /\(1 more after this\)/.test(await offerText()), await offerText())
  const box11 = () => c.h.evaluate(() => { const r = document.querySelector('[data-recording-left-discard]').getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}` })
  const at11 = await box11()
  await c.h.click('[data-recording-left-discard]')
  await c.h.waitForFunction((id) => document.querySelector(`[data-recording-left="${id}"]`), uuid(2), { timeout: 5000 })
  await c.h.waitForTimeout(500)
  check('11: then the next, with "Discard" where it was', (await box11()) === at11, `${at11} then ${await box11()}`)
  await c.h.click('[data-recording-left-keep]')
  await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  check('11: the other book\'s is not offered here, and is untouched', (await offers().count()) === 0 && existsSync(join(inBook, uuid(3), 'you.pcm')))
  await crash()
  process.env.QA_ARGS = `--book=${book}`
  await past()
  check('11: offered in the book it was recorded in', await offerShows(15000) && (await offers().first().getAttribute('data-recording-left')) === uuid(3))
  await c.h.click('[data-recording-left-keep]')
  await c.h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  check('11: kept in that book, its folder cleared', !existsSync(join(inBook, uuid(3))) && (await notes()) === 1, await notes())
  check('no errors on the page in either book', !c.errors.length, c.errors.join(' | '))
  await crash()
  process.env.QA_ARGS = args

  // ---- 12. A real full disk, on a small disk image no window sees: the program alone, made-up audio.
  const program = join(fileURLToPath(new URL('..', import.meta.url)), 'resources/meeting')
  const image = join(DATA, 'small.dmg')
  const volume = join(DATA, 'small')
  execFileSync('hdiutil', ['create', '-size', '20m', '-fs', 'HFS+', '-volname', 'crashqa', image], { stdio: 'ignore' })
  execFileSync('hdiutil', ['attach', image, '-nobrowse', '-mountpoint', volume], { stdio: 'ignore' })
  try {
    const run = async (args, stdinLine) => {
      const one = spawn(program, args)
      let out = ''
      one.stdout.on('data', (chunk) => (out += chunk))
      if (stdinLine) one.stdin.write(stdinLine)
      return { one, out: () => out, ended: new Promise((go) => one.on('close', go)) }
    }
    const fullFolder = join(volume, 'stopped')
    const a = await run(['record', fullFolder, 'en_ZA', '--test', made.you, made.others, made.script, '--speed', '20'])
    // Never left waiting if the disk did not fill: the made-up meeting ends before a roomier disk would.
    const code = await Promise.race([a.ended, sleep(30000).then(() => (a.one.kill('SIGKILL'), 'still running after 30s'))])
    check('12: a real disk filling: the program stops by itself and says why', code === 0 && /"code":"disk"/.test(a.out()) && /"saved"/.test(a.out()) && /"stopped":"disk"/.test(a.out()), `exit ${code}`)
    const readable = ['you', 'others', 'meeting'].map((name) => { try { return /estimated duration: ([\d.]+)/.exec(execFileSync('afinfo', [join(fullFolder, `${name}.m4a`)]).toString())?.[1] } catch { return null } })
    check('12: its three files open', readable.every(Boolean), readable)
    // Filled to the brim, then killed: "recover" says there is no room and changes nothing; with room it works.
    rmSync(fullFolder, { recursive: true, force: true })
    const killedFolder = join(volume, 'killed')
    const b = await run(['record', killedFolder, 'en_ZA', '--test', made.you, made.others, made.script, '--speed', '4'])
    await sleep(2500)
    b.one.kill('SIGKILL')
    await b.ended
    const brim = join(volume, 'brim')
    try { execFileSync('dd', ['if=/dev/zero', `of=${brim}`, 'bs=1m'], { stdio: 'ignore' }) } catch { /* it ends when the disk is full */ }
    const size = statSync(join(killedFolder, 'others.pcm')).size
    const c1 = await run(['recover', killedFolder])
    const refused = await c1.ended
    check('12: no room at all: "recover" refuses and the sound is untouched', refused === 1 && /"code":"disk"/.test(c1.out()) && statSync(join(killedFolder, 'others.pcm')).size === size, `exit ${refused}`)
    rmSync(brim, { force: true })
    const c2 = await run(['recover', killedFolder])
    check('12: room again: "recover" finishes it', (await c2.ended) === 0 && /"saved"/.test(c2.out()), c2.out().slice(0, 80))
    // ---- 13. The real program killed while it makes the files: the sound is untouched and the next go finishes it.
    const long = join(DATA, 'long')
    mkdirSync(long)
    const sound = Buffer.alloc(32000 * 1800, 1)
    for (const side of ['you', 'others']) writeFileSync(join(long, `${side}.pcm`), sound)
    const d1 = await run(['recover', long])
    await sleep(400)
    d1.one.kill('SIGKILL')
    await d1.ended
    check('13: killed while making the files: none is passed off as finished, the sound is untouched', !existsSync(join(long, 'meeting.m4a')) && statSync(join(long, 'others.pcm')).size === sound.length, readdirSync(long))
    const d2 = await run(['recover', long])
    check('13: the next go finishes it', (await d2.ended) === 0 && /"seconds":1800/.test(d2.out()), d2.out().slice(0, 60))
  } finally {
    execFileSync('hdiutil', ['detach', volume, '-force'], { stdio: 'ignore' })
  }
} catch (error) {
  if (error !== FRAMES_ONLY) check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  if (c) await crash().catch(() => {})
  done()
}
