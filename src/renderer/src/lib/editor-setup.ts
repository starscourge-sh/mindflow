import { useEffect } from 'react'
import '@fontsource/opendyslexic/400.css'
import '@fontsource/opendyslexic/700.css'

// From their own files rather than the editor's index, which would pull the
// whole editor into everything that reads the settings.
import { setCues, type EditorCue } from '@/lib/cues'
import { setCalc } from '@/extensions/calc'
import { setTagSource } from '@/extensions/note-link'
import { chime, step, type Cue } from './sound'
import { vigil, type Settings } from './vigil'

/**
 * What the editor's moments sound like here. Stepping through matches or the
 * outline walks up the scale, so where you are can be heard.
 */
const CUES: Record<EditorCue, Cue | 'step'> = {
  find: 'search',
  'find-close': 'fold',
  'find-step': 'step',
  'find-miss': 'nope',
  replace: 'noted',
  'replace-all': 'resolve',
  outline: 'slide',
  'outline-close': 'fold',
  'outline-step': 'step',
  heading: 'page',
  math: 'settled',
  // The same as the box's source drawer, which is a sheet.
  source: 'slide',
  'source-close': 'fold',
  fold: 'fold',
  unfold: 'open',
  play: 'on',
  pause: 'off'
}

/** The fonts a note can be written in, besides any the Mac has. */
export const NOTE_FONTS: { id: string; label: string; family: string }[] = [
  { id: 'default', label: 'Fraunces', family: '"Fraunces Variable", Georgia, serif' },
  { id: 'system', label: 'System', family: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  { id: 'serif', label: 'New York', family: '"New York", ui-serif, Georgia, serif' },
  { id: 'mono', label: 'Monospace', family: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { id: 'comic', label: 'Comic Sans', family: '"Comic Sans MS", "Comic Sans", cursive' },
  { id: 'dyslexic', label: 'OpenDyslexic', family: '"OpenDyslexic", sans-serif' }
]

/** A font setting as CSS: one of ours, or a family the Mac has by that name. */
export const familyOf = (font: string): string =>
  NOTE_FONTS.find((one) => one.id === font)?.family ?? `"${font.replace(/"/g, '')}", system-ui, sans-serif`

/** The sizes ⌘+ and ⌘− step through. */
export const TEXT_SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6]

/** The Mac's own fonts, by family, where the system lets the page ask. */
export async function systemFonts(): Promise<string[]> {
  try {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    const fonts = (await query?.()) ?? []
    return [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/**
 * The editor's settings, applied for every editor in this window: its sounds,
 * math as you type, the font and the text size, and ⌘+ ⌘− ⌘0 to change it.
 */
export function useEditorSetup(settings: Settings | null): void {
  useEffect(() => setCues((cue, n) => (CUES[cue] === 'step' ? step(n ?? 0) : chime(CUES[cue] as Cue))), [])
  // The `#` menu offers the tags already in use here. Reading them scans every
  // note, so they are kept between openings and read again only once
  // something has changed, and not more than every half minute while you type.
  useEffect(() => {
    let tags: ReturnType<typeof vigil.tags> | null = null
    let stale = false
    let at = 0
    const stop = window.api.captures.onChange(() => (stale = true))
    setTagSource(() => {
      if (!tags || (stale && Date.now() - at > 30_000)) {
        tags = vigil.tags()
        stale = false
        at = Date.now()
      }
      return tags
    })
    return stop
  }, [])

  useEffect(() => {
    if (!settings) return
    setCalc(settings.calc)
    const root = document.documentElement.style
    root.setProperty('--mf-font', familyOf(settings.noteFont))
    // The menus, lists and labels too, unless the font is for notes only.
    if (settings.fontNotesOnly) root.removeProperty('--mf-app-font')
    else root.setProperty('--mf-app-font', familyOf(settings.noteFont))
    // Headings, in notes and on the app's own pages, in theirs when one is chosen.
    if (!settings.headingFont || settings.headingFont === 'same') root.removeProperty('--mf-heading-font')
    else root.setProperty('--mf-heading-font', familyOf(settings.headingFont))
    root.setProperty('--mf-text-scale', String(settings.textSize))
  }, [settings?.calc, settings?.noteFont, settings?.fontNotesOnly, settings?.headingFont, settings?.textSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘+ and ⌘− step the text size, ⌘0 puts it back. Taken before Chromium's
  // own page zoom, which would grow the whole window instead.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.ctrlKey || event.altKey || !settings || event.defaultPrevented) return
      // Only where a note is on screen: the drawing window and the like keep
      // ⌘+ ⌘− for their own zoom.
      if (!document.querySelector('.mindflow-editor-wrapper')) return
      const at = TEXT_SIZES.indexOf(TEXT_SIZES.reduce((near, size) => (Math.abs(size - settings.textSize) < Math.abs(near - settings.textSize) ? size : near)))
      const to = ['=', '+'].includes(event.key) ? at + 1 : event.key === '-' ? at - 1 : event.key === '0' ? TEXT_SIZES.indexOf(1) : null
      if (to === null) return
      event.preventDefault()
      const size = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, to))]
      if (size === settings.textSize) return chime('nope')
      step(TEXT_SIZES.indexOf(size))
      void vigil.setSettings({ textSize: size })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings])
}
