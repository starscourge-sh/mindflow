/**
 * Changes to the page made together, once a frame: every reading first, then
 * every writing.
 *
 * A picture's load is told on its own, one picture at a time. A block in a
 * note that marked itself as each of its pictures arrived (a link card's icon
 * and picture) made one change per picture, and ProseMirror reads every change
 * inside a note the moment it is made, laying the note out to do it: a long
 * note with 160 link cards was laid out 160 times and more as it opened, each
 * a tenth of a second. Gathered here, a frame's worth of them is one change
 * and one layout, the one the frame was going to do anyway.
 */
type Read = () => (() => void) | void
let reads: Read[] = []
let frame = 0

/** `read` measures what it needs and gives back what to write; all of a frame's are read before any is written. */
export function readThenWrite(read: Read): void {
  reads.push(read)
  frame ||= requestAnimationFrame(() => {
    frame = 0
    const now = reads
    reads = []
    const writes = now.map((one) => one())
    for (const write of writes) write?.()
  })
}

/** A change with nothing to measure first. */
export const writeTogether = (write: () => void): void => readThenWrite(() => write)
