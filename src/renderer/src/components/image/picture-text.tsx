import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { PictureLine } from "../../../../main/picture-words"

/**
 * The words in a picture, selectable where they lie, as Live Text does in
 * Preview and Photos: read once by the Mac (Apple's Vision, main/picture-words.ts
 * readLines), then laid over the picture as invisible words, each stretched to
 * the box Vision found it in. The browser's own selection does the rest, so
 * the picked words take the Mac's highlight and copy as text. A drag picks
 * from letter to letter, a double-click a word, a triple-click a line.
 */

/** Read this session, by picture: opened again it has its words at once. */
const known = new Map<string, PictureLine[]>()

/** A stored picture's words where they lie: null until read (or for a picture that cannot be), [] with none. `kept`: read before, not now. */
export function usePictureLines(src: string | null): { lines: PictureLine[] | null; kept: boolean } {
  const [state, setState] = useState(() => ({ src, lines: src ? known.get(src) ?? null : null, kept: !!src && known.has(src) }))
  useEffect(() => {
    if (!src || known.has(src)) return
    const ask = window.api?.imageLines
    if (!ask) return
    let live = true
    void ask(src).then(
      (read) => {
        if (!read) return
        known.set(src, read.lines)
        if (live) setState({ src, lines: read.lines, kept: read.kept })
      },
      () => undefined
    )
    return () => void (live = false)
  }, [src])
  if (state.src !== src) return { lines: src ? known.get(src) ?? null : null, kept: !!src && known.has(src) }
  return { lines: state.lines, kept: state.kept }
}

const wordsIn = (layer: Element): HTMLElement[] => [...layer.querySelectorAll<HTMLElement>("[data-word]")]
const textOf = (span: Element): Text | null => (span.firstChild instanceof Text ? span.firstChild : null)
const end = (node: Text): number => node.data.trimEnd().length

/** The words picked in `layer`, a line of them to a line of text; '' when none are. */
export function pickedText(layer: HTMLElement | null): string {
  const picked = getSelection()
  if (!layer || !picked || picked.isCollapsed || !picked.rangeCount) return ""
  const range = picked.getRangeAt(0)
  const lines: string[][] = []
  let at = -1
  for (const span of wordsIn(layer)) {
    const node = textOf(span)
    if (!node || !range.intersectsNode(node)) continue
    const word = node.data.slice(range.startContainer === node ? range.startOffset : 0, range.endContainer === node ? range.endOffset : node.length).trim()
    if (!word) continue
    const line = Number(span.dataset.line)
    if (line !== at) (lines.push([]), (at = line))
    lines[lines.length - 1].push(word)
  }
  return lines.map((words) => words.join(" ")).join("\n")
}

/** Every word in the picture, picked. */
export function pickAll(layer: HTMLElement | null): boolean {
  const all = layer ? wordsIn(layer) : []
  const first = all[0] && textOf(all[0])
  const last = all.at(-1) && textOf(all.at(-1)!)
  if (!first || !last) return false
  getSelection()?.setBaseAndExtent(first, 0, last, end(last))
  return true
}

/** Nothing picked in the picture any more. */
export function unpick(layer: HTMLElement | null): void {
  const picked = getSelection()
  if (layer && picked?.anchorNode && layer.contains(picked.anchorNode)) picked.removeAllRanges()
}

/** The letter under the pointer, else the nearest word's start or end (past its middle). */
function spotAt(layer: HTMLElement, x: number, y: number): { node: Text; offset: number } | null {
  const caret = document.caretPositionFromPoint?.(x, y)
  if (caret && caret.offsetNode instanceof Text && layer.contains(caret.offsetNode)) return { node: caret.offsetNode, offset: Math.min(caret.offset, end(caret.offsetNode)) }
  let best: { node: Text; offset: number } | null = null
  let far = Infinity
  for (const span of wordsIn(layer)) {
    const node = textOf(span)
    if (!node) continue
    const box = span.getBoundingClientRect()
    // Lines count for more than letters: a pointer below a line's end is on the next line, not past this one.
    const dx = Math.max(box.left - x, 0, x - box.right)
    const dy = Math.max(box.top - y, 0, y - box.bottom) * 3
    const d = dx * dx + dy * dy
    if (d < far) (far = d), (best = { node, offset: x > box.left + box.width / 2 ? end(node) : 0 })
  }
  return best
}

/**
 * The invisible words, over the picture and moved with it: the same box and
 * the same zoom (`transform`). Only the words take the pointer (an I-beam);
 * everywhere else the picture's own click still zooms.
 */
