import { useEffect } from 'react'
import '@fontsource/opendyslexic/400.css'
import '@fontsource/opendyslexic/700.css'

// From their own files rather than the editor's index, which would pull the
// whole editor into everything that reads the settings.
import { setCues, type EditorCue } from '@/lib/cues'
import { setCalc } from '@/extensions/calc'
import { setFoldHeadings } from '@/extensions/heading-fold'
import { setTagSource } from '@/extensions/note-link'
import { chime, step, type Cue } from './sound'
import { APP_SIZES, appSizeOf, haligtree, type Settings } from './haligtree'

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
  fold: 'tuck',
  unfold: 'untuck',
  play: 'on',
  pause: 'off',
  'media-start': 'unshelve',
  'media-end': 'settled',
  'media-replay': 'rewind',
  'media-speed': 'step',
  'media-window': 'window',
  'media-window-close': 'fold'
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
    let tags: ReturnType<typeof haligtree.tags> | null = null
    let stale = false
    let at = 0
    const stop = window.api.captures.onChange(() => (stale = true))
    setTagSource(() => {
      if (!tags || (stale && Date.now() - at > 30_000)) {
        tags = haligtree.tags()
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
    setFoldHeadings(settings.foldHeadings !== false)
    const root = document.documentElement.style
    root.setProperty('--mf-font', familyOf(settings.noteFont))
    // The menus, lists and labels too, unless the font is for notes only.
    if (settings.fontNotesOnly) root.removeProperty('--mf-app-font')
    else root.setProperty('--mf-app-font', familyOf(settings.noteFont))
    // Headings, in notes and on the app's own pages, in theirs when one is chosen.
    if (!settings.headingFont || settings.headingFont === 'same') root.removeProperty('--mf-heading-font')
    else root.setProperty('--mf-heading-font', familyOf(settings.headingFont))
    root.setProperty('--mf-text-scale', String(settings.textSize))
  }, [settings?.calc, settings?.foldHeadings, settings?.noteFont, settings?.fontNotesOnly, settings?.headingFont, settings?.textSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘+ and ⌘− grow and shrink the whole app, in every window, and ⌘0 puts it
  // back; ⌥⌘+ and ⌥⌘− do the same for the words in notes alone. Taken before
  // Chromium's own page zoom, which is off (main) and never saved.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.ctrlKey || !settings || event.defaultPrevented) return
      // By the key's place, not its letter: with ⌥ held, = types ≠ and − types –.
      const way = event.code === 'Equal' || event.code === 'NumpadAdd' ? 1 : event.code === 'Minus' || event.code === 'NumpadSubtract' ? -1 : event.code === 'Digit0' || event.code === 'Numpad0' ? 0 : null
      if (way === null) return
      if (event.altKey) {
        // ⌥⌘0 is a math block in a note, so the text size has no reset key: Settings puts it back.
        if (way === 0) return
        event.preventDefault()
        return stepTextSize(settings, way)
      }
      // The drawing window keeps ⌘+ ⌘− ⌘0 for its own zoom.
      if (new URLSearchParams(window.location.search).has('drawing')) return
      event.preventDefault()
      stepAppSize(settings, way)
    }
    // The View menu's Bigger, Smaller and Actual Size, clicked rather than pressed (preload).
    const onMenu = (event: Event): void => void (settings && stepAppSize(settings, (event as CustomEvent<1 | -1 | 0>).detail))
    window.addEventListener('keydown', onKey)
    window.addEventListener('haligtree:app-size', onMenu)
    return () => (window.removeEventListener('keydown', onKey), window.removeEventListener('haligtree:app-size', onMenu))
  }, [settings])
}

/** The text size in notes a step bigger (1) or smaller (−1), as ⌥⌘+ and ⌥⌘− do. */
function stepTextSize(settings: Settings, way: 1 | -1): void {
  const now = asked('text', settings.textSize)
  const at = TEXT_SIZES.indexOf(TEXT_SIZES.reduce((near, size) => (Math.abs(size - now) < Math.abs(near - now) ? size : near)))
  const size = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, at + way))]
  if (size === now) return chime('nope')
  ask('text', size)
  step(TEXT_SIZES.indexOf(size))
  void haligtree.setSettings({ textSize: size })
  said(`Text size ${Math.round(size * 100)}%`)
}

/** The whole app a step bigger (1), smaller (−1) or back to 100% (0), as ⌘+, ⌘− and ⌘0 do, and the View menu. */
export function stepAppSize(settings: Settings, way: 1 | -1 | 0): void {
  const now = asked('app', appSizeOf(settings))
  const at = APP_SIZES.indexOf(APP_SIZES.reduce((near, size) => (Math.abs(size - now) < Math.abs(near - now) ? size : near)))
  const size = way === 0 ? 100 : APP_SIZES[Math.max(0, Math.min(APP_SIZES.length - 1, at + way))]
  if (size === now) return chime('nope')
  ask('app', size)
  step(APP_SIZES.indexOf(size) - APP_SIZES.indexOf(100))
  void haligtree.setSettings({ interfaceSize: size })
  said(`App size ${size}%`)
}

/**
 * The size last asked for, for a moment: keys pressed quickly arrive before
 * the save before them has come back, and each would step from the old size.
 */
const lastAsked: Record<'app' | 'text', { size: number; at: number } | null> = { app: null, text: null }
const asked = (which: 'app' | 'text', saved: number): number => {
  const last = lastAsked[which]
  return last && Date.now() - last.at < 1500 ? last.size : saved
}
const ask = (which: 'app' | 'text', size: number): void => void (lastAsked[which] = { size, at: Date.now() })

/** A short note of the new size, the app's own toast (said this way, as ui.tsx imports this file's neighbours). */
function said(text: string): void {
  window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text, tone: 'info' } }))
}
