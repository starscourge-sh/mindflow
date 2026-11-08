// Who said what, told apart by voice: real speech from macOS's own voices (`say`, written to files, never played
// aloud), fed to the meeting program's test mode, never the microphone or the Mac's sound. Three calls:
//   one     one person on the other side for about three minutes, sentences of every kind: exactly one speaker
//   two     two people on the other side taking turns: exactly two speakers
//   you     your own lines on the microphone track: all "you"
// Each call also runs with the microphone track near silent, which must say so ("quietMic").
//   node qa/meeting-speakers.mjs [path to the meeting program, resources/meeting by default]
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const program = resolve(process.argv[2] ?? 'resources/meeting')
const work = mkdtempSync(join(tmpdir(), 'meeting-speakers-'))
const RATE = 16000

const SENTENCES = [
  'Morning everyone, thanks for joining so early.',
  'So the first thing I wanted to talk about is the launch.',
  'Honestly? I think we are about two weeks behind.',
  'The designs came back on Tuesday and they look great.',
  'But the copy still needs a proper read through.',
  'Can you believe the printer quoted us double?',
  'I said no, absolutely not, we are not paying that.',
  'Right, moving on.',
  'The budget for the next quarter is mostly locked in.',
  'There is a little room for the conference in March.',
  'Wait, did anyone book the venue yet?',
  'Okay, I will take that one, leave it with me.',
  'Numbers wise we are up about twelve percent on last year.',
  'Which is good, but not as good as we hoped.',
  'Hmm. Let me think about that for a second.',
  'Yes! That is exactly what I meant.',
  'The team in Cape Town has been brilliant this month.',
  'They shipped the new onboarding in four days.',
  'Four days! I still cannot believe it.',
  'Anyway, the next thing is hiring.',
  'We have two roles open and about forty applicants.',
  'Most of them are strong, a few are really strong.',
  'I would love a second pair of eyes on the shortlist.',
  'Could you have a look before Friday?',
  'Great, thank you, that helps a lot.',
  'Last thing, and this one is a bit awkward.',
  'The client asked whether we could move the deadline forward.',
  'I told them I would check with everyone first.',
  'My gut says no, but I am open to being convinced.',
  'What do you think? Is it doable?',
  'No rush, sleep on it and tell me tomorrow.',
  'Oh, and please remember the all hands on Thursday at ten.',
  'It will be short, I promise, thirty minutes at most.',
  'Alright, I think that is everything from my side.',
  'Thanks again, speak soon, bye for now.'
]
const YOURS = ['Sounds good to me.', 'I can take the venue.', 'Let me check the numbers and come back to you.', 'Yes, I will look at the shortlist tonight.', 'I think it is doable if we drop the extras.']

/** One sentence in a voice, as 16 kHz samples (Int16 LE), made by `say` into a file, never aloud. */
function speak(voice, text, rate, n) {
  const aiff = join(work, `s${n}.aiff`), wav = join(work, `s${n}.wav`)
  execFileSync('say', ['-v', voice, '-r', String(rate), '-o', aiff, text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav])
  const file = readFileSync(wav)
  let at = 12
  while (at < file.length - 8) {
    const id = file.toString('ascii', at, at + 4), size = file.readUInt32LE(at + 4)
    if (id === 'data') return file.subarray(at + 8, at + 8 + size)
    at += 8 + size + (size % 2)
  }
  throw new Error('no sound from say')
}

