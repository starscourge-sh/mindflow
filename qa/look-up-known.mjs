// Every Look Up answer is kept on this machine: a word looked up again opens
// at once with the network off. A word already in your Lookups says so under
// the headword ("In your Lookups since 31 Oct", a link to it), and "Add this
// place" adds where you met it this time to the same Lookup, never a second one.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/look-up-known.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { lookupServer, openProbePdf, pickInPdf } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const server = await lookupServer()
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const wait = (ms) => h.waitForTimeout(ms)
const card = () => h.evaluate(() => {
  const one = document.querySelector('.look-up')
  return one ? { meaning: one.querySelector('.look-up-meaning')?.textContent ?? '', wiki: one.querySelector('.look-up-extract')?.textContent ?? '', known: one.querySelector('[data-look-known]')?.textContent ?? '', keep: one.querySelector('[data-look-keep]')?.textContent ?? '' } : null
})
const lookups = () => h.evaluate(async () => (await window.api.captures.find('quiet')).filter((one) => one.type === 'capture' && /^quiet/i.test(one.label)).map((one) => one.id))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await openProbePdf(c)
  await pickInPdf(h, 2, 7, 1); await wait(400)
  await h.keyboard.press('l'); await wait(1500)
  const first = await card()
  check('looked up the first time: the meaning and Wikipedia, nothing said about the library', /little or no noise/.test(first?.meaning) && /lack of noise/.test(first?.wiki) && !first?.known && first?.keep === 'Keep', JSON.stringify(first))
  await h.click('[data-look-keep]'); await wait(900)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)
  check('kept as one Lookup', (await lookups()).length === 1, JSON.stringify(await lookups()))

  // The network off: the same word again, somewhere else.
  const asked = { ...server.hits }
  await server.close()
  await pickInPdf(h, 2, 7, 2); await wait(400)
  const opened = Date.now()
  await h.keyboard.press('l')
  await h.waitForSelector('.look-up .look-up-extract', { timeout: 4000 }).catch(() => {})
  const took = Date.now() - opened
  await wait(400)
  const again = await card()
  check('offline, the word opens from what was kept: the meaning and Wikipedia', /little or no noise/.test(again?.meaning) && /lack of noise/.test(again?.wiki), JSON.stringify(again))
  check('at once (well under the 4 to 5 seconds a lookup may wait for the web)', took < 1500, `${took} ms`)
  check('without asking the network', server.hits.dict === asked.dict && server.hits.wiki === asked.wiki, JSON.stringify({ asked, now: server.hits }))
  check('it says the word is in your Lookups, since when', /^In your Lookups since \d{1,2} [A-Z][a-z]{2}/.test(again?.known ?? ''), again?.known)
  check('and Keep becomes "Add this place"', again?.keep === 'Add this place', again?.keep)
  check('the line is a link with the hand', await h.evaluate(() => getComputedStyle(document.querySelector('[data-look-known]')).cursor) === 'pointer', '')
  await h.screenshot({ path: `${shots}/look-up-known-light.png` })
  await c.look('dark'); await wait(500)
  await h.screenshot({ path: `${shots}/look-up-known-dark.png` })
  await c.look('light'); await wait(300)
  await h.click('[data-look-keep]'); await wait(900)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)
  const ids = await lookups()
  check('"Add this place" makes no second Lookup', ids.length === 1, JSON.stringify(ids))
  const body = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), ids[0]))?.body ?? '')
  check('it adds where the word was met again to the same Lookup', /Met again/.test(body) && /The Probe Book, p\. 2/.test(body) && /A quiet sentence worth keeping on page 2/.test(body), body.slice(-400))

  // The line opens the Lookup.
  await pickInPdf(h, 2, 7, 3); await wait(400)
  await h.keyboard.press('l'); await wait(1200)
  await h.click('[data-look-known]'); await wait(1200)
  check('clicking the line opens the Lookup', await h.evaluate((id) => !!document.querySelector(`[data-open="${id}"]`), ids[0]), '')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
