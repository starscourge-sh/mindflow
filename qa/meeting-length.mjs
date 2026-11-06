// A meeting's length is one length everywhere: a 10-minute made-up meeting (talk for its first three minutes, then
// quiet, as when a call app stops playing) recorded through the card; the page's "10:00 long", the player's length,
// the sound file's own length, both tracks' lengths and the waveform's all agree, and the quiet at the end is said
// ("nothing heard after 2:52"), not shown as a recording cut short. Silent: test mode, its clock at 20 times.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-length.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'

const FRAMES = process.env.FRAMES
const { check, done } = checks()
const { c, made, record } = await recorded({ repeat: 8, long: 600, speed: 20 })
// Ten minutes made up; stopped once it is well into the quiet, as a person stops it.
const { h } = c
try {
  check('the made-up meeting is ten minutes, talk in its first three', made.seconds === 600 && made.lines.at(-1).end < 180, `${made.seconds}s, last line at ${made.lines.at(-1).end}`)
  const id = await record()
  check('it is kept as a meeting page', !!id)
  await h.waitForTimeout(1500)
  const got = await h.evaluate(async () => {
    const page = document.querySelector('[data-meeting-page]')
    const audio = page.querySelector('[data-meeting-player] audio')
    const duration = (src) => new Promise((done) => { const one = new Audio(); one.preload = 'metadata'; one.onloadedmetadata = () => done(one.duration); one.onerror = () => done(-1); one.src = src })
    const attrs = await window.api.haligtree('media:peaks', audio.src)
    const bars = [...page.querySelectorAll('.mf-sound-bars rect')].map((r) => Number(r.getAttribute('height')))
    const body = await window.api.captures.get(page.closest('[data-open]').dataset.open)
    const meeting = (typeof body.body === 'string' ? JSON.parse(body.body) : body.body).content.find((one) => one.type === 'meeting').attrs
    return {
      said: page.querySelector('[data-meeting-length]').textContent,
      player: Number(page.querySelector('[data-sound-player]').dataset.length),
      file: await duration(audio.src), you: await duration(meeting.you), others: await duration(meeting.others),
      peaks: attrs?.seconds, count: attrs?.peaks?.length, lastLoud: attrs?.peaks?.findLastIndex((one) => one > 40), heard: meeting.heard, bars: bars.length,
      quiet: page.querySelector('[data-meeting-quiet]')?.textContent ?? null
    }
  })
  const near = (a, b, by = 1.5) => Math.abs(a - b) <= by
  // The meeting's length: as long as it ran, well into the quiet after the talk (stopped by hand, as a person does).
  const long = got.player
  const said = (/· (\d+):(\d\d) long/.exec(got.said) ?? []).slice(1).map(Number)
  check('it ran on well past the talk, into the quiet', long > 400, long)
  check('the page\'s length is the player\'s', said.length === 2 && Math.abs(said[0] * 60 + said[1] - long) < 1.5, `${got.said} vs ${long}`)
  check('the sound file itself is that long', near(got.file, long), got.file)
  check('both tracks run the whole meeting (a side gone quiet is kept as quiet)', near(got.you, long) && near(got.others, long), `you ${got.you}, others ${got.others}`)
  check('the waveform is worked out over the same length', near(got.peaks, long) && got.count === 512, `${got.peaks}s, ${got.count} peaks`)
  check('the waveform\'s talk ends where the talk ends (not cut, not stretched)', Math.abs(got.lastLoud / 512 * long - made.lines.at(-1).end) < 4, `last loud bar ${got.lastLoud} = ${(got.lastLoud / 512 * long).toFixed(1)}s for talk ending ${made.lines.at(-1).end}s`)
  check('the page says the quiet after it, so it never looks cut short', /nothing heard after 2:5\d/.test(got.quiet ?? '') && near(got.heard, made.lines.at(-1).end, 3), `${got.quiet} (heard ${got.heard})`)
  if (FRAMES) await c.both(join(FRAMES, 'length'))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
