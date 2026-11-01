// Quick capture opens on the writing line. A draft left over an hour (a voice
// note from this morning) is not the top of the box: the box opens empty with
// the caret in it, and the leftover waits in a small "Still to keep" chip
// named by what it is ("Voice note · 0:56"), one click from coming back. A
// gem that comes back sits under the writing line as a gift: its words in the
// heading serif, why it is here on a line above them ("Came back"), two words on hover only ("Keep it
// coming", "Less like this"), the rest in its right-click menu. "Create more"
// keeps its word beside its switch.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/quick-capture-clean.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt())
  await page.waitForTimeout(500)
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(1200)
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  await reopen()
  // A voice note left in the box three hours ago.
  await page.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'attachment', attrs: { src: 'haligtree://assets/' + 'a'.repeat(64) + '.m4a', name: 'Voice note 31 Oct 9.12.m4a', size: 935731, duration: 56.4 } }, { type: 'paragraph' }] }))
    localStorage.setItem('capture-draft-at', String(Date.now() - 3 * 3600_000))
  })
  await reopen()
  const state = await page.evaluate((sel) => ({
    empty: !document.querySelector(sel)?.textContent.trim() && !document.querySelector(`${sel} .tiptap-attachment`),
    caret: !!document.activeElement?.closest(sel),
    chip: document.querySelector('[data-leftover]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
  }), EDITOR)
  check('a draft left hours ago: the box opens empty, the caret in the writing line', state.empty && state.caret, JSON.stringify(state))
  check('…and the leftover is a small "Unsaved from earlier" chip named by its length, saying what a click does', state.chip === 'Unsaved from earlier: Voice note · 0:56 · Bring it back', String(state.chip))
  await page.screenshot({ path: `${shots}/quick-capture-leftover-light.png` })
  await page.click('[data-leftover]'); await page.waitForTimeout(600)
  const back = await page.evaluate((sel) => ({ audio: !!document.querySelector(`${sel} .tiptap-attachment.is-audio`), chip: !!document.querySelector('[data-leftover]') }), EDITOR)
  check('a click on the chip puts the voice note back in the box', back.audio && !back.chip, JSON.stringify(back))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')

  // A fresh draft (a minute old) stays in the box, as before.
  await page.keyboard.type('half a thought', { delay: 5 }); await page.waitForTimeout(400)
  await reopen()
  check('a draft from a minute ago stays in the box', /half a thought/.test(await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', EDITOR)) && !(await page.$('[data-leftover]')))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')

  // A gem comes back: every open, and never a question or a memory instead.
  await v('settings:set', { hintRate: 1 })
  await page.evaluate(() => { Math.random = () => 0.99 })
  await reopen()
  await page.waitForSelector('[data-hint-card]', { timeout: 5000 }).catch(() => {})
  // The pointer off the card, wherever the last click left it.
  await page.mouse.move(2, 2); await page.waitForTimeout(400)
  const gem = await page.evaluate((sel) => {
    const card = document.querySelector('[data-hint-card]')
    if (!card) return null
    const words = card.querySelector('[data-hint-words]')
    const editor = document.querySelector(sel)
    const votes = [...card.querySelectorAll('[data-hint-vote]')]
    return {
      under: editor.getBoundingClientRect().top < card.getBoundingClientRect().top,
      serif: !!words && getComputedStyle(words).fontFamily !== getComputedStyle(editor).fontFamily ? getComputedStyle(words).fontFamily : getComputedStyle(words ?? card).fontFamily,
      heading: getComputedStyle(document.documentElement).getPropertyValue('--mf-heading-font') || null,
      mark: card.querySelector('[data-hint-mark]')?.textContent.trim() ?? null,
      votes: votes.map((one) => one.textContent.trim()),
      restOpacity: votes.map((one) => getComputedStyle(one).opacity),
      iconButtons: card.querySelectorAll('button[aria-label="Open it"], button[aria-label="Not now"], button[aria-label="Fix its words"]').length,
    }
  }, EDITOR)
  check('the gem sits under the writing line', gem?.under, JSON.stringify(gem))
  // The hint is a gem or a capture still waiting in the Inbox, as the dice fall.
  const isGem = gem?.mark !== null && !/Inbox/.test(gem?.mark ?? '')
  check('why it is here, on its own line above the words: "Came back" for a gem, "Still in your Inbox" for a capture', isGem ? gem.mark === 'Came back' : gem?.mark === 'Still in your Inbox', String(gem?.mark))
  check('two words, "Keep it coming" (or "Keep it") and "Less like this", hidden until hovered', JSON.stringify(gem?.votes) === (isGem ? '["Keep it coming","Less like this"]' : '["Keep it","Less like this"]') && gem.restOpacity.every((one) => one === '0'), JSON.stringify(gem))
  check('open, fix and not now are not buttons on it', gem?.iconButtons === 0, String(gem?.iconButtons))
  const wordsClass = await page.evaluate(() => document.querySelector('[data-hint-words]')?.className ?? '')
  check('its words in the heading serif', /font-heading/.test(wordsClass), wordsClass)
  if (gem) {
    await page.hover('[data-hint-card]'); await page.waitForTimeout(300)
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-hint-vote]')].map((one) => getComputedStyle(one).opacity))
    check('hovered, the two words show', shown.length === 2 && shown.every((one) => one === '1'), JSON.stringify(shown))
    for (const name of ['light', 'dark']) { await c.look(name === 'dark' ? 'midnight' : 'light'); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/quick-capture-gem-${name}.png` }) }
    await c.look('light')
    await page.click('[data-hint-words]', { button: 'right' }); await page.waitForTimeout(400)
    const menu = await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
    check('its right-click menu holds open, fix, not now and the rest', ['Open it', 'Fix its words', 'Not now'].every((one) => menu.some((row) => row.startsWith(one))), JSON.stringify(menu))
    await page.keyboard.press('Escape')
  }

  await page.mouse.move(2, 2)
  const label = await page.evaluate(() => { const el = [...document.querySelectorAll('label')].find((one) => one.querySelector('[aria-label="Create more"]')); const words = el && [...el.querySelectorAll('span')].find((one) => /Create more/.test(one.textContent)); return words ? words.getBoundingClientRect().width : 0 })
  check('the switch beside Create says what it is', label > 20, String(label))
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
}
