// Quick capture's round controls never show without their card: after every way the box goes away (Esc, put away by
// its key, a capture sent, ⌘↵ in "One line to start", a click on the main window, another app taking the focus), or
// while it is up in any shape, the window is either gone or shows the card with its controls on it, on the screen.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-never-bare.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
/** What of quick capture is on the screen: the window (main's own record, opacity as asked), and in it the card and its controls. */
const seen = async () => {
  const win = await c.electron.evaluate(({ BrowserWindow, screen }) => {
    const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
    if (!box) return null
    const at = box.getBounds()
    const area = screen.getDisplayMatching(at).workArea
    return { visible: box.isVisible(), opacity: box.qaOpacity ?? 1, card: at, onScreen: at.x + at.width > area.x && at.x < area.x + area.width && at.y + at.height > area.y && at.y < area.y + area.height }
  })
  const page_ = await page.evaluate(() => {
    const card = document.querySelector('.app-container')
    const r = card?.getBoundingClientRect()
    const style = card && getComputedStyle(card)
    const controls = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.getBoundingClientRect().width && Number(getComputedStyle(one).opacity) > 0)
    return { cardShown: !!r && r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0.5, controls: controls.length }
  })
  return { ...win, ...page_ }
}
/** Gone, or the card is there with its controls: never the controls alone. */
const fine = (s) => !s || !s.visible || s.opacity === 0 || (s.cardShown && s.onScreen)
const open = async () => { await page.evaluate(() => window.api.showPrompt()); await wait(1300) }
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  for (const oneLine of [false, true]) {
    const shape = oneLine ? '"One line to start"' : 'the box'
    await v('settings:set', { boxOneLine: oneLine })
    const steps = [
      ['Esc', async () => page.keyboard.press('Escape')],
      ['put away by its key', async () => page.evaluate(() => window.api.hidePrompt())],
      ['a capture sent with ⌘↵', async () => { await page.click(EDITOR); await page.keyboard.type('a thing to keep'); await wait(300); await page.keyboard.press('Meta+Enter') }],
      ['a click on the main window', async () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.focus())],
      ['another app taking the focus', async () => c.electron.evaluate(({ BrowserWindow }) => { const box = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')); box?.blur(); box?.emit('blur') })],
    ]
    for (const [name, act] of steps) {
      await open()
      const up = await seen()
      // The pill at rest is the bar alone (its controls come out on Tab, qa/pill-controls.mjs).
      check(`${shape} open: the card shows${oneLine ? '' : ' with its controls'}`, up.visible && up.cardShown && up.onScreen && (oneLine || up.controls >= 3), JSON.stringify(up))
      await act(); await wait(900)
      const after = await seen()
      check(`${shape}, ${name}: gone, or the card still with its controls, never the controls alone`, fine(after), JSON.stringify(after))
      await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    }
  }
  // The card squeezed to a line while the window is up (the user's screen, 1 Nov: the four controls over the desktop and a
  // thin line where the card was; the cause is not found, so the state is made here): nothing of
  // quick capture may show, not its controls alone.
  await v('settings:set', { boxOneLine: false })
  await open()
  await page.evaluate(() => { const card = document.querySelector('.app-container'); card.style.cssText += ';height:2px!important;min-height:0!important;max-height:2px!important;overflow:hidden!important' })
  await wait(400)
  const squeezed = await page.evaluate(() => [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button, [data-grabber]')].filter((one) => { const r = one.getBoundingClientRect(); const st = getComputedStyle(one); return r.width > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0 }).length)
  const cardNow = await page.evaluate(() => ({ h: Math.round(document.querySelector('.app-container').getBoundingClientRect().height), gone: document.documentElement.hasAttribute('data-card-gone') }))
  check('the card squeezed to a line with the window up: none of its controls show alone', squeezed === 0, `${squeezed} showing, ${JSON.stringify(cardNow)}`)
  await page.evaluate(() => { const card = document.querySelector('.app-container'); card.style.height = ''; card.style.minHeight = ''; card.style.maxHeight = ''; card.style.overflow = '' })
  await wait(400)
  check('…and back at its size, they are back with it', (await seen()).controls >= 3)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
