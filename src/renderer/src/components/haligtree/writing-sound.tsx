import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { SCAPES, chime, scapeSample, scapeStart, scapeStop, type Scape } from '@/lib/sound'
import { useEditorDom } from '@/lib/editor-dom'

/**
 * Sound while you write on today's page or in the writing room: the chosen
 * soundscape builds over about a minute and a half once you start, and goes when
 * you leave, close the window, or stop for two minutes.
 */
export function useWritingSound(editor: Editor | null, on: boolean, room = false): void {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const kind = (settings?.writingSound ?? 'off') as Scape
  // Leaving the writing room hushes it by any way out, even back on today's page, where it comes again only with
  // the next words written (the user, 20 Nov 2026: "pressed escape, it's still playing").
  const inRoom = useRef(room)
  useEffect(() => {
    if (inRoom.current && !room) scapeStop(1)
    inRoom.current = room
  }, [room])
  // The editor's words once on the page: tiptap's view.dom throws before (lib/editor-dom.ts).
  const page = useEditorDom(editor ?? null)
  useEffect(() => {
    const dom = page
    if (!dom || !on || kind === 'off') return
    let idle = 0
    const rest = (): void => scapeStop(6)
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
      const writes = event.key.length === 1 || event.key === 'Enter'
      if (!writes && event.key !== 'Backspace' && event.key !== 'Delete') return
      scapeStart(kind)
      clearTimeout(idle)
      idle = window.setTimeout(rest, (window as unknown as { haligtreeScapeIdle?: number }).haligtreeScapeIdle ?? 120_000)
    }
    const away = (): void => void (document.visibilityState === 'hidden' && (clearTimeout(idle), scapeStop(1)))
    const gone = (): void => scapeStop(0.3)
    dom.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', away)
    window.addEventListener('pagehide', gone)
    return () => {
      clearTimeout(idle)
      scapeStop(2)
      dom.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', away)
      window.removeEventListener('pagehide', gone)
    }
  }, [page, editor, on, kind])
}

/** What the control says, as what it does: "No sound while writing", "Rain while writing". */
const soundWords = (kind: Scape): string => (kind === 'off' ? 'No sound while writing' : `${SCAPES.find((one) => one.id === kind)?.label ?? 'A sound'} while writing`)

/**
 * The quiet "No sound while writing" control, in the writing room's foot and the day's
 * writer's line: one small menu of soundscapes, each heard as
 * the pointer rests on it.
 */
export function WritingSound({ className = '' }: { className?: string }): React.JSX.Element {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const kind = (settings?.writingSound ?? 'off') as Scape
  const off = settings?.sounds === false
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && scapeStop(0.6)}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-writing-sound data-on={kind !== 'off' || undefined} className={`rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground data-[state=open]:text-foreground ${className}`}>{soundWords(kind)}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="z-[70] w-48" onCloseAutoFocus={(event) => event.preventDefault()}>
        {off && <DropdownMenuLabel className="font-normal text-muted-foreground">Sounds are off in Settings</DropdownMenuLabel>}
        <DropdownMenuLabel>While you write</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={kind} onValueChange={(to) => (chime('tap'), void haligtree.setSettings({ writingSound: to as Scape }))}>
          {SCAPES.map((one) => <DropdownMenuRadioItem key={one.id} value={one.id} data-scape-choice={one.id} onPointerEnter={() => scapeSample(one.id)}>{one.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
