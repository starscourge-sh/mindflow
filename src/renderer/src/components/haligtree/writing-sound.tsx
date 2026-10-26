import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { SCAPES, VOICES, chime, keyVoice, scapeSample, scapeStart, scapeStop, type Scape, type Voice } from '@/lib/sound'

/**
 * Sound while you write on today's page or in the writing room: the chosen
 * soundscape comes in over about six seconds once you start, and goes when
 * you leave, close the window, or stop for two minutes; the chosen typing
 * voice sounds each key you write with (never deleting, never a shortcut).
 */
export function useWritingSound(editor: Editor | null, on: boolean): void {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const kind = (settings?.writingSound ?? 'off') as Scape
  const voice = (settings?.typingVoice ?? 'off') as Voice
  useEffect(() => {
    const dom = editor && !editor.isDestroyed ? editor.view.dom : null
    if (!dom || !on || (kind === 'off' && voice === 'off')) return
    let idle = 0
    const rest = (): void => scapeStop(6)
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
      const writes = event.key.length === 1 || event.key === 'Enter'
      if (!writes && event.key !== 'Backspace' && event.key !== 'Delete') return
      if (kind !== 'off') {
        scapeStart(kind)
        clearTimeout(idle)
        idle = window.setTimeout(rest, (window as unknown as { haligtreeScapeIdle?: number }).haligtreeScapeIdle ?? 120_000)
      }
      if (writes && !event.repeat) keyVoice(voice, event.key === 'Enter' ? 'enter' : event.key === ' ' ? 'space' : 'letter')
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
  }, [editor, on, kind, voice])
}

/** A few keys in a voice, so a choice is heard before it is made. */
export function voiceSample(voice: Voice): void {
  ;['letter', 'letter', 'space', 'letter', 'letter', 'enter'].forEach((key, i) => window.setTimeout(() => keyVoice(voice, key as 'letter'), i * 150 + Math.random() * 40))
}

/** What the control says: "Sound: Off", "Sound: Rain", "Sound: Rain, Deep key". */
export function soundWords(kind: Scape, voice: Voice): string {
  const said = [SCAPES, VOICES].map((list, i) => list.find((one) => one.id === (i ? voice : kind))).filter((one) => one && one.id !== 'off').map((one) => one!.label)
  return `Sound: ${said.join(', ') || 'Off'}`
}

/**
 * The quiet "Sound: Off" control, in the writing room's foot and the day's
 * writer's line: one small menu with the soundscape and the typing voice,
 * each heard as the pointer rests on it.
 */
export function WritingSound({ className = '' }: { className?: string }): React.JSX.Element {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const kind = (settings?.writingSound ?? 'off') as Scape
  const voice = (settings?.typingVoice ?? 'off') as Voice
  const off = settings?.sounds === false
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && scapeStop(0.6)}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-writing-sound data-on={kind !== 'off' || voice !== 'off' || undefined} className={`rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground data-[state=open]:text-foreground ${className}`}>{soundWords(kind, voice)}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="z-[70] w-48" onCloseAutoFocus={(event) => event.preventDefault()}>
        {off && <DropdownMenuLabel className="font-normal text-muted-foreground">Sounds are off in Settings</DropdownMenuLabel>}
        <DropdownMenuLabel>While you write</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={kind} onValueChange={(to) => (chime('tap'), void haligtree.setSettings({ writingSound: to as Scape }))}>
          {SCAPES.map((one) => <DropdownMenuRadioItem key={one.id} value={one.id} data-scape-choice={one.id} onPointerEnter={() => scapeSample(one.id)}>{one.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Keys</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={voice} onValueChange={(to) => (chime('tap'), void haligtree.setSettings({ typingVoice: to as Voice }))}>
          {VOICES.map((one) => <DropdownMenuRadioItem key={one.id} value={one.id} data-voice-choice={one.id} onPointerEnter={() => (scapeStop(0.6), voiceSample(one.id))}>{one.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
