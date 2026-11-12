// The native readers behind “Step away in meetings” (native/glass.mm) load and answer: whether a microphone is in use
// by another app, a camera by any, and the screen mirrored. Only the Mac's own "in use" flags are read: no microphone
// or camera is opened, so nothing is asked for and nothing prompts. And the rule that keeps Haligtree's own voice
// note, talk to type and meeting recorder from counting as "another app": a process is ours when it is this one or
// one this one started. Plain Node, no app, nothing on the screen:
//   node qa/in-use-native.mjs
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const native = { exports: {} }
try {
  process.dlopen(native, fileURLToPath(new URL('../resources/glass.node', import.meta.url)))
} catch (error) {
  check('resources/glass.node loads', false, error.message)
}
const { watchInUse, mirrored, ours } = native.exports
check('watchInUse, mirrored and ours are there', [watchInUse, mirrored, ours].every((one) => typeof one === 'function'), Object.keys(native.exports).join(' '))

const started = performance.now()
const said = []
watchInUse?.((mic, camera) => said.push({ mic, camera, after: Math.round(performance.now() - started) }))
const held = performance.now() - started
check('asking to be told holds the thread under 5 ms (the reading is on a thread of its own)', held < 5, `${held.toFixed(2)} ms`)
check('mirrored() answers yes or no', typeof mirrored?.() === 'boolean', String(mirrored?.()))

// A child, and a child of that child: both are this process's own. Its parent and launchd are not.
const child = spawn('/bin/sh', ['-c', 'sleep 4 & echo $!; wait'], { stdio: ['ignore', 'pipe', 'ignore'] })
const grandchild = await new Promise((done) => child.stdout.once('data', (data) => done(Number(String(data).trim()))))
check('this process is ours', ours?.(process.pid) === true)
check('a program it started is ours', ours?.(child.pid) === true, String(child.pid))
check('and a program that one started', ours?.(grandchild) === true, String(grandchild))
check('the process that started this one is not ours', ours?.(process.ppid) === false, String(process.ppid))
check('nor is launchd', ours?.(1) === false)
child.kill()

await new Promise((done) => setTimeout(done, 2500))
check('it said how the microphone and the cameras are, within 2.5 s', said.length >= 1 && typeof said[0].mic === 'boolean' && typeof said[0].camera === 'boolean', JSON.stringify(said.slice(0, 3)))
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
