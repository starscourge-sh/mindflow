import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import { cue } from "@/lib/cues"

/**
 * Typing pauses the video (Mote's way). When a note's video is playing and
 * you start to write, it pauses where you began, a fresh line gets that
 * moment as a time, `[4:05]`, and once you stop typing for two seconds it
 * plays on. ⌥K plays or pauses, ⌥J and ⌥L go back or on five seconds, all
 * without leaving the line.
 *
 * Works for the note's first video: a YouTube block (its player spoken to
 * through YouTube's own iframe messages) or a video file in the note.
 */

const RESUME_AFTER_MS = 2000
const SKIP_S = 5

let on = true
/** Whether writing pauses a note's video, for every editor on the page at once. */
export function setTypePause(enabled: boolean): void {
  on = enabled
}
export const typePauseOn = (): boolean => on

/** A video in a note, whichever kind it is. */
interface Player {
  playing: () => boolean
  time: () => number
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
}

// What each YouTube player last said of itself: playing or not, and where.
const told = new WeakMap<MessageEventSource, { state: number; time: number }>()
window.addEventListener("message", (event) => {
  if (!event.source || typeof event.data !== "string" || !/youtube/.test(event.origin)) return
  try {
    const said = JSON.parse(event.data) as { event?: string; info?: { playerState?: number; currentTime?: number } | number }
    const was = told.get(event.source) ?? { state: -1, time: 0 }
    if (said.event === "infoDelivery" && typeof said.info === "object") told.set(event.source, { state: said.info.playerState ?? was.state, time: said.info.currentTime ?? was.time })
    if (said.event === "onStateChange" && typeof said.info === "number") told.set(event.source, { ...was, state: said.info })
  } catch {
    // Not one of the player's messages.
  }
})

/** Ask a YouTube player to tell us how it is doing, as YouTube's own script does when it loads. */
export function listenTo(frame: HTMLIFrameElement): void {
  frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*")
}

const command = (frame: HTMLIFrameElement, func: string, args: unknown[] = []): void =>
  frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*")

/** The note's first video, or null when it has none playing or ready to play. */
function playerIn(view: EditorView): Player | null {
  const frame = view.dom.querySelector<HTMLIFrameElement>("[data-youtube-video] iframe")
  const file = view.dom.querySelector<HTMLVideoElement>("video.tiptap-attachment-video")
  if (frame?.contentWindow) {
    const source = frame.contentWindow
    const now = (): { state: number; time: number } => told.get(source) ?? { state: -1, time: 0 }
    return {
      playing: () => now().state === 1,
      time: () => now().time,
      play: () => command(frame, "playVideo"),
      pause: () => {
        told.set(source, { ...now(), state: 2 })
        command(frame, "pauseVideo")
      },
      seek: (seconds) => command(frame, "seekTo", [Math.max(0, now().time + seconds), true]),
    }
  }
  if (file)
    return {
      playing: () => !file.paused && !file.ended,
      time: () => file.currentTime,
      play: () => void file.play(),
      pause: () => file.pause(),
      seek: (seconds) => void (file.currentTime = Math.max(0, file.currentTime + seconds)),
    }
  return null
}

/** "245" as "4:05", the way the note's time links are written. */
const clock = (seconds: number): string => {
  const whole = Math.floor(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

export const TypePause = Extension.create({
  name: "typePause",

  addProseMirrorPlugins() {
    // The video this editor paused for typing, to play on when the typing stops.
    let paused: Player | null = null
    let rest: ReturnType<typeof setTimeout> | undefined
    // The two-second quiet is counted from the last key: each key starts it again.
    const later = (): void => {
      clearTimeout(rest)
      if (!paused) return
      rest = setTimeout(() => {
        // Played or paused by hand meanwhile: that choice stands.
        if (paused && !paused.playing()) paused.play()
        paused = null
      }, RESUME_AFTER_MS)
    }
    return [
      new Plugin({
        key: new PluginKey("typePause"),
        view: () => ({ destroy: () => clearTimeout(rest) }),
        props: {
          handleKeyDown: (view, event) => {
            // ⌥K, ⌥J, ⌥L: the video's play and skip keys, by the key's place, as ⌥ turns letters into signs.
            if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && /^Key[JKL]$/.test(event.code)) {
              const player = playerIn(view)
              if (!player) return false
              event.preventDefault()
              paused = null
              clearTimeout(rest)
              if (event.code === "KeyK") {
                const playing = player.playing()
                if (playing) player.pause()
                else player.play()
                cue(playing ? "pause" : "play")
              } else player.seek(event.code === "KeyJ" ? -SKIP_S : SKIP_S)
              return true
            }
            if (paused) later()
            return false
          },
          handleTextInput: (view, from, to, text) => {
            if (!on || !view.editable) return false
            if (paused) return later(), false
            const player = playerIn(view)
            if (!player?.playing()) return false
            const at = player.time()
            player.pause()
            paused = player
            later()
            // A fresh line starts with the moment the typing began.
            const { $from } = view.state.selection
            if (!$from.parent.isTextblock || $from.parent.type.spec.code || $from.parent.content.size || from !== to) return false
            view.dispatch(view.state.tr.insertText(`[${clock(at)}] ${text}`, from, to))
            return true
          },
        },
      }),
    ]
  },
})
