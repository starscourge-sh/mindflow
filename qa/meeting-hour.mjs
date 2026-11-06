// An hour-long meeting stays small: the meeting program (native/meeting.swift, test mode, its clock at 60 times) is
// fed an hour of two made-up tracks and stopped; its memory never passes 200 MB, the tracks are compressed (under
// 20 MB an hour each), every line said comes out, and the waveform is 512 bars, so the page never reads an hour of
// sound to draw it. Silent: no window, no sound, never the microphone.
//   QA_DATA=$(mktemp -d) node qa/meeting-hour.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { makeMeeting } from './meeting-lib.mjs'

const { check, done } = checks()
const folder = join(process.env.QA_DATA, 'hour')
mkdirSync(join(folder, 'out'), { recursive: true })
const made = makeMeeting(folder, { repeat: 169 })
check('the made-up meeting is an hour long', made.seconds >= 3600, `${Math.round(made.seconds)}s`)
const run = spawn('/usr/bin/time', ['-l', 'resources/meeting', 'record', join(folder, 'out'), 'en_GB', '--test', made.you, made.others, made.script, '--speed', '60'])
let out = '', err = ''
run.stdout.on('data', (chunk) => (out += chunk))
run.stderr.on('data', (chunk) => (err += chunk))
setTimeout(() => run.stdin.write('stop\n'), (made.seconds / 60 + 4) * 1000)
await new Promise((resolve) => run.on('close', resolve))
const lines = out.split('\n').filter(Boolean).map((one) => { try { return JSON.parse(one) } catch { return {} } })
const peak = Number(/(\d+)\s+maximum resident set size/.exec(err)?.[1] ?? 0) / 1024 / 1024
check('memory stays under 200 MB for an hour', peak > 0 && peak < 200, `${Math.round(peak)} MB`)
const said = lines.filter((one) => one.words?.final)
check('every line of the hour comes out', said.length === made.lines.length, `${said.length} of ${made.lines.length}`)
const saved = lines.find((one) => one.saved)?.saved
check('the hour is kept whole', saved && Math.abs(saved.seconds - made.seconds) < 30, `${saved?.seconds} of ${Math.round(made.seconds)}`)
check('its waveform is 512 bars, worked out while recording', saved?.peaks?.length === 512)
const size = (name) => statSync(join(folder, 'out', name)).size / 1024 / 1024
check('each track is compressed (under 20 MB an hour)', size('you.m4a') < 20 && size('others.m4a') < 20, `you ${size('you.m4a').toFixed(1)} MB, others ${size('others.m4a').toFixed(1)} MB, both ${size('meeting.m4a').toFixed(1)} MB`)
check('what to take from it is found across the hour', (lines.find((one) => one.found)?.found?.actions?.length ?? 0) >= 169)
done()
