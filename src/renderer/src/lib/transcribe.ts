import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { refuse, toast } from "@/components/haligtree/ui"
import { haligtree } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { tidySpeech } from "@/lib/fillers"

/**
 * A voice note into words (main/transcribe.ts, on this Mac). The words land
 * under the recording as plain lines, each starting with its time, "[0:12]",
 * which plays the recording from there (extensions/line-cards.ts). Plain
 * lines, so search finds them, they quote, Look Up reads them and they can
 * become cards like any others.
 */
type Segment = { text: string; start: number; end: number }
type Transcript = { segments: Segment[]; text: string } | { error: { code: string; message: string } }

/** Recordings being turned into words now, by their stored address: their block shows the Orb. */
const busy = new Set<string>()
const listeners = new Set<() => void>()
const tell = (): void => listeners.forEach((one) => one())

export const isTranscribing = (src: string): boolean => busy.has(src)
export const onTranscribing = (listener: () => void): (() => void) => (listeners.add(listener), () => void listeners.delete(listener))

export const isAudio = (node: ProseMirrorNode | null | undefined): boolean =>
  node?.type.name === "attachment" && /\.(mp3|m4a|weba|wav|ogg|aac|flac)$/i.test(String(node.attrs.name || node.attrs.src || ""))

/** "75" as "1:15", the way a time is written in a line. */
const clock = (seconds: number): string => {
  const whole = Math.floor(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

/** A recording the Mac cannot read (Chromium's .weba) as a WAV it can: Chromium decodes it, at 16 kHz, one channel. */
async function wavOf(src: string): Promise<Uint8Array> {
  const bytes = await (await fetch(src)).arrayBuffer()
  const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes)
  const rate = 16000
  const length = Math.ceil(decoded.duration * rate)
  const render = new OfflineAudioContext(1, Math.max(1, length), rate)
  const source = render.createBufferSource()
  source.buffer = decoded
  source.connect(render.destination)
  source.start()
  const samples = (await render.startRendering()).getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, words: string): void => [...words].forEach((one, i) => out.setUint8(at + i, one.charCodeAt(0)))
  text(0, "RIFF"), out.setUint32(4, 36 + samples.length * 2, true), text(8, "WAVE"), text(12, "fmt ")
  out.setUint32(16, 16, true), out.setUint16(20, 1, true), out.setUint16(22, 1, true), out.setUint32(24, rate, true)
  out.setUint32(28, rate * 2, true), out.setUint16(32, 2, true), out.setUint16(34, 16, true), text(36, "data"), out.setUint32(40, samples.length * 2, true)
  samples.forEach((one, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, one)) * 0x7fff, true))
  return new Uint8Array(out.buffer)
}

/** Where the recording is in the note now (the note may have changed while it was listened to). */
const placeOf = (editor: Editor, src: string): { pos: number; node: ProseMirrorNode } | null => {
  let found: { pos: number; node: ProseMirrorNode } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (isAudio(node) && node.attrs.src === src) found = { pos, node }
    return !found
  })
  return found
}

/** A line led by a time, "[0:03] ...": a transcript's line. */
const TIMED = /^\[(?:\d{1,2}:)?\d{1,2}:[0-5]\d\]/

/** The recording's own transcript: the run of timed lines straight after it (empty where it has none). */
const wordsAfter = (editor: Editor, src: string): { from: number; to: number; lines: ProseMirrorNode[] } | null => {
  const place = placeOf(editor, src)
  if (!place) return null
  const { doc } = editor.state
  const from = place.pos + place.node.nodeSize
  const lines: ProseMirrorNode[] = []
  let to = from
  for (let next = doc.resolve(to).nodeAfter; next?.type.name === "paragraph" && TIMED.test(next.textContent); next = doc.resolve(to).nodeAfter) {
    lines.push(next)
    to += next.nodeSize
  }
  return { from, to, lines }
}

/** Turn the recording into words, written under it; words it had already are replaced in place, with Undo. */
export async function transcribe(editor: Editor, src: string): Promise<void> {
  if (busy.has(src) || !editor.isEditable) return
  busy.add(src)
  tell()
  try {
    let wav: Uint8Array | undefined
    if (/\.weba$/i.test(src)) {
      try {
        wav = await wavOf(src)
      } catch {
        return refuse("This recording could not be read for words")
      }
    }
    const result = await window.api.haligtree<Transcript>("transcribe", src, wav)
    if ("error" in result) return refuse(result.error.message)
    if (editor.isDestroyed) return
    const had = wordsAfter(editor, src)
    if (!had) return
    if (!result.segments.length) return refuse("No words were heard in this recording", "info")
    const { schema } = editor.state
    const line = (one: Segment, text: string): ProseMirrorNode => schema.nodes.paragraph.create(null, schema.text(`[${clock(one.start)}] ${text}`))
    // Ums, uhs and doubled words out, by rules (Settings, "Tidy transcripts"); the words as said kept for Undo.
    const tidy = (await haligtree.settings()).tidyTranscripts !== false
    const said = result.segments.map((one) => line(one, one.text))
    const lines = tidy ? result.segments.map((one) => line(one, tidySpeech(one.text))) : said
    const tidied = lines.some((one, i) => one.textContent !== said[i].textContent)
    editor.view.dispatch(editor.state.tr.replaceWith(had.from, had.to, lines).scrollIntoView())
    chime("saved")
    const count = result.segments.length === 1 ? "A line" : `${result.segments.length} lines`
    // Undo here puts back the words exactly as said, wherever the note has moved since.
    const asSaid = (): void => {
      const now = wordsAfter(editor, src)
      if (now && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.replaceWith(now.from, now.to, said))
    }
    if (!had.lines.length) return toast(tidied ? `${count} of words under the recording, without the ums and repeats. Undo keeps them as said` : `${count} of words, under the recording. A time plays it from there`, tidied ? asSaid : undefined, "success")
    // Transcribed again: the words it had are put back by Undo, wherever the note has moved since.
    const undo = (): void => {
      const now = wordsAfter(editor, src)
      if (now && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.replaceWith(now.from, now.to, had.lines))
    }
    toast(`${count} of words, in place of the recording's old ones`, undo, "success")
  } catch {
    refuse("The words could not be made out. Try again")
  } finally {
    busy.delete(src)
    tell()
  }
}

/** The recording has its words under it already: the line after it starts with a time. */
export const hasWords = (editor: Editor, src: string): boolean => {
  return !!wordsAfter(editor, src)?.lines.length
}

/** Recordings on show with no words yet: what ⌘K's "Transcribe the voice notes" turns into words. */
export const recordingsWithoutWords = (): number => document.querySelectorAll(".tiptap-attachment.is-audio:not([data-words])").length

/** ⌘K's "Transcribe the voice notes": every recording on show without its words. */
export const transcribePage = (): void => void window.dispatchEvent(new Event("haligtree:transcribe-page"))

/** A recording just kept is turned into words as soon as its block is on the page, when Settings says so. */
export const wantsWords = async (): Promise<boolean> => (await haligtree.settings()).transcribeAsYouRecord === true
