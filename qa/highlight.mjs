/**
 * Highlights: a few words hug the words, a whole line becomes a band.
 */
import { open } from './harness.mjs'

const app = await open()
const { page } = app

await app.reset()
// One line at a time, with a settle after each: `==x==` is an input rule, and
// typed in one breath the closing pair can land before the text it closes.
for (const line of [
  '- ==PER - On Navigating the Senior Remote Contractor Market==',
  '==PER - Interview Prep Hub==',
  '==PER - Interview Resources Library==',
  'Not marked at all',
  'A line with ==only some words== marked'
]) {
  if (await page.locator('.mindflow-editor p').count()) await page.keyboard.press('Enter')
  await page.keyboard.type(line, { delay: 30 })
  await page.waitForTimeout(250)
}

const band = page.locator('.mf-line-highlight')
const mark = page.locator('.mindflow-editor mark')
console.log(`full-line bands: ${await band.count()} (expect 3)`)
console.log(`marks: ${await mark.count()} (expect 4)`)
console.log('band is the block width:', await band.first().evaluate((e) => {
  const mine = e.getBoundingClientRect().width
  const parent = e.parentElement.getBoundingClientRect().width
  return mine >= parent - 1
}))
console.log('the mark inside a band stands down:', await band.first().evaluate((e) =>
  getComputedStyle(e.querySelector('mark')).backgroundColor === 'rgba(0, 0, 0, 0)'))
console.log('a partial highlight stays inline:', await mark.last().evaluate((e) =>
  !e.closest('.mf-line-highlight') && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'))
console.log('the card takes a pointer:', await page.evaluate(() => {
  const probe = document.createElement('a')
  probe.className = 'tiptap-bookmark'
  document.querySelector('.tiptap.ProseMirror.mindflow-editor').append(probe)
  const out = getComputedStyle(probe).cursor
  probe.remove()
  return out
}))

await app.close()
process.exit(0)
