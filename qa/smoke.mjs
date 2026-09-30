import { open } from './harness.mjs'

const app = await open()
await app.reset()
await app.type(['- one', 'two', 'three'])
console.log('--- typed ---')
console.log(await app.shape())
console.log('caret on:', await app.caretLine())
await app.close()
