// A gem's page keeps every piece but separates them by kind (17 Nov item 23): the quote; its source's facts (who
// said it, the page) right under it; where your own words go, a line ready to type in, which puts the caret on a
// fresh line under the quote; your thoughts; and in the foot, with what links here, "Everything by" and
// "Everything from". And its person's hover card shows one picture (item 22). QA_SHOTS=dir keeps both, light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/gem-page.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const gems = await v('items', 'nugget')
  const gem = gems.find((one) => one.kind === 'quote' && one.attribution && one.medium) ?? gems.find((one) => one.attribution)
  await c.send('nugget', gem.id); await h.waitForTimeout(1600)
  const at = await h.evaluate(() => {
    const top = (sel) => { const one = document.querySelector(`[data-open] ${sel}, ${sel}`); return one ? Math.round(one.getBoundingClientRect().top) : null }
    const links = [...document.querySelectorAll('[data-open-source]')].map((one) => ({ top: Math.round(one.getBoundingClientRect().top), inFoot: !!one.closest('[data-source-foot]') }))
    return { quote: top('.tiptap.ProseMirror > :first-child'), signed: top('[data-signed-edit]'), page: top('[data-page-number]'), write: top('[data-write-on]'), links, mentions: top('[data-mentions]') }
  })
  check('item 23: the source\'s facts sit right under the quote', at.quote !== null && at.page !== null && at.page > at.quote && (at.write === null || at.page < at.write), JSON.stringify(at))
  check('item 23: a line ready for your own words comes after them', at.write !== null && at.write > at.page, JSON.stringify(at))
  check('item 23: "Everything by" and "Everything from" are in the foot, below everything else', at.links.length > 0 && at.links.every((one) => one.inFoot && one.top > at.write), JSON.stringify(at.links))
  if (shots) await c.both(`${shots}/gem-page`)
  // The line puts the caret on a fresh line under the quote, and goes once words are there.
  await h.locator('[data-write-on]').click()
  await h.keyboard.type('Wilde says a book is only written well or badly')
  await h.waitForTimeout(500)
  const wrote = await h.evaluate(() => {
    const editor = [...document.querySelectorAll('.tiptap.ProseMirror[contenteditable="true"]')].find((one) => /written well or badly/.test(one.textContent ?? ''))
    const blocks = editor ? [...editor.children].map((one) => one.textContent) : []
    return { first: blocks[0]?.slice(0, 40), at: blocks.findIndex((one) => /written well or badly/.test(one ?? '')), gone: !document.querySelector('[data-write-on]') }
  })
  check('item 23: a click there writes on a line of its own under the quote, and the line goes', wrote.at > 0 && !/written well/.test(wrote.first ?? '') && wrote.gone, JSON.stringify(wrote))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(400)
  // Item 22: the person's hover card, one picture.
  const signed = h.locator('[data-signed-edit] [data-note-hover]').first()
  if (await signed.count()) {
    await signed.hover(); await h.waitForTimeout(1200)
    const card = await h.evaluate(() => {
      const one = document.querySelector('[data-note-preview]')
      return one && { kind: one.querySelector('[data-preview-kind]')?.textContent, figures: one.querySelectorAll('[data-preview-kind] svg').length, portrait: one.querySelectorAll('[data-preview-image]').length }
    })
    check('item 22: a person\'s card shows one picture, never a figure beside the portrait', !!card && card.figures + card.portrait === 1, JSON.stringify(card))
    if (shots) await c.both(`${shots}/person-card`)
  } else check('item 22: the signature is there to hover', false, '')
} finally {
  await c.close()
}
done()
