// A made-up recording for probes, never the microphone: a 16-bit mono WAV of a soft tone in bursts like speech,
// each burst its own loudness from `seed`, so two seeds draw two different waveforms. 8 kHz keeps it small.
export function toneFile(seconds = 6, seed = 1) {
  const rate = 8000
  const n = Math.round(seconds * rate)
  const out = Buffer.alloc(44 + n * 2)
  let s = seed >>> 0 || 1
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  // Bursts of 120 to 420ms at 0.08 to 0.9 loudness, with 40 to 200ms of quiet between.
  const env = new Float32Array(n)
  for (let at = 0; at < n;) {
    const long = Math.round((0.12 + next() * 0.3) * rate)
    const loud = 0.08 + next() * 0.82
    for (let i = 0; i < long && at + i < n; i += 1) env[at + i] = loud * Math.sin((Math.PI * i) / long)
    at += long + Math.round((0.04 + next() * 0.16) * rate)
  }
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8)
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34)
  out.write('data', 36); out.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i += 1) out.writeInt16LE(Math.round(env[i] * 0.8 * 32767 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2)
  return out
}
