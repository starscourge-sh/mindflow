// The sandbox's first screens, where a newcomer looks: Home, Gems, Questions
// and Writing (in Custom order and Newest), each screenshotted.
//
//   npx electron-vite build --outDir out-content
//   QA_ARGS=--sandbox QA_ENTRY=out-content/main/index.js SHOT=<dir> node qa/content-shots.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/content'
mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
try {
  for (const id of ['home', 'nuggets', 'questions', 'articles']) {
    await c.go(id)
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${SHOT}/${id}.png` })
  }
  // Writing in Custom order: the new pieces are in it too, never placed, so newest first.
  const rows = () => h.$$eval('[data-row]', (all) => all.map((one) => one.textContent.trim().slice(0, 40)))
  console.log('newest:', (await rows()).join(' | '))
  const key = 'view:article'
  await h.evaluate((k) => localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), sort: 'manual' })), key)
  await h.reload(); await h.waitForTimeout(1500)
  await c.go('articles')
  await h.waitForTimeout(1200)
  await h.screenshot({ path: `${SHOT}/articles-custom.png` })
  console.log(`custom (${key}):`, (await rows()).join(' | '))
  const articles = await v('items', 'article')
  await c.send('article', articles.find((one) => one.title.includes('Matrix')).id)
  await h.waitForTimeout(1500)
  await h.screenshot({ path: `${SHOT}/matrix.png` })
  console.log('writing:', articles.map((one) => `${one.title} [${one.createdAt?.slice(0, 10)} pos ${one.position ?? ''}]`).join(' | '))
  console.log(c.errors.filter((one) => one.startsWith('PAGEERROR')).join('\n') || 'no page errors')
} finally {
  await c.close()
}
