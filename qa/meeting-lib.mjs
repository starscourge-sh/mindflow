// A made-up meeting for probes, never the microphone or the Mac's sound: two tracks as 16 kHz WAVs (you, and the
// others) in which each line is said by a "voice" of its own pitch (a hum with its overtones, in bursts like
// syllables), and the script of what each line says, which the meeting program's test mode stands in for the words.
// Who said a line is never in the script: the program has to hear it from the sound.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Each voice's pitch in Hz: you, and two people on the other side. */
export const VOICES = { you: 165, thandi: 230, marco: 120 }

/** A short stand-up: who says what, and when (seconds). */
export const MEETING = [
  { who: 'marco', text: 'Morning all, let us start with the launch plan.', start: 0.4, end: 2.6 },
  { who: 'thandi', text: 'The designs are nearly done, I will send them by Friday.', start: 3.0, end: 5.4 },
  { who: 'you', text: 'Great. Can you also share the research notes?', start: 5.9, end: 7.9 },
  { who: 'thandi', text: 'Yes, I will add them to the folder today.', start: 8.3, end: 10.3 },
  { who: 'marco', text: 'Who is taking the client call on 14 November at 3pm?', start: 10.8, end: 13.2 },
  { who: 'you', text: 'I will take it and write up what they say.', start: 13.7, end: 15.6 },
  { who: 'marco', text: 'We decided to ship the beta next week.', start: 16.1, end: 18.2 },
  { who: 'thandi', text: 'Your summary last week was really useful, by the way.', start: 18.6, end: 20.8 }
]

function wav(seconds, lines, rate = 16000) {
  const n = Math.round(seconds * rate)
  const samples = new Float32Array(n)
  let seed = 7
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  for (const line of lines) {
    const f0 = VOICES[line.who]
    for (let at = line.start * rate; at < line.end * rate;) {
      const long = Math.round((0.14 + next() * 0.22) * rate)
      const loud = 0.25 + next() * 0.35
      for (let i = 0; i < long && at + i < Math.min(n, line.end * rate); i += 1) {
        const t = (at + i) / rate
        const env = loud * Math.sin((Math.PI * i) / long)
        samples[Math.floor(at + i)] += env * (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(4 * Math.PI * f0 * t) + 0.25 * Math.sin(6 * Math.PI * f0 * t)) / 1.75
      }
      at += long + Math.round((0.03 + next() * 0.08) * rate)
    }
  }
  const out = Buffer.alloc(44 + n * 2)
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8)
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34)
  out.write('data', 36); out.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i += 1) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 0.8 * 32767), 44 + i * 2)
  return out
}

/**
 * The meeting's files in `folder`: you.wav, others.wav and script.jsonl, and the paths as HALIGTREE_QA_MEETING
 * wants them. `repeat` plays the meeting that many times over (an hour is `repeat: 172`).
 */
export function makeMeeting(folder, { lines = MEETING, repeat = 1 } = {}) {
  const long = Math.max(...lines.map((one) => one.end)) + 0.6
  const all = Array.from({ length: repeat }, (_, round) => lines.map((one) => ({ ...one, start: one.start + round * long, end: one.end + round * long }))).flat()
  const seconds = long * repeat
  writeFileSync(join(folder, 'you.wav'), wav(seconds, all.filter((one) => one.who === 'you')))
  writeFileSync(join(folder, 'others.wav'), wav(seconds, all.filter((one) => one.who !== 'you')))
  writeFileSync(join(folder, 'script.jsonl'), all.map((one) => JSON.stringify({ track: one.who === 'you' ? 'you' : 'others', text: one.text, start: one.start, end: one.end })).join('\n'))
  return { you: join(folder, 'you.wav'), others: join(folder, 'others.wav'), script: join(folder, 'script.jsonl'), seconds, lines: all }
}
