import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { Check, Mic, Square, X } from 'lucide-react'

import { saveAttachment } from '@/extensions/image-drop'
import { refuse, refuseMic } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { wantsWords } from '@/lib/transcribe'
import { dictation, recordingNow, setRecording } from '@/lib/recording'
import { byKeys, still } from '@/lib/motion'
import { BACK, BACK_AFTER, RecorderBar } from './recorder-bar'

/** The kinds a recording can be kept as, the first the recorder makes: `.m4a` plays anywhere, `.weba` is Chromium's own. */
const KINDS = [
  { type: 'audio/mp4', extension: 'm4a' },
  { type: 'audio/webm;codecs=opus', extension: 'weba' },
  { type: 'audio/webm', extension: 'weba' }
]

/** Below this the microphone hears only the room: the level rests flat there, so silence never flickers. */
const HISS = 0.025
/** How long a kept recording's bar stays: its stop a tick, then back where it came from (recorder-bar.tsx). */
const SETTLE = BACK_AFTER + BACK

/**
 * Record a voice note: the microphone asked for (macOS once), then the recorder
 * bar (recorder-bar.tsx) with the sound's level as it comes in, the time, and a
 * red Stop. Esc or × throws it away. Resolves with the recording as a file and
 * its length in seconds (the file itself does not say: a recorder writes no
 * length into it), or null when cancelled or the microphone is not allowed.
 * In a window with a place for it (quick capture's footer, `[data-recorder-slot]`)
 * the bar grows out of the microphone there, under the words, never over them;
 * anywhere else it floats at the bottom, centred on the note it writes into.
 */
export async function recordVoice(slot?: HTMLElement | null, over?: HTMLElement | null): Promise<Recording | null> {
  // One recording per window, ever. Taken before the first wait, not once the
  // recorder shows: a second click on the mic (or ⌘K's "Record a voice note")
  // while the microphone is still being asked for started a second recorder,
  // with a microphone of its own, under the first.
  if (taken) return null
  taken = true
  // Dictating: stopped first, its words kept. Never both at once.
  dictation.stop?.()
  try {
    return await openRecorder(slot, over)
  } finally {
    taken = false
  }
}
let taken = false

async function openRecorder(slot?: HTMLElement | null, over?: HTMLElement | null): Promise<Recording | null> {
  if (!(await window.api.haligtree<boolean>('mic:ask'))) {
    refuseMic(true)
    return null
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    refuseMic(false)
    return null
  }
  const place = slot ?? document.querySelector<HTMLElement>('[data-recorder-slot]')
  const host = document.createElement('div')
  ;(place ?? document.body).appendChild(host)
  // Docked, it grows out of the microphone beside it: the mic's middle, in the bar's own pixels.
  const mic = place?.parentElement?.querySelector('[data-record-button]')?.getBoundingClientRect()
  const from = mic && place ? mic.left + mic.width / 2 - place.getBoundingClientRect().left : null
  const root = createRoot(host)
  return new Promise((resolve) => {
    const finish = (kept: Recording | null): void => {
      stream.getTracks().forEach((track) => track.stop())
      root.unmount()
      host.remove()
      resolve(kept)
    }
    root.render(<Recorder stream={stream} onDone={finish} docked={!!place} from={from} over={over} />)
  })
}

/** Record, then keep it where the caret is in this editor. */
export async function recordInto(editor: Editor, slot?: HTMLElement | null): Promise<void> {
  // Floating, the pill is centred on the note it writes into, not on the window (a list or a panel may sit beside it).
  const kept = await recordVoice(slot, editor.view.dom as HTMLElement)
  if (!kept) return
  try {
    // A block picked (the last recording, just kept) is stepped past, not replaced: two in a row keep both.
    const { selection } = editor.state
    const chain = editor.chain().focus()
    if (selection instanceof NodeSelection) chain.setTextSelection(selection.to)
    chain.setAttachment({ ...(await saveAttachment(kept.file)), duration: kept.seconds, transcribe: await wantsWords() }).run()
    chime('saved')
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

/** Record, then keep it as a new capture of its own, which opens. */
export async function recordAsCapture(open: (id: string) => void): Promise<void> {
  const kept = await recordVoice()
  if (!kept) return
  try {
    const attrs = { ...(await saveAttachment(kept.file)), duration: kept.seconds, transcribe: await wantsWords() }
    const id = await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs }, { type: 'paragraph' }] } })
    if (!id) return refuse('The recording could not be kept. Try again')
    chime('saved')
    open(id)
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

/** A kept recording, with the length its player shows from the start. */
export interface Recording {
  file: File
  seconds: number
}

