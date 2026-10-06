/**
 * The sounds the editor would like to make.
 *
 * The editor has no sounds of its own: what a find or an outline jump sounds
 * like belongs to the app around it. So it names the moment and the page
 * decides what, if anything, plays - one setter for every editor on the page,
 * kept the same way the vim switch is. Left unset, the editor is silent.
 */
export type EditorCue =
  /** The find bar opened, or closed. */
  | "find"
  | "find-close"
  /** Stepped to a match; `n` is which one. */
  | "find-step"
  /** Stepped, or searched, and there was nothing to land on. */
  | "find-miss"
  /** One match replaced, or all of them. */
  | "replace"
  | "replace-all"
  /** The outline was opened by keyboard, or let go. */
  | "outline"
  | "outline-close"
  /** Moved through the outline; `n` is the row. */
  | "outline-step"
  /** Went to a heading: from the outline, a heading link, or the jump keys. */
  | "heading"
  /** A worked-out answer was written in. */
  | "math"
  /** The source panel opened, or closed. */
  | "source"
  | "source-close"
  /** A callout folded away to its title, or opened again. */
  | "fold"
  | "unfold"
  /** A video or a recording started, or stopped. */
  | "play"
  | "pause"
  /** The first play of one, from the start: a little more than a plain play. */
  | "media-start"
  /** It played to its end. */
  | "media-end"
  /** From the end, back to the start and playing. */
  | "media-replay"
  /** The speed changed; `n` is which step (0 is normal). */
  | "media-speed"
  /** Out into its own window or full screen, or back. */
  | "media-window"
  | "media-window-close"

let play: (cue: EditorCue, n?: number) => void = () => {}

/** Say what each moment sounds like, for every editor on the page. */
export function setCues(player: (cue: EditorCue, n?: number) => void): void {
  play = player
}

/** Make one. Silent when the page has given no player. */
export function cue(name: EditorCue, n?: number): void {
  play(name, n)
}
