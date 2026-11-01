import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { Check, Mic, Square, X } from 'lucide-react'

import { saveAttachment } from '@/extensions/image-drop'
import { refuse } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { wantsWords } from '@/lib/transcribe'
import { dictation, setRecording } from '@/lib/recording'
import { cn } from '@/lib/cn'
import { still } from '@/lib/motion'
import { useCentreOn } from '@/lib/centre-on'

/** The kinds a recording can be kept as, the first the recorder makes: `.m4a` plays anywhere, `.weba` is Chromium's own. */
const KINDS = [
  { type: 'audio/mp4', extension: 'm4a' },
  { type: 'audio/webm;codecs=opus', extension: 'weba' },
  { type: 'audio/webm', extension: 'weba' }
]

/** 0:42, 12:05, and past an hour 2:00:04, never "120:04". */
/** Below this the microphone hears only the room; how fast the shown level follows the voice up, and lets go. */
const HISS = 0.025
/** How long a kept recording's pill stays, its bars settling and its stop a tick, before it goes. */
const SETTLE = 250
const RISE = 0.55
const FALL = 0.12

const clock = (seconds: number): string => {
  const whole = Math.floor(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Record a voice note: the microphone asked for (macOS once), then a pill at
 * the bottom of the window with the sound's level as it comes in, the time,
 * and a red Stop. Esc or × throws it away. Resolves with the recording as a
 * file and its length in seconds (the file itself does not say: a recorder
 * writes no length into it), or null when cancelled or the microphone is not
 * allowed. Given a `slot` (quick capture's writing area), the recorder takes
 * that place instead, large and calm, rather than floating over the page.
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
    refuse('Haligtree may not use the microphone. Allow it in System Settings, under Privacy & Security, then Microphone')
    return null
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    refuse('No microphone could be used. Check one is connected and allowed')
    return null
  }
  const host = document.createElement('div')
  ;(slot ?? document.body).appendChild(host)
  const root = createRoot(host)
  return new Promise((resolve) => {
    const finish = (kept: Recording | null): void => {
      stream.getTracks().forEach((track) => track.stop())
      root.unmount()
      host.remove()
      resolve(kept)
    }
    root.render(<Recorder stream={stream} onDone={finish} inline={!!slot} over={over} />)
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

function Recorder({ stream, onDone, inline, over }: { stream: MediaStream; onDone: (kept: Recording | null) => void; inline?: boolean; over?: HTMLElement | null }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Its middle on the note it writes into (lib/centre-on.ts).
  const middle = useCentreOn(over)
  // Kept: for a moment (SETTLE) the bars ease to rest and the stop turns into a tick, then it goes.
  const [kept, setKept] = useState(false)
  const settle = useRef<number | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const done = useRef(onDone)
  done.current = onDone

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

    // The level as it comes in, as the Mac's dictation draws it: thin bars
    // from the middle out, tallest in the middle and tapering to the ends,
    // where the pill's mask fades them away.
    const ears = new AudioContext()
    // Made after the microphone was asked for, the click that asked may be too
    // long ago to let it run: suspended, it hears nothing and the level lies flat.
    void ears.resume()
    const analyser = ears.createAnalyser()
    analyser.fftSize = 256
    ears.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const levels: number[] = []
    // The level as shown: rises with the voice at once, falls back slowly, and
    // under the room's own hiss rests flat, so silence never flickers.
    let shown = 0
    let frame = 0
    const draw = (): void => {
      frame = requestAnimationFrame(draw)
      // Kept and settled: closed now, by the drawing's own clock.
      if (settle.current !== null && performance.now() >= settle.current) {
        settle.current = null
        if (record.state !== 'inactive') record.stop()
        return
      }
      if (settle.current === null) setSeconds(Math.floor((performance.now() - started) / 1000))
      const el = canvas.current
      if (!el) return
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const one of samples) peak = Math.max(peak, Math.abs(one - 128) / 128)
      // Settling, the voice is no longer listened to: the bars only ease down.
      const heard = settle.current !== null || peak < HISS ? 0 : peak
      shown += (heard - shown) * (heard > shown ? RISE : FALL)
      levels.push(shown)
      const ratio = devicePixelRatio
      const width = el.clientWidth * ratio, height = el.clientHeight * ratio
      if (el.width !== width) (el.width = width, el.height = height)
      const c = el.getContext('2d')!
      c.clearRect(0, 0, width, height)
      c.fillStyle = getComputedStyle(el).color
      const bar = 1.5 * ratio, gap = 4.5 * ratio
      const half = Math.floor(width / 2 / (bar + gap))
      // The newest level in the middle, older ones moving out to both sides.
      for (let step = 0; step < half; step += 1) {
        const level = levels[levels.length - 1 - step] ?? 0
        const taper = Math.cos((step / half) * (Math.PI / 2))
        const tall = Math.max(2 * ratio, Math.min(1, level * 3) * height * (0.35 + 0.65 * taper))
        for (const side of [1, -1]) {
          c.beginPath()
          c.roundRect(width / 2 + side * step * (bar + gap) - bar / 2, (height - tall) / 2, bar, tall, bar / 2)
          c.fill()
        }
      }
    }
    draw()
    // Esc throws it away; ⌘↵ stops and keeps it, as quick capture's Create says while it records.
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
    if (!record || record.state === 'inactive') return
    record.keep(keep)
    if (!keep || still()) return void record.stop()
    // Nothing more is kept from here; the pill shows the tick and its bars settle, then it closes.
    if (record.state === 'recording') record.pause()
    setKept(true)
    settle.current = performance.now() + SETTLE
  }
  const cancel = (): void => (chime('away'), stop(false))

  const cancelButton = (
    // Plain titles: the recorder has a root of its own, outside the tips' provider; the app's title tips draw them.
    <button type="button" aria-label="Cancel" title="Throw it away  Esc" onClick={cancel}
      className={cn('flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]', inline ? 'h-8 gap-1.5 px-3 text-control' : 'size-7')}>
      <X className="size-3.5" />{inline && 'Cancel'}
    </button>
  )
  // The time with a small red light before it, the one sign of "on air" every recorder shares.
  const time = (
    <span className="flex shrink-0 items-center gap-1.5 text-control tabular-nums text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--tt-color-text-red)] motion-safe:animate-pulse" />
      <span data-voice-time>{clock(seconds)}</span>
    </span>
  )
  const stopButton = (
    <button type="button" aria-label="Stop and keep" title="Stop and keep it  ⌘↵" onClick={() => stop(true)}
      className={cn('flex shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.97]', inline ? 'size-9' : 'size-7')} style={{ background: 'var(--tt-color-text-red)' }}>
      {kept ? <Check data-kept className={inline ? 'size-4' : 'size-3.5'} strokeWidth={3} /> : <Square className={cn('fill-current', inline ? 'size-3' : 'size-2.5')} />}
    </button>
  )
  // Faded at both ends, as the level fades in from nothing.
  // Quiet chrome (DESIGN.md): thin bars, well apart, in the faded ink, no wider than the controls under it need.
  const level = <canvas ref={canvas} data-voice-level className={cn('min-w-0 text-muted-foreground/70 [mask-image:linear-gradient(90deg,transparent,#000_28%,#000_72%,transparent)]', inline ? 'h-8 w-full max-w-72' : 'h-5 flex-1')} />

  // In quick capture: the writing area itself, given over to the recording.
  // No box (a writing surface has none): the level wide across the text
  // column, then Cancel, the time and Stop on one centred line under it.
  if (inline)
    return (
      // data-keeps-size: part of the box, not a pop-up that needs it full height (lib/fit-box.ts).
      <div role="dialog" aria-label="Recording a voice note" data-voice-recorder data-inline data-keeps-size
        className="flex flex-col items-center gap-3 py-4 animate-in fade-in-0 duration-200">
        {level}
        <div className="flex items-center gap-4">{cancelButton}{time}{stopButton}</div>
      </div>
    )
  return (
    <div role="dialog" aria-label="Recording a voice note" data-voice-recorder
      // The app's one floating material (lib/float.ts), as the Look Up card and the page peek wear it.
      // One family with quick capture's round controls (mf-voice-pill, main.css): their paper, hairline and 32px height.
      className="mf-voice-pill fixed bottom-28 left-1/2 z-[1000] flex w-[340px] max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 pr-0.5 pl-0.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      style={middle === null ? undefined : { left: middle }}>
      {cancelButton}
      {level}
      {time}
      {stopButton}
    </div>
  )
}

/** The microphone, for a button that starts a recording. */
export const MicIcon = Mic
