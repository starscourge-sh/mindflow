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
 * Works for the note's first video file. Not YouTube: it will not play
 * inside Haligtree (it asks to sign in), so there is nothing to pause.
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

/** The note's first video file, or null when it has none. */
function playerIn(view: EditorView): Player | null {
  const file = view.dom.querySelector<HTMLVideoElement>("video.tiptap-attachment-video")
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
