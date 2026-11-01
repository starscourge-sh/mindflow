// A stack of voice notes in a note in the main window, at phone width (390 x 844) and at desktop width, light and
// dark, with 2 and with 12 of them: nothing runs past the card or the window, no sideways scroll, the play button
// at least 32px to tap, and the play button and the bar at the same place in every row. Pictures into QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_VOICE=/path/voice47.m4a node qa/voice-rows-phone.mjs
import { readFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const voice = [...readFileSync(process.env.QA_VOICE)]
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  for (const count of [2, 12]) {
    const id = await h.evaluate(async ([bytes, count]) => {
      const content = []
      for (let n = 1; n <= count; n += 1) {
        // A byte apart, so each is its own stored recording.
        const one = new Uint8Array([...bytes, n])
        const src = await window.api.saveFile(`Voice note ${n}.m4a`, one)
        content.push({ type: 'attachment', attrs: { src, name: `Voice note ${n}.m4a` } })
      }
      content.push({ type: 'paragraph' })
      const made = await window.api.captures.create({ body: { type: 'doc', content } })
      return made?.id ?? made
    }, [voice, count])
    await c.send('capture', id)
    await wait(1500)
    for (const [w, hh] of [[390, 844], [1100, 760]]) {
      await c.size(w, hh)
      await wait(900)
      for (const look of ['light', 'dark']) {
        await c.look(look)
        const seen = await h.evaluate(() => {
          const rows = [...document.querySelectorAll('.tiptap-attachment.is-audio')].filter((one) => one.offsetParent)
          const box = (el) => el?.getBoundingClientRect()
          return {
            rows: rows.length,
            sideways: document.scrollingElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.haligtree-editor-content')].some((one) => one.scrollWidth > one.clientWidth + 1),
            spill: rows.filter((one) => [...one.querySelectorAll('.tiptap-media-controls, .tiptap-attachment-body')].some((part) => box(part).right > box(one.querySelector('.tiptap-attachment-card')).right + 1 || box(part).right > innerWidth)).length,
            tap: Math.min(...rows.map((one) => Math.min(box(one.querySelector('.tiptap-media-play')).width, box(one.querySelector('.tiptap-media-play')).height))),
            places: new Set(rows.map((one) => `${Math.round(box(one.querySelector('.tiptap-media-play')).left)},${Math.round(box(one.querySelector('.tiptap-media-scrub')).width)}`)).size
          }
        })
        const name = `${count} notes, ${w}px, ${look}`
        check(`${name}: no sideways scroll, nothing past the card`, seen.rows === count && !seen.sideways && seen.spill === 0, JSON.stringify(seen))
        check(`${name}: play and bar at one place in every row`, seen.places === 1, JSON.stringify(seen))
        check(`${name}: the play button is at least 32px to tap`, seen.tap >= 32, JSON.stringify(seen))
        await h.screenshot({ path: `${shots}/voice-rows-${count}-${w}-${look}.png` })
      }
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
