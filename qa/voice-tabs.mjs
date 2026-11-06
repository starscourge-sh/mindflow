// A voice note with words has two tabs under it, "My thoughts" (the note as
// written) and "Transcript": the words as speech bubbles, split where the
// speaker paused, each with its time. A two-hour recording's 300 lines show 60
// bubbles at a time, the rest one press away, so the page stays quick.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/voice-tabs.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '[data-open] .tiptap'
const stamp = (s) => { const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}` }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Two hours, a line every 24 seconds: 300 lines, each its own bubble.
  const lines = Array.from({ length: 300 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `[${stamp(i * 24)}] The guilds kept their secrets, line ${i + 1}.` }] }))
  const id = await v('article:new')
  await v('item:save', id, { title: 'Two hours', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src: 'haligtree://assets/' + 'b'.repeat(64) + '.m4a', name: 'Voice note 31 Oct 9.12.m4a', size: 935731, duration: 7200 } }, ...lines, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(1600)
  const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-voice-tab]')].map((el) => `${el.textContent}:${el.getAttribute('aria-selected')}`))
  check('a voice note with words shows "My thoughts" and "Transcript", My thoughts first', JSON.stringify(tabs) === JSON.stringify(['My thoughts:true', 'Transcript:false']), JSON.stringify(tabs))
  await h.click('[data-voice-tab="transcript"]'); await wait(500)
  const first = await h.evaluate(() => ({
    bubbles: document.querySelectorAll('[data-bubble]').length,
    more: document.querySelector('[data-more-bubbles]')?.textContent ?? null,
    firstTime: document.querySelector('[data-bubble] span')?.textContent ?? null
  }))
  check('Transcript shows the first 60 bubbles, each with its time, and how many more', first.bubbles === 60 && first.more === 'Show 60 more (240 left)' && first.firstTime === '0:00', JSON.stringify(first))
  const twice = await h.evaluate(() => [...document.querySelectorAll('.mf-transcript-line')].filter((el) => el.offsetParent).length)
  check('the plain lines step aside while the bubbles show: the words are on the page once', twice === 0, String(twice))
  const title = await h.evaluate(() => `${document.querySelector('.tiptap-attachment-name')?.textContent} · ${document.querySelector('[data-sound-time]')?.textContent}`)
  check('a two-hour recording is named "Voice note" with "2:00:00" on the right', title === 'Voice note · 2:00:00', String(title))
  for (const name of ['light', 'dark']) { await c.look(name); await wait(300); await h.screenshot({ path: `${shots}/voice-tabs-${name}.png` }) }
  await c.look('light')
  for (let i = 0; i < 4; i += 1) { await h.click('[data-more-bubbles]'); await wait(200) }
  const all = await h.evaluate(() => ({ bubbles: document.querySelectorAll('[data-bubble]').length, last: [...document.querySelectorAll('[data-bubble] span')].at(-1)?.textContent, more: !!document.querySelector('[data-more-bubbles]') }))
  check('all 300 come in, the last at 1:59:36, and nothing more to show', all.bubbles === 300 && all.last === '1:59:36' && !all.more, JSON.stringify(all))
  await h.evaluate(() => document.querySelector('[data-bubbles]').scrollTo(0, 99999)); await wait(300)
  await c.look('dark'); await wait(300); await h.screenshot({ path: `${shots}/voice-tabs-300-dark.png` }); await c.look('light')
  await h.click('[data-voice-tab="thoughts"]'); await wait(300)
  const back = await h.evaluate(() => [...document.querySelectorAll('.mf-transcript-line')].filter((el) => el.offsetParent).length)
  check('"My thoughts" puts the bubbles away and the lines back', !(await h.$('[data-bubbles]')) && back === 300, String(back))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
