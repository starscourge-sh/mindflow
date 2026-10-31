import { useEffect, useState } from 'react'
import { BookOpen, Flag } from 'lucide-react'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { call, shownName } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { FileText, Gem, Orbit } from '@/components/ui/icons'
import { Island } from './ui'
import { usePdfCover } from '@/components/pdf/pdf-cover'

export type Opened = { id: string; type: string; title: string; kind: string | null; private: number }
const TIER = { nugget: Gem, article: FileText, question: Orbit, goal: Flag } as const
/** A recently opened note's drawing: a capture's kind, or its tier's. */
export const openedIcon = (one: Opened): React.ComponentType<{ className?: string; style?: React.CSSProperties }> =>
  one.type === 'capture' ? (CAPTURE_TYPES.find((kind) => kind.id === one.kind)?.icon ?? FileText) : (TIER[one.type as keyof typeof TIER] ?? FileText)

/** A PDF's own cover, small, in place of an icon: the drawing until the cover is ready. */
function PdfCoverIcon({ one, className }: { one: Opened; className?: string }): React.JSX.Element {
  const at = one.id.indexOf('|')
  const cover = usePdfCover(at < 0 ? one.id : one.id.slice(0, at), at < 0 ? '' : one.id.slice(at + 1))
  if (!cover) return <FileText className={className} />
  // A page stands upright: three wide to four tall, in the icon's square.
  return (
    <span className={`${className ?? ''} flex items-center justify-center`}>
      <img src={cover.image} alt="" draggable={false} className="h-full w-3/4 rounded-[2px] object-cover object-top shadow-[0_0_0_1px_var(--tt-border-color)]" />
    </span>
  )
}

/** What a recently opened row shows before its name: a PDF's cover, else its kind's drawing. */
export function OpenedIcon({ one, className }: { one: Opened; className?: string }): React.JSX.Element {
  if (one.type === 'pdf') return <PdfCoverIcon one={one} className={className} />
  if (one.type === 'web') return <BookOpen className={className} />
  const Icon = openedIcon(one)
  return <Icon className={className} />
}

/**
 * "Recent", the last of a note's details: the few notes you opened most lately, this one left out, each a click
 * away, so going back to what you were just working in never needs the list or search. The whole stretch is the
 * history panel's; this is only the last handful.
 */
export function RecentIsland({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [list, setList] = useState<Opened[]>([])
  useEffect(() => {
    let gone = false
    void call<Opened[]>('home:recent-opened', 7).then((found) => !gone && setList(found))
    return () => void (gone = true)
  }, [id])
  const shown = list.filter((one) => one.id !== id).slice(0, 6)
  if (!shown.length || !onOpen) return null
  return (
    <div data-recent-island>
      <Island compact title="Recent">
        <div className="flex flex-col gap-px py-1">
          {shown.map((one) => {
            return (
              <button key={one.id} type="button" data-recent-opened={one.id} onClick={() => (chime('open'), onOpen(one.type, one.id))}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-control text-foreground hover:bg-accent/60">
                <OpenedIcon one={one} className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={`min-w-0 flex-1 truncate ${one.private ? 'private-text' : ''}`}>{shownName(one.title || '') || 'Untitled'}</span>
              </button>
            )
          })}
        </div>
      </Island>
    </div>
  )
}
