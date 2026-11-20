// Real book switches on a packaged Haligtree, as on the user's other Mac, where every switch ended in macOS's
// "Haligtree quit unexpectedly": the app goes to the sandbox and back ROUNDS times, each run really starting the
// next (sandbox.ts relaunch) and ending with app.exit, then ~/Library/Logs/DiagnosticReports is read for a
// Haligtree crash report written during the run. Each run is found by its main process's inspector (--inspect=0,
// passed on by the relaunch) and asked through the same handler the book switcher calls.
// The crash was the in-use watcher (native/glass.mm) calling Node after Node had freed what it calls, so this run
// turns that watcher on (HALIGTREE_QA_INUSE) and plays silence through new processes during each switch: each one
// is a new sound process the watcher hears. Nothing is heard and nothing shows (HALIGTREE_QA_AWAY).
//   electron-vite build && electron-builder --mac dir -c.directories.output=dist-switch
//   node qa/switch-packaged.mjs dist-switch/mac-arm64/Haligtree.app <a copy of a seeded sandbox's data folder> [rounds]
import { execFileSync, spawn } from 'child_process'
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'

const [appPath, data, roundsArg] = process.argv.slice(2)
if (!appPath || !data) throw new Error('usage: node qa/switch-packaged.mjs <Haligtree.app> <data folder> [rounds]')
const bin = join(resolve(appPath), 'Contents/MacOS/Haligtree')
const rounds = Number(roundsArg ?? 5)
const began = Date.now()
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const log = (...said) => console.log(new Date().toISOString().slice(11, 19), ...said)

// A second of silence, played at volume 0.
const quiet = join(mkdtempSync(join(tmpdir(), 'haligtree-switch-')), 'silence.wav')
const wav = Buffer.alloc(44 + 32000)
wav.write('RIFF', 0), wav.writeUInt32LE(36 + 32000, 4), wav.write('WAVEfmt ', 8), wav.writeUInt32LE(16, 16), wav.writeUInt16LE(1, 20), wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(16000, 24), wav.writeUInt32LE(32000, 28), wav.writeUInt16LE(2, 32), wav.writeUInt16LE(16, 34), wav.write('data', 36), wav.writeUInt32LE(32000, 40)
writeFileSync(quiet, wav)

async function inspector(pid) {
  for (let i = 0; i < 150; i++) {
    let ports = []
    try {
      ports = execFileSync('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-nP', '-Fn']).toString().split('\n').filter((line) => line.startsWith('n')).map((line) => line.split(':').pop())
    } catch {
      // Not listening yet.
    }
    for (const port of ports) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        if (list[0]?.webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl
      } catch {
        // The app's own server, not the inspector.
      }
    }
    await sleep(200)
  }
  throw new Error(`no inspector on ${pid}`)
}
const evaluate = (url, expression) =>
  new Promise((done, failed) => {
    const socket = new WebSocket(url)
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    socket.onmessage = (message) => {
      const answer = JSON.parse(message.data)
      if (answer.id !== 1) return
      socket.close()
      if (answer.result?.exceptionDetails) failed(new Error(JSON.stringify(answer.result.exceptionDetails).slice(0, 400)))
      else done(answer.result?.result?.value)
    }
    // The run ended while answering (a quit): nothing more to hear.
    socket.onclose = () => done(undefined)
    socket.onerror = () => failed(new Error('inspector closed'))
  })
const E = "process.mainModule.require('electron')"
async function ready(url) {
  for (let i = 0; i < 300; i++) {
    try {
      if (await evaluate(url, `${E}.BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.webContents.getURL() && !w.webContents.isLoading()) && ${E}.ipcMain._invokeHandlers.has('haligtree:sandbox:enter')`)) return
    } catch {
      // Still starting.
    }
    await sleep(200)
  }
  throw new Error('the run never came up')
}
const mains = () => {
  try {
    return execFileSync('pgrep', ['-f', `${bin} `]).toString().trim().split('\n').filter(Boolean).map(Number)
  } catch {
    return []
  }
}

const env = { ...process.env, HALIGTREE_USER_DATA: resolve(data), HALIGTREE_QA_AWAY: '1', HALIGTREE_QA_INUSE: '1' }
const first = spawn(bin, ['--inspect=0'], { env, stdio: 'ignore' })
let pid = first.pid
let inSandbox = false
let switched = 0
for (let n = 0; n < rounds * 2; n++) {
  const url = await inspector(pid)
  await ready(url)
  await sleep(2500)
  const before = new Set(mains())
  const channel = inSandbox ? 'leave' : 'enter'
  const noise = setInterval(() => spawn('afplay', ['-v', '0', quiet], { stdio: 'ignore' }), 150)
  setTimeout(() => clearInterval(noise), 8000)
  await evaluate(url, `${E}.ipcMain._invokeHandlers.get('haligtree:sandbox:${channel}')({ sender: null }, {}).then(String)`)
  let next = null
  for (let i = 0; i < 200 && !next; i++) {
    await sleep(100)
    next = mains().find((one) => !before.has(one)) ?? null
  }
  if (!next) throw new Error(`run ${pid} started no next run`)
  for (let i = 0; i < 300 && alive(pid); i++) await sleep(100)
  log(`${inSandbox ? 'sandbox -> my book' : 'my book -> sandbox'}: run ${pid} ${alive(pid) ? 'STILL UP' : 'ended'}, run ${next} started`)
  if (!alive(pid)) switched++
  pid = next
  inSandbox = !inSandbox
}
const url = await inspector(pid)
await ready(url)
await evaluate(url, `${E}.app.quit()`).catch(() => undefined)
for (let i = 0; i < 100 && alive(pid); i++) await sleep(100)
for (const one of mains()) process.kill(one, 'SIGKILL')
// The Mac writes a crash report a few seconds after the crash.
await sleep(15000)
const reports = join(homedir(), 'Library/Logs/DiagnosticReports')
const crashed = readdirSync(reports).filter((name) => /^Haligtree-.*\.ips$/.test(name) && statSync(join(reports, name)).mtimeMs >= began)
console.log(`${switched}/${rounds * 2} switches ended their run; crash reports written during the run: ${crashed.length ? crashed.join(', ') : 'none'}`)
process.exit(crashed.length || switched !== rounds * 2 ? 1 : 0)
