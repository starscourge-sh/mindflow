/**
 * A recording's waveform: how loud it is along its length, as PEAKS numbers from 0 to 255, and its true length.
 * Worked out once from the sound itself (decoded at a low rate, which keeps an hour of it small), then kept beside
 * the file by main (media.ts) and read from there every time after, in every window.
 */
export type Waveform = { peaks: number[]; seconds: number }

/** How many slices a waveform is kept in: enough for the widest player, few enough to keep tiny. */
export const PEAKS = 512
/** 8,000 samples a second is plenty to see where a voice is loud: an hour of it is about 115 MB while it is read. */
const RATE = 8000

const asked = new Map<string, Promise<Waveform | null>>()
/** Sounds are read one at a time: a page of fifty recordings never decodes fifty at once. */
let turn: Promise<Waveform | null> = Promise.resolve(null)

/** The waveform of a stored recording, from what is kept or worked out now; null when it cannot be read. */
export function waveformOf(src: string): Promise<Waveform | null> {
  let found = asked.get(src)
  if (!found) {
    found = window.api.haligtree<Waveform | null>('media:peaks', src)
      .catch(() => null)
      .then((kept) => kept ?? (turn = turn.then(() => measure(src))))
    asked.set(src, found)
  }
  return found
}

async function measure(src: string): Promise<Waveform | null> {
  try {
    const bytes = await (await fetch(src)).arrayBuffer()
    const sound = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes)
    const made = { peaks: peaksOf(sound.getChannelData(0)), seconds: Math.round(sound.duration * 100) / 100 }
    if (made.seconds > 0) void window.api.haligtree('media:keep-peaks', src, made).catch(() => undefined)
    return made
  } catch {
    return null
  }
}

/**
 * The loudest moment in each slice, against the loudest of all, so a quiet recording still shows its shape. A
 * square root lifts the quiet parts a little, the way an ear hears them.
 */
export function peaksOf(samples: Float32Array, count = PEAKS): number[] {
  const out = new Array<number>(count).fill(0)
  const step = samples.length / count
  let top = 0
  const raw = out.map((_, slice) => {
    let peak = 0
    for (let at = Math.floor(slice * step), end = Math.floor((slice + 1) * step); at < end; at += 1) peak = Math.max(peak, Math.abs(samples[at]))
    top = Math.max(top, peak)
    return peak
  })
  return top ? raw.map((one) => Math.round(Math.sqrt(one / top) * 255)) : out
}

/** `peaks` drawn as `bars`: each bar the loudest of the slices it covers, from 0 to 1. */
export function barsOf(peaks: number[], bars: number): number[] {
  if (!peaks.length || bars <= 0) return []
  const step = peaks.length / bars
  return Array.from({ length: bars }, (_, bar) => {
    let high = 0
    for (let at = Math.floor(bar * step), end = Math.max(Math.floor((bar + 1) * step), Math.floor(bar * step) + 1); at < end && at < peaks.length; at += 1) high = Math.max(high, peaks[at])
    return high / 255
  })
}
