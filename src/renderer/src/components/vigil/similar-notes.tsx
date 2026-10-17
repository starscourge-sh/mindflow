import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import LinkIcon from '@/components/ui/link-icon'
import { AliveIcon } from './alive-icon'
import { Island, Tip, toast } from './ui'
import { chime } from '@/lib/sound'

type Like = { type: string; id: string; title: string; kind: string; score: number }

/**
 * Notes like this one, found on this Mac from their words alone (similar.ts
 * in main; no AI service). Read again a moment after you stop typing. Click
 * one to link it: a link to it goes at the end of the note, as @ would put it.
 * A note already linked from here is not offered.
 */
export function SimilarNotes({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [like, setLike] = useState<Like[]>([])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let gone = false
    const load = (): void => void (window.api.vigil('similar', id) as Promise<Like[]>).then((list) => !gone && setLike(list))
    load()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = window.api.captures.onChange(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    return () => {
      gone = true
      clearTimeout(timer)
      stop()
    }
  }, [id])
  /** The note's own editor, in the same pane as this panel. */
  const editor = (): Editor | null => {
    const pane = box.current?.closest('[data-pane]') ?? document
    return (pane.querySelector('.ProseMirror') as (Element & { editor?: Editor }) | null)?.editor ?? null
  }
  const linked = (other: string): boolean => JSON.stringify(editor()?.getJSON() ?? {}).includes(`"id":"${other}"`)
  const shown = like.filter((one) => !linked(one.id))
  if (!shown.length) return null
  const link = (one: Like): void => {
    const ed = editor()
    if (!ed || ed.isDestroyed || !ed.isEditable) return void onOpen?.(one.type, one.id)
    ed.chain().focus('end').insertContent([{ type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: one.id, label: one.title, kind: one.kind } }] }]).run()
    chime('gather')
    toast(`Linked “${one.title}”`, () => void ed.commands.undo())
    setLike((list) => list.filter((other) => other.id !== one.id))
  }
  return (
    <div ref={box} data-similar>
      <Island compact title="Like this note">
        <div className="flex flex-col gap-px py-1">
          {shown.map((one) => (
            <div key={one.id} data-similar-row={one.id} className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent/60">
              <button type="button" onClick={() => onOpen?.(one.type, one.id)} className="min-w-0 flex-1 truncate text-left text-control text-foreground">{one.title || 'Untitled'}</button>
              <Tip label="Link it from this note">
                <button type="button" data-similar-link aria-label={`Link “${one.title}”`} onClick={() => link(one)}
                  className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-foreground hover:bg-accent">
                  <AliveIcon icon={LinkIcon} size={13} /> Link
                </button>
              </Tip>
            </div>
          ))}
        </div>
      </Island>
    </div>
  )
}
