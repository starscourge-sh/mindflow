// The user's own 53 links (qa/fixtures/many-links.txt) pasted into quick capture at once, over the real network at
// its real speed: each link that loads becomes its own card, each that does not stays a plain link, and no card is
// left on its orb. Before, every one was asked at once and all fell back to plain links together. One link alone
// (the Woday site's, as the user tried) is checked too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/many-links.mjs
import { readFileSync } from 'fs'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const LINKS = readFileSync(new URL('./fixtures/many-links.txt', import.meta.url), 'utf8').split('\n').map((one) => one.trim()).filter(Boolean)
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const count = () => page.evaluate((s) => {
  const doc = document.querySelector(s)
  const cards = [...doc.querySelectorAll('[data-bookmark], .tiptap-bookmark, [data-type=bookmark]')]
  return {
    loading: cards.filter((one) => one.matches('[data-loading]') || one.querySelector('[data-loading]')).length,
    cards: cards.filter((one) => !(one.matches('[data-loading]') || one.querySelector('[data-loading]'))).length,
    plain: [...doc.querySelectorAll(':scope > p')].filter((one) => /^https?:\/\/\S+$/.test(one.textContent.trim())).length
  }
}, EDITOR)
async function paste(text) {
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
  await electron.evaluate(({ clipboard }, words) => clipboard.writeText(words), text)
  await page.keyboard.press('Meta+v')
  const t0 = Date.now()
  let now = await count()
  while (Date.now() - t0 < 180_000) {
    await wait(1000)
    now = await count()
    if (now.cards + now.plain >= text.split('\n').length && !now.loading) break
  }
  return { ...now, seconds: Math.round((Date.now() - t0) / 1000) }
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  const one = await paste('https://woday.app/')
  check('one link alone becomes its card', one.cards === 1, JSON.stringify(one))
  const all = await paste(LINKS.join('\n'))
  console.log(`${LINKS.length} links: ${all.cards} cards, ${all.plain} plain links, ${all.loading} still on the orb, after ${all.seconds}s`)
  check(`all ${LINKS.length} links settle, none left on its orb`, !all.loading && all.cards + all.plain === LINKS.length, JSON.stringify(all))
  // Pages that answer with a name for themselves: most of the list. x.com and some others give nothing to a fetch.
  check(`most of the ${LINKS.length} become cards (at least 30)`, all.cards >= 30, JSON.stringify(all))
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
