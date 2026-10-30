// Two notes side by side (a note open, ⌘\, another typed into the new pane):
// a click into either note puts the caret there, the keys follow it, and what
// is typed lands in that note, the left one as much as the right one. Then a
// third pane, and the middle one too. Screenshots (light, dark) to SHOTS.
//
//   npx electron-vite build --outDir out-m
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/split-focus.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? 'scratchpad/split-focus'
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 880 })
const { h, go, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const panes = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => ({
  front: el.hasAttribute('data-pane-front'),
  picker: !!el.querySelector('[data-pane-picker]'),
  editor: !!el.querySelector('.ProseMirror[contenteditable="true"]')
})))
// Which pane the keys are in, by its place in the row.
const keysIn = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].findIndex((el) => el.contains(document.activeElement) && !!document.activeElement?.closest('.ProseMirror')))
const words = (at) => h.evaluate((i) => document.querySelectorAll('[data-pane]')[i]?.querySelector('.ProseMirror[contenteditable="true"]')?.textContent ?? '', at)

// Open another note in a new pane right of the front one, by ⌘\ and its name.
const besides = async (words) => {
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(500)
  await h.keyboard.type(words); await wait(1200)
  await h.keyboard.press('Enter'); await wait(1800)
}
const typeInto = async (at, mark) => {
  const editor = h.locator('[data-pane]').nth(at).locator('.ProseMirror[contenteditable="true"]').first()
  await editor.locator('p:not(:empty)').last().click(); await wait(300)
  const keys = await keysIn()
  await h.keyboard.press('End')
  await h.keyboard.type(mark); await wait(400)
  const typed = (await words(at)).includes(mark)
  const elsewhere = (await Promise.all((await panes()).map((_, i) => (i === at ? false : words(i).then((one) => one.includes(mark)))))).some(Boolean)
  const front = (await panes())[at]?.front
  return { keys, typed, elsewhere, front }
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go(process.env.START ?? 'inbox')
  await h.locator('[data-pane] [data-row][data-id]').nth(0).click(); await wait(1500)
  await besides('the')
  let list = await panes()
  check('two notes side by side, both editable', list.length === 2 && list.every((one) => one.editor && !one.picker), JSON.stringify(list))

  for (const [at, name] of [[0, 'left'], [1, 'right'], [0, 'left again']]) {
    const got = await typeInto(at, ` qq${at}${name.length}`)
    check(`a click into the ${name} note puts the keys there and the words land in it`, got.keys === at && got.typed && !got.elsewhere && got.front, JSON.stringify(got))
  }
  await h.screenshot({ path: `${shots}/two-light.png` })
  await c.theme('dark'); await wait(600)
  await h.screenshot({ path: `${shots}/two-dark.png` })
  await c.theme('light'); await wait(600)

  // A third note: every pane takes the keys when clicked, the middle one too.
  await typeInto(0, ' ')
  await besides('red pill')
  list = await panes()
  check('three notes side by side', list.length === 3 && list.every((one) => one.editor), JSON.stringify(list))
  for (const at of [0, 1, 2, 1, 0]) {
    const got = await typeInto(at, ` zz${at}`)
    check(`of three, a click into pane ${at + 1} puts the keys there`, got.keys === at && got.typed && !got.elsewhere && got.front, JSON.stringify(got))
  }

  // The title and the empty page under the words take the keys too, in a pane behind.
  for (const at of [0, 2]) {
    await h.locator('[data-pane]').nth(at === 0 ? 2 : 0).locator('.ProseMirror p').first().click(); await wait(300)
    const title = h.locator('[data-pane]').nth(at).locator('textarea.font-heading, input.font-heading').first()
    if (await title.count()) {
      await title.click(); await wait(300)
      const inTitle = await h.evaluate((i) => document.querySelectorAll('[data-pane]')[i].contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName), at)
      check(`a click on pane ${at + 1}'s title, from another pane, puts the keys in it`, inTitle)
    }
    const box = await h.locator('[data-pane]').nth(at).locator('.ProseMirror').first().boundingBox()
    await h.locator('[data-pane]').nth(at === 0 ? 2 : 0).locator('.ProseMirror p').first().click(); await wait(300)
    await h.mouse.click(box.x + box.width / 2, Math.min(box.y + box.height - 4, 840)); await wait(300)
    check(`a click low in pane ${at + 1}'s note, from another pane, puts the keys in it`, (await keysIn()) === at, String(await keysIn()))
  }

  const errors = c.errors.filter((one) => !/net::|Failed to load resource/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '))
} finally {
  await c.close()
}
done()
