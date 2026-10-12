import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Merge } from 'lucide-react'
import { chime } from '@/lib/sound'
import { captureKey } from '@/lib/capture-links'
import { vigil } from '@/lib/vigil'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useCaptures, type CaptureMeta } from '../capture-list'
import { Prop, refuse, toast } from './ui'
import { age } from '../../../../main/dates'

/**
 * Merge one capture into another, found by its words: type a few, see each
 * one's first line, pick it. Its number (V-12) still finds it, for anyone who
 * knows it; nobody has to. Undone, the other's words are as they were and this
 * one is back: never in both.
 */
export function MergeInto({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const all = useCaptures()
  const others = all.filter((one) => one.id !== capture.id && one.status !== 'discarded')
  const merge = (into: CaptureMeta): void => {
    setOpen(false)
    void vigil.mergeCapture(capture.id, into.number).then((merged) => {
      if (!merged) return refuse('That note is gone now, so nothing was merged')
      chime('resolve')
      toast(`Merged into “${into.label.length > 40 ? `${into.label.slice(0, 40)}…` : into.label || 'Untitled'}”`, () => void vigil.unmerge(capture.id, merged).then(() => chime('undo')))
    })
  }
  return (
    <>
      <Prop icon={Merge} onClick={() => (chime('open'), setOpen(true))}>Merge into another note…</Prop>
      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Merge into another note" className="w-[min(30rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
            <Command onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') setOpen(false)
            }}>
              <CommandInput autoFocus placeholder="Merge it into which note? Type a few of its words…" />
              <p className="px-3 pt-2 text-xs text-muted-foreground">Its words are added to the end of the one you pick, and this one goes to the Bin. Undo puts both back.</p>
              <CommandList>
                <CommandEmpty>No note has those words.</CommandEmpty>
                {others.map((one) => {
                  const type = CAPTURE_TYPES.find((kind) => kind.id === one.kind) ?? CAPTURE_TYPES[0]
                  return (
                    <CommandItem key={one.id} data-merge-pick value={`${one.label} ${captureKey(one.number)} ${one.id}`} onSelect={() => merge(one)}>
                      <type.icon style={{ color: type.tint }} />
                      <span className="private-text min-w-0 flex-1 truncate">{one.label || 'Untitled'}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{age(one.capturedAt)}</span>
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
