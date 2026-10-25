// The Feed shows a note at most once a load: never a gem as a quiz card and
// again as its quote. Every review card made due first, so quizzes are asked.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-once.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-feed-once-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 860 })
const { v } = c
const idOf = (post) => (post.type === 'poll' ? post.poll.open.id : post.id)

try {
  for (let load = 1; load <= 3; load++) {
    const posts = (await v('feed')).posts
    const ids = posts.map(idOf)
    const twice = ids.filter((id, at) => ids.indexOf(id) !== at)
    const quizzes = posts.filter((one) => one.type === 'quiz').length
    check(`load ${load}: every note once`, twice.length === 0, `${posts.length} posts, ${quizzes} quiz cards, ${twice.length} shown twice`)
  }
  console.log('errors:', c.errors?.slice?.(0, 5))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
