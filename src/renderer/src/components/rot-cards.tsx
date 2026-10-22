import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useReading } from '@/lib/reads-in'
import type { JSONContent } from '@tiptap/core'

import { wordsOf } from '../../../main/import'
import { unloaded, useLive, haligtree } from '@/lib/haligtree'
import { BOX_PINS, Pins } from './pins'

/** A body's words, whether it arrived as Markdown or as the editor's JSON. */
export const textOf = (body: unknown): string => {
  // Markdown read as words: no list markers, links as their words, no marks.
  if (typeof body === 'string')
    return body
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, '$1')
      .replace(/\*\*|__|`|==|~~/g, '')
  // Blocks on their own lines; inside one, its words as written, emoji and all.
  const walk = (node: JSONContent): string =>
    node.content?.some((child) => child.text !== undefined || child.type === 'emoji') ? wordsOf(node) : node.text ?? (node.content ?? []).map(walk).join('\n')
  return body ? walk(body as JSONContent) : ''
}

/**
 * What a card says: its words, once. The stored title is only shown over a
 * bare address, as a bookmark's page name, or when there are no words at all;
 * for anything else it is a cleaned copy of the first line, said twice.
 */
export const shown = (title: string, body: unknown): string => {
  const text = textOf(body).trim()
  return /^https?:\/\/\S+$/.test(text) && title && title !== text ? `${title}\n${text}` : text || title
}

// About how tall a pinned row is, for deciding before anything is drawn.
const PIN_ROW = 32
// The Inbox's heading, its kinds and three rows: what the list keeps first.
const LIST = 236

/**
 * What waits above the Inbox in quick capture's side panel: pinned notes, and
 * nothing else (quick capture only catches: old captures to tidy and deciding
 * day are lines at the top of the Inbox page). They keep to about 45% of the
 * tab, so the Inbox under them always has rows to see: short on room, the pins
 * fold to one row of chips.
 */
export function Waiting({ onOpenAny }: { onOpenAny: (type: string, id: string) => void }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState(0)
  useLayoutEffect(() => {
    const body = box.current?.parentElement
    if (!body) return
    const read = (): void => setTall(body.clientHeight)
    // Measured and redrawn before the frame is painted, so the Inbox under the pins never jumps.
    const watch = new ResizeObserver(() => flushSync(read))
    watch.observe(body)
    read()
    return () => watch.disconnect()
  }, [])
  const pinRead = useLive(haligtree.pins, [] as Awaited<ReturnType<typeof haligtree.pins>>)
  const pins = Math.min(BOX_PINS, pinRead.length)
  // The panel waits for the pins (lib/reads-in.tsx): they came in over the Inbox and pushed it down.
  useReading(unloaded(pinRead))
  // At most 45% of the tab, and never so much that the Inbox loses its third row.
  const budget = Math.round(Math.min(tall * 0.45, tall - LIST))
  // Listed in full while they fit; a row of chips once not.
  const compact = tall > 0 && pins > 0 && pins * PIN_ROW + 12 > budget
  return (
    <div ref={box} data-waiting-stack className="relative z-10 shrink-0 border-b border-border/70">
      <Pins onOpen={onOpenAny} compact={compact} />
    </div>
  )
}