export function PictureText({ lines, width, height, transform, transition, layerRef, kept }: {
  lines: PictureLine[]
  width: number
  height: number
  transform: string
  transition: string
  layerRef: React.RefObject<HTMLDivElement | null>
  /** Read before, not just now: marked for a probe. */
  kept?: boolean
}): React.JSX.Element {
  const from = useRef<{ node: Text; offset: number } | null>(null)
  // Each word's own width at its own size, measured on the page (outside the picture's zoom) before it is
  // drawn, to stretch it to its box: the Mac's face is drawn wider at small sizes, so one size will not do.
  const [natural, setNatural] = useState<number[] | null>(null)
  // How many words come before each line, to find a word's width.
  const starts = useMemo(() => lines.reduce<number[]>((all, _, n) => [...all, n ? all[n - 1] + lines[n - 1].words.length : 0], []), [lines])
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    // Every word laid down at once and then read: one layout for them all. Set and read a word at a time,
    // each read laid out the whole window again, and a page of 450 words held it 9 seconds.
    const ruler = document.createElement("div")
    ruler.className = "mf-look-text-ruler"
    const each = wordsIn(layer).map((span) => {
      const one = document.createElement("span")
      one.style.fontSize = span.style.fontSize
      // With one more space: picked through its end, a word (its own block) is also marked a space wider
      // for the line's end, and that mark must stay inside its box, not overlap the next word.
      one.textContent = `${textOf(span)?.data ?? ""} `
      return one
    })
    ruler.append(...each)
    document.body.append(ruler)
    setNatural(each.map((one) => one.getBoundingClientRect().width || 1))
    ruler.remove()
  }, [lines, width, height, layerRef])


  const onMouseDown = (event: React.MouseEvent): void => {
    const layer = layerRef.current
    const span = (event.target as Element).closest?.("[data-word]")
    const node = span && textOf(span)
    if (event.button !== 0 || !layer || !node) return
    // Picked by hand, as Preview picks: never the browser's own guess about where an invisible word ends.
    event.preventDefault()
    event.stopPropagation()
    const picked = getSelection()
    if (!picked) return
    if (event.detail === 2) return void picked.setBaseAndExtent(node, 0, node, end(node))
    if (event.detail >= 3) {
      const line = wordsIn(layer).filter((one) => one.dataset.line === (span as HTMLElement).dataset.line)
      const first = textOf(line[0])
      const last = textOf(line.at(-1)!)
      if (first && last) picked.setBaseAndExtent(first, 0, last, end(last))
      return
    }
    const at = spotAt(layer, event.clientX, event.clientY) ?? { node, offset: 0 }
    // ⇧-click carries on from where the picking began.
    if (event.shiftKey && picked.anchorNode instanceof Text && layer.contains(picked.anchorNode)) {
      from.current = { node: picked.anchorNode, offset: picked.anchorOffset }
      picked.setBaseAndExtent(from.current.node, from.current.offset, at.node, at.offset)
    } else {
      from.current = at
      picked.collapse(at.node, at.offset)
    }
    layer.dataset.picking = ""
    const move = (moved: MouseEvent): void => {
      const to = spotAt(layer, moved.clientX, moved.clientY)
      if (to && from.current) getSelection()?.setBaseAndExtent(from.current.node, from.current.offset, to.node, to.offset)
    }
    const up = (): void => {
      delete layer.dataset.picking
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  return (
    <div ref={layerRef} className="mf-look-text" data-kept={kept ? "" : undefined} style={{ transform, transition }} onMouseDown={onMouseDown} onClick={(event) => event.stopPropagation()}>
      {lines.flatMap((line, n) => {
        const before = starts[n]
        return line.words.map((word, i) => {
          const next = line.words[i + 1]
          // A word carries the space after it, stretched to where the next word starts, so a picked line
          // has no gaps and no overlaps; a line's last word its line break, so the browser's own copy and
          // Look Up read lines as lines.
          const seen = next ? `${word.text} ` : word.text
          const boxWidth = Math.max(1, (next ? next.x - word.x : word.w) * width)
          const tall = Math.max(1, word.h * height)
          const size = tall * 0.86
          return (
            <span
              key={`${n}-${i}`}
              data-word=""
              data-line={n}
              style={{
                left: word.x * width,
                top: word.y * height,
                height: tall,
                lineHeight: `${tall}px`,
                fontSize: size,
                transform: natural ? `scaleX(${boxWidth / natural[before + i]})` : undefined,
              }}
            >
              {seen}
              {!next && <br />}
            </span>
          )
        })
      })}
    </div>
  )
}
