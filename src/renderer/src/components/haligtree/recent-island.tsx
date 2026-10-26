import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { call } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { FileText, Gem, Orbit } from '@/components/ui/icons'
import { Island } from './ui'

type Opened = { id: string; type: string; title: string; kind: string | null; private: number }
const TIER = { nugget: Gem, article: FileText, question: Orbit, goal: Flag } as const

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
            const Icon = one.type === 'capture' ? (CAPTURE_TYPES.find((kind) => kind.id === one.kind)?.icon ?? FileText) : (TIER[one.type as keyof typeof TIER] ?? FileText)
            return (
              <button key={one.id} type="button" data-recent-opened={one.id} onClick={() => (chime('open'), onOpen(one.type, one.id))}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-control text-foreground hover:bg-accent/60">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={`min-w-0 flex-1 truncate ${one.private ? 'private-text' : ''}`}>{one.title || 'Untitled'}</span>
              </button>
            )
          })}
        </div>
      </Island>
    </div>
  )
}