function wavOf(chunks, seconds) {
  const n = Math.ceil(seconds * RATE)
  const data = Buffer.alloc(n * 2)
  for (const { at, pcm } of chunks) pcm.copy(data, Math.round(at * RATE) * 2, 0, Math.min(pcm.length, data.length - Math.round(at * RATE) * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8)
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

let made = 0
/** A call: `turns` is [voice or 'you', text] in order. Returns the folder with you.wav, others.wav, script.jsonl. */
function call(name, turns, { you = 'Moira', quiet = false } = {}) {
  const folder = join(work, name)
  execFileSync('mkdir', ['-p', folder])
  const sides = { you: [], others: [] }, script = [], voices = new Map()
  let at = 0.5
  turns.forEach(([voice, text], i) => {
    const track = voice === 'you' ? 'you' : 'others'
    // Each sentence at its own pace, as people speed up and slow down.
    const pcm = speak(voice === 'you' ? you : voice, text, 150 + ((i * 37) % 80), made++)
    const long = pcm.length / 2 / RATE
    sides[track].push({ at, pcm })
    script.push({ track, text, start: +at.toFixed(2), end: +(at + long).toFixed(2) })
    voices.set(+at.toFixed(2), voice)
    at += long + 0.5 + ((i * 13) % 5) / 10
  })
  const seconds = at + 1
  // A near-silent microphone: room hiss and nothing else, as a microphone the call did not use hears.
  if (quiet) {
    const hiss = Buffer.alloc(Math.ceil(seconds * RATE) * 2)
    for (let i = 0; i < hiss.length / 2; i += 1) hiss.writeInt16LE(Math.round((Math.random() - 0.5) * 60), i * 2)
    sides.you = [{ at: 0, pcm: hiss }]
  }
  writeFileSync(join(folder, 'you.wav'), wavOf(sides.you, seconds))
  writeFileSync(join(folder, 'others.wav'), wavOf(sides.others, seconds))
  writeFileSync(join(folder, 'script.jsonl'), script.map((one) => JSON.stringify(one)).join('\n') + '\n')
  return { folder, seconds, voices }
}

/** The program run on a call to its end; the speakers counted from the words it keeps. */
function record({ folder, seconds, voices }) {
  return new Promise((done, fail) => {
    const out = join(folder, 'out')
    const child = spawn(program, ['record', out, 'en_US', '--test', join(folder, 'you.wav'), join(folder, 'others.wav'), join(folder, 'script.jsonl'), '--speed', '6', '--no-live', '--ai-stand-in'], { stdio: ['pipe', 'pipe', 'ignore'] })
    let rest = '', stopped = false, saved = null
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      const parts = (rest + chunk).split('\n')
      rest = parts.pop()
      for (const part of parts) {
        const line = JSON.parse(part)
        if (line.level && line.level.at > seconds + 1 && !stopped) { stopped = true; child.stdin.write('stop\n') }
        if (line.saved) saved = line.saved
      }
    })
    const limit = setTimeout(() => { child.kill(); fail(new Error('the program did not finish')) }, (seconds / 6 + 120) * 1000)
    child.on('close', () => {
      clearTimeout(limit)
      const lines = new Map()
      for (const part of readFileSync(join(out, 'words.jsonl'), 'utf8').split('\n').filter(Boolean)) { const one = JSON.parse(part); lines.set(one.id, one) }
      const count = {}
      // Each speaker's lines, by the voice that really said them: one speaker, one voice.
      const said = {}
      for (const one of lines.values()) {
        if (!one.final) continue
        count[one.speaker] = (count[one.speaker] ?? 0) + 1
        const voice = voices.get(+one.start.toFixed(2)) ?? '?'
        said[one.speaker] = { ...said[one.speaker], [voice]: (said[one.speaker]?.[voice] ?? 0) + 1 }
      }
      const owners = Object.values(said).map((by) => Object.keys(by))
      const pure = owners.every((one) => one.length === 1) && new Set(owners.flat()).size === owners.length
      done({ count, said, pure, quietMic: saved?.quietMic ?? null })
    })
  })
}

const pick = (n, from = SENTENCES) => Array.from({ length: n }, (_, i) => from[i % from.length])
const cases = [
  ['one', call('one', [...pick(35).map((text, i) => [i % 7 === 3 ? 'you' : 'Daniel', i % 7 === 3 ? YOURS[i % YOURS.length] : text]), ...pick(10).map((text) => ['Daniel', text])]), (c) => Object.keys(c).sort().join() === 's1,you'],
  ['two', call('two', pick(40).map((text, i) => [i % 9 === 4 ? 'you' : [0, 1, 1, 0, 0, 1, 0, 1][i % 8] ? 'Samantha' : 'Daniel', i % 9 === 4 ? YOURS[i % YOURS.length] : text])), (c) => Object.keys(c).sort().join() === 's1,s2,you'],
  ['two, every other line', call('turns', pick(24).map((text, i) => [i % 2 ? 'Karen' : 'Ralph', text])), (c) => Object.keys(c).sort().join() === 's1,s2'],
  ['one, another voice', call('one-b', pick(35).map((text) => ['Samantha', text])), (c) => Object.keys(c).join() === 's1'],
  ['you', call('you', pick(12).map((text, i) => [i % 2 ? 'you' : 'Samantha', text])), (c) => Object.keys(c).sort().join() === 's1,you' && c.you === 6],
  ['quiet mic', call('quiet', pick(30).map((text) => ['Daniel', text]), { quiet: true }), (c, quietMic) => quietMic === true && Object.keys(c).join() === 's1']
]

let failed = 0
for (const [name, made, ok] of cases) {
  const { count, said, pure, quietMic } = await record(made)
  const pass = ok(count, quietMic) && pure
  if (!pass) failed += 1
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}: ${JSON.stringify(count)} said by ${JSON.stringify(said)}${quietMic ? ' (microphone heard almost nothing)' : ''}`)
}
rmSync(work, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