function Recorder({ stream, onDone, docked, from, over }: { stream: MediaStream; onDone: (kept: Recording | null) => void; docked: boolean; from: number | null; over?: HTMLElement | null }): React.JSX.Element {
  // Kept: for a moment (SETTLE) the stop turns into a tick and the bar goes back where it came from, then it closes.
  const [kept, setKept] = useState(false)
  const settle = useRef<number | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  // The microphone's loudness now, read by the bar each frame.
  const heard = useRef<() => number>(() => 0)

  useEffect(() => {
    const kind = KINDS.find((one) => MediaRecorder.isTypeSupported(one.type)) ?? KINDS[2]
    const parts: Blob[] = []
    const record = new MediaRecorder(stream, { mimeType: kind.type })
    let keep = false
    record.ondataavailable = (event) => event.data.size && parts.push(event.data)
    record.onstop = () => {
      if (!keep || !parts.length) return done.current(null)
      const at = new Date()
      const name = `Voice note ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${at.getHours()}.${String(at.getMinutes()).padStart(2, '0')}.${kind.extension}`
      // Timed from the recorder's own start to the press that kept it, to the hundredth.
      const seconds = Math.round(((pressed ?? performance.now()) - begun) / 10) / 100
      done.current({ file: new File(parts, name, { type: kind.type.split(';')[0] }), seconds })
    }
    let begun = performance.now()
    let pressed: number | null = null
    record.onstart = () => (begun = performance.now())
    recorder.current = Object.assign(record, { keep: (yes: boolean) => ((keep = yes), (pressed = performance.now())) })
    record.start(250)
    chime('windup')
    const started = performance.now()

    const ears = new AudioContext()
    // Made after the microphone was asked for, the click that asked may be too
    // long ago to let it run: suspended, it hears nothing and the level lies flat.
    void ears.resume()
    const analyser = ears.createAnalyser()
    analyser.fftSize = 256
    ears.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    heard.current = () => {
      // Kept, the voice is no longer listened to: the level rests.
      if (settle.current !== null) return 0
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const one of samples) peak = Math.max(peak, Math.abs(one - 128) / 128)
      return peak < HISS ? 0 : Math.min(1, peak * 3)
    }
    let frame = 0
    const tick = (): void => {
      frame = requestAnimationFrame(tick)
      // Kept and settled: closed now, by the drawing's own clock.
      // Going back: what the bar covered comes back under it as it shrinks, so the row is whole when it is gone.
      if (settle.current !== null && performance.now() >= settle.current - BACK && recordingNow()) setRecording(null)
      if (settle.current !== null && performance.now() >= settle.current) {
        settle.current = null
        if (record.state !== 'inactive') record.stop()
        return
      }
      if (settle.current === null) setSeconds(Math.floor((performance.now() - started) / 1000))
    }
    tick()
    // Esc throws it away; ⌘↵ stops and keeps it, as quick capture's Create does.
    const onKey = (event: KeyboardEvent): void => {
      const keep = event.key === 'Enter' && event.metaKey
      if (event.key !== 'Escape' && !keep) return
      event.preventDefault()
      event.stopPropagation()
      if (keep) stop(true)
      else cancel()
    }
    window.addEventListener('keydown', onKey, true)
    setRecording({ stop: (keep) => (keep ? stop(true) : cancel()) })
    return () => {
      setRecording(null)
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
      void ears.close()
      // Gone without a choice (a dev double mount): stopped quietly, not taken as Cancel.
      record.onstop = null
      if (record.state !== 'inactive') record.stop()
    }
  }, [stream])

  const stop = (keep: boolean): void => {
    const record = recorder.current as (MediaRecorder & { keep: (yes: boolean) => void }) | null
    if (!record || record.state === 'inactive' || settle.current !== null) return
    record.keep(keep)
    // Ended by a key (⌘↵) it goes at once, as anything a key reaches does.
    if (!keep || still() || byKeys()) return void record.stop()
    // Nothing more is kept from here; the bar shows the tick and goes back where it came from, then it closes.
    if (record.state === 'recording') record.pause()
    setKept(true)
    settle.current = performance.now() + SETTLE
  }
  // Once kept it is on its way back: Esc then changes nothing.
  const cancel = (): void => void (settle.current === null && (chime('away'), stop(false)))

  return (
    <RecorderBar label="Recording a voice note" data={{ 'data-voice-recorder': true }} docked={docked} from={from} over={over} closing={kept}
      level={() => heard.current()} seconds={seconds}
      // Plain titles: the recorder has a root of its own, outside the tips' provider; the app's title tips draw them.
      start={(
        <button type="button" aria-label="Cancel" title="Throw it away  Esc" onClick={cancel}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]">
          <X className="size-3.5" />
        </button>
      )}
      end={(
        <button type="button" aria-label="Stop and keep" title="Stop and keep it  ⌘↵" onClick={() => stop(true)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.97]" style={{ background: 'var(--tt-color-text-red)' }}>
          {kept ? <Check data-kept className="size-3.5" strokeWidth={3} /> : <Square className="size-2.5 fill-current" />}
        </button>
      )} />
  )
}

/** The microphone, for a button that starts a recording. */
export const MicIcon = Mic
