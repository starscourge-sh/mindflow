// Break the meeting page with the worst a meeting can be: two hours with eight speakers (one-word lines among them,
// a long name given to one), a 400-word monologue in one line, and a meeting where nothing was said. Each opens fast,
// runs nothing off the side at desktop or phone width, and says plainly what is there. FRAMES=<folder> keeps a picture
// of each. Silent: notes made directly, no sound at all.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-break.mjs
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'

const FRAMES = process.env.FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860, at: CALM_HOUR })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const text = (words) => (words ? [{ type: 'text', text: words }] : [])
const meeting = (title, lines, speakers, extra = {}) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: text(title) },
    { type: 'meeting', attrs: { audio: '', seconds: lines.at(-1)?.end ?? 0, startedAt: new Date().toISOString(), speakers, names: {}, moments: [], found: lines.length ? { dates: [], actions: lines.filter((one) => /will/.test(one.text)).slice(0, 40).map((one) => ({ text: one.text, at: one.at, speaker: one.who })), questions: [], names: [] } : null, take: null, tag: '#meeting', ...extra } },
    ...lines.map((one) => ({ type: 'meetingLine', attrs: { who: one.who, at: one.at, end: one.end }, content: text(one.text) })),
    { type: 'paragraph' }
  ]
})
const WORDS = 'the plan we said would ship next week and the client wants more time so I will write it up and send it round today'.split(' ')
const say = (n, seed) => Array.from({ length: n }, (_, i) => WORDS[(i * 7 + seed) % WORDS.length]).join(' ')
const open = async (doc, title) => {
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', title: body.content[0].content[0]?.text ?? '', body }), doc)
  const start = Date.now()
  await send('capture', id)
  await h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  await h.waitForFunction((n) => document.querySelectorAll('[data-meeting-line]').length >= n, doc.content.filter((one) => one.type === 'meetingLine').length, { timeout: 30000 })
  return { id, ms: Date.now() - start, title }
}
const overflow = () => h.evaluate(() => [...document.querySelectorAll('[data-meeting-page] *, [data-meeting-line] *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length + (document.scrollingElement.scrollWidth > innerWidth ? 1 : 0))

try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  // Two hours, eight voices, every fifth line one word.
  const lines = []
  for (let at = 0, i = 0; at < 7200; i += 1) {
    const long = i % 5 === 0 ? 1 : 4 + (i % 9)
    lines.push({ who: i % 9 === 0 ? 'you' : `s${(i % 8) + 1}`, text: i % 5 === 0 ? ['Yes.', 'Right.', 'Mm.', 'Sure.'][i % 4] : `${say(long * 3, i)}.`, at, end: at + long })
    at += long + 0.5
  }
  const big = await open(meeting('Two hours, eight people', lines, ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'], { names: { s3: 'Professor Bartholomew Featherstonehaugh-Wainwright' } }), 'two hours')
  const shown = await h.evaluate(() => ({ lines: document.querySelectorAll('[data-meeting-line]').length, voices: document.querySelectorAll('[data-meeting-voice]').length }))
  check('two hours of lines open whole', shown.lines === lines.length, `${shown.lines} of ${lines.length} in ${big.ms}ms`)
  check('eight voices and you, each a name to click', shown.voices === 9, shown.voices)
  const longName = await h.evaluate(() => { const el = document.querySelector('[data-meeting-line][data-who="s3"] [data-speaker]'); return { cut: el.scrollWidth > el.clientWidth, title: el.textContent } })
  check('a long name stays in its gutter, cut with an ellipsis, not over the words', longName.cut, JSON.stringify(longName))
  check('nothing runs off the side (two hours)', !(await overflow()))
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'break-two-hours.png') })
  await h.evaluate(() => document.querySelectorAll('[data-meeting-line]')[40].scrollIntoView())
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'break-one-word-lines.png') })
  // Against the same words as a plain note of paragraphs, opened the same way: the meeting's own drawing adds little.
  const plainDoc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: text('Two hours as plain lines') }, ...lines.map((one) => ({ type: 'paragraph', content: text(one.text) }))] }
  const plainId = await h.evaluate((body) => window.api.captures.create({ kind: 'note', title: 'Two hours as plain lines', body }), plainDoc)
  const plainStart = Date.now()
  await send('capture', plainId)
  await h.waitForFunction((n) => [...document.querySelectorAll('[data-open] .tiptap p')].length >= n, lines.length, { timeout: 30000 })
  const plainMs = Date.now() - plainStart
  check('two hours open about as fast as the same words in a plain note', big.ms < Math.max(5000, plainMs * 1.5), `meeting ${big.ms}ms, plain note ${plainMs}ms`)

  // One 400-word monologue.
  await open(meeting('A monologue', [{ who: 's1', text: `${say(400, 3)}.`, at: 0, end: 160 }], ['s1']), 'monologue')
  check('a 400-word line wraps inside its column', !(await overflow()))
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'break-monologue.png') })

  // Nothing said at all.
  await open(meeting('Nothing said', [], []), 'empty')
  const empty = await h.evaluate(() => document.querySelector('[data-meeting-page]').textContent)
  check('a meeting with no words says so plainly', /Nothing was said to take anything from/.test(empty), empty.slice(0, 200))
  check('and offers no names to click', !(await h.evaluate(() => document.querySelectorAll('[data-meeting-voice]:not([data-meeting-voice="you"])').length)))
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'break-empty.png') })

  // Phone width, the two hours again.
  await open(meeting('Two hours, eight people', lines.slice(0, 400), ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']), 'phone')
  await c.size(390, 844)
  await wait(600)
  check('at phone width nothing runs off the side', !(await overflow()))
  if (FRAMES) await h.screenshot({ path: join(FRAMES, 'break-phone.png') })
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack)
} finally {
  await c.close()
  done()
}
