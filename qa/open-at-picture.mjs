// A picture opened from Files lands its note on that picture and stays there (the user, 8 Nov: the note opened
// on "The Delphic Sibyl", then a second later jumped to the top). Files › Pictures, each of the Sistine note's
// two pictures clicked in turn (the Delphic Sibyl is the lower one); where the picked picture sits on screen is
// read every 50ms for 3s and must not leave the screen. QA_TRACE=1 logs every scroll and what made it.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] node qa/open-at-picture.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go } = c
const shots = process.env.SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(100)) if (await test().catch(() => false)) return true; return false }
// The picture picked in the note: its name, its top on screen, and the note's scroll.
const where = () => h.evaluate(() => {
  const picked = document.querySelector('.ProseMirror .ProseMirror-selectednode')
  const img = picked?.matches('img') ? picked : picked?.querySelector('img')
  if (!img) return null
  let box = img.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  return { alt: img.getAttribute('alt') ?? '', top: Math.round(img.getBoundingClientRect().top), scroll: Math.round(box?.scrollTop ?? -1), height: innerHeight }
})
const trace = () => h.evaluate(() => {
  const log = (window.__scrolls = [])
  const t0 = performance.now()
  for (const name of ['scrollTo', 'scrollBy', 'scrollIntoView']) {
    const was = Element.prototype[name]
    Element.prototype[name] = function (...args) { log.push({ t: Math.round(performance.now() - t0), [name]: JSON.stringify(args), on: this.className, stack: new Error().stack.split('\n').slice(2, 8).map((one) => one.replace(/\(?file.*assets\//, '')).join(' / ') }); return was.apply(this, args) }
  }
  document.addEventListener('scroll', (e) => e.target.scrollHeight > 1500 && log.push({ t: Math.round(performance.now() - t0), at: e.target.scrollTop }), true)
})
const names = []
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  for (const nth of [2, 1]) {
    await go('media')
    // Files opens on its piles: the Pictures pile, as a person would.
    await h.click('[data-pile="picture"]')
    const found = await waitFor(() => h.evaluate((nth) => {
      for (const one of document.querySelectorAll('[data-probe-tile]')) one.removeAttribute('data-probe-tile')
      // Pictures by month, newest first: the Sistine note's red chalk study and the Delphic Sibyl are the 2nd and 3rd.
      const one = document.querySelectorAll('[data-media-grid] [data-media]')[nth]
      one?.setAttribute('data-probe-tile', '')
      return !!one
    }, nth))
    check(`picture ${nth + 1} shows in Pictures`, found, found ? '' : await h.evaluate(() => [...document.querySelectorAll('[data-media]')].slice(0, 4).map((it) => `${it.dataset.note} ${it.parentElement.textContent.trim().slice(0, 40)}`).join(' / ')))
    if (shots) await h.screenshot({ path: `${shots}/open-at-picture-${nth}-files.png` })
    if (process.env.QA_TRACE) await trace()
    await h.click('[data-probe-tile]')
    const reads = []
    for (let at = 0; at < 60; at++) {
      reads.push(await where())
      if (shots && at % 4 === 0) await h.screenshot({ path: `${shots}/open-at-picture-${nth}-${String(at).padStart(2, '0')}.png` })
      await h.waitForTimeout(50)
    }
    if (process.env.QA_TRACE) console.log(JSON.stringify(await h.evaluate(() => window.__scrolls)).slice(0, 8000))
    const seen = reads.filter(Boolean)
    const name = seen.at(-1)?.alt ?? '?'
    names.push(name)
    const first = seen.findIndex((one) => one.top >= 0 && one.top < one.height - 40)
    check(`${name}: the note opens on it, picked`, first >= 0 && first < 30, JSON.stringify(seen.slice(0, 2)))
    const after = seen.slice(first)
    const off = after.filter((one) => one.top < -40 || one.top > one.height - 40)
    check(`${name}: it stays on screen for 3 seconds`, first >= 0 && off.length === 0, `${off.length} of ${after.length} reads off it; tops ${[...new Set(after.map((one) => one.top))].slice(0, 12).join(', ')}`)
    check(`${name}: the note is not back at the top`, (seen.at(-1)?.scroll ?? 0) > 100, JSON.stringify(seen.at(-1)))
  }
  check('one of the two is the Delphic Sibyl', names.some((one) => /Delphic/.test(one)), names.join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
