import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import '@/components/mindflow/mindflow-editor.scss'
import './settings-contents.css'
import { cue } from '@/lib/cues'
import { glideTo } from './ui'

type Entry = { level: 1 | 2; text: string }

/** The groups on show and the settings in each, in order, as the page has drawn them. */
function read(page: HTMLElement): { entries: Entry[]; targets: HTMLElement[] } {
  const entries: Entry[] = []
  const targets: HTMLElement[] = []
  for (const group of page.querySelectorAll<HTMLElement>('section[data-group]')) {
    // A group a search emptied is still in the page, hidden.
    if (!group.checkVisibility()) continue
    entries.push({ level: 1, text: group.dataset.group! })
    targets.push(group)
    // Each key in Keys is a row too, but they are listed by their own search.
    for (const row of group.querySelectorAll<HTMLElement>('[data-setting-title]')) {
      if (!row.checkVisibility()) continue
      entries.push({ level: 2, text: row.dataset.settingTitle! })
      targets.push(row)
    }
  }
  return { entries, targets }
}

const same = (a: Entry[], b: Entry[]): boolean => a.length === b.length && a.every((one, i) => one.level === b[i].level && one.text === b[i].text)

/** Room the strip needs beside the column, folded, and open with its words. */
const FOLDED = 52
const OPEN_WIDE = 232

/**
 * The note editor's outline, for Settings: the groups on show and the
 * settings under each, the one in view lit as you scroll. With room beside
 * the column it is open, its words in the space there; with less it folds to
 * the editor's rules, which open on hover; with none it is out of sight. Tab
 * reaches it after the search (⇧⌘O too, at any width): arrows or j and k move,
 * Return goes there, Escape lets go. Going there glides (at once with Motion
 * off) and the setting lights up for a moment.
 */
export function SettingsContents({ page, scroller }: { page: HTMLElement | null; scroller: HTMLElement | null }): React.JSX.Element | null {
  const navRef = useRef<HTMLElement>(null)
  const targets = useRef<HTMLElement[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [active, setActive] = useState(-1)
  const [keyed, setKeyed] = useState<number | null>(null)
  // Where the column ends, and so how much room is left of the pane beside it.
  const [room, setRoom] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  // Gone to by a click: lit until the next scroll by hand, as the last rows
  // of a page can never reach the top to be lit by scrolling.
  const chosen = useRef<number | null>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // What is listed follows the page: a section, a search, a setting that
  // shows or goes as another changes.
  useEffect(() => {
    if (!page || !scroller) return
    let frame = 0
    const where = (): void => {
      if (chosen.current !== null) return setActive(chosen.current)
      const all = targets.current
      const top = scroller.getBoundingClientRect().top + 72
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 && scroller.scrollTop > 0
      let at = all.findLastIndex((one) => one.getBoundingClientRect().top <= top)
      // At the very end, the last setting that is in view at all.
      if (atEnd) at = Math.max(at, all.findLastIndex((one) => one.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom - 24))
      setActive(Math.max(0, at))
    }
    const scan = (): void => {
      frame = 0
      const found = read(page)
      targets.current = found.targets
      setEntries((now) => (same(now, found.entries) ? now : found.entries))
      const pane = scroller.parentElement!.getBoundingClientRect()
      const column = page.getBoundingClientRect()
      const end = column.right - parseFloat(getComputedStyle(page).paddingRight) - pane.left
      setRoom((now) => (Math.abs(now.left - end) < 1 && Math.abs(now.width - (pane.width - end)) < 1 ? now : { left: end, width: pane.width - end }))
      where()
    }
    const soon = (): void => void (frame ||= requestAnimationFrame(scan))
    const changes = new MutationObserver(soon)
    changes.observe(page, { childList: true, subtree: true, characterData: true })
    const sizes = new ResizeObserver(soon)
    sizes.observe(scroller)
    sizes.observe(page)
    let ticking = 0
    const onScroll = (): void => void (ticking ||= requestAnimationFrame(() => ((ticking = 0), where())))
    const byHand = (): void => void (chosen.current = null)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    scroller.addEventListener('wheel', byHand, { passive: true })
    scroller.addEventListener('pointerdown', byHand)
    scroller.addEventListener('keydown', byHand)
    scan()
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(ticking)
      changes.disconnect()
      sizes.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      scroller.removeEventListener('wheel', byHand)
      scroller.removeEventListener('pointerdown', byHand)
      scroller.removeEventListener('keydown', byHand)
    }
  }, [page, scroller])

  const lit = keyed ?? active
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lit])

  // ⇧⌘O in Settings, as in a note: the outline takes the keys.
  useEffect(() => {
    if (!scroller) return
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey && event.shiftKey && event.key.toLowerCase() === 'o') || !scroller.checkVisibility()) return
      if (!targets.current.length) return
      event.preventDefault()
      cue('outline')
      setKeyed(Math.max(0, active))
      requestAnimationFrame(() => navRef.current?.focus())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scroller, active])

  useLayoutEffect(() => {
    if (keyed !== null && document.activeElement !== navRef.current) navRef.current?.focus()
  }, [keyed])

  if (!scroller || entries.length < 2) return null
  const wide = room.width >= OPEN_WIDE
  const folded = !wide && room.width >= FOLDED
  if (!wide && !folded && keyed === null) return null

  const go = (index: number): void => {
    const target = targets.current[index]
    if (!target) return
    chosen.current = index
    setActive(index)
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16
    glideTo(scroller, Math.max(0, top))
    cue('heading')
    // The row says where you landed, for a moment.
    const row = entries[index].level === 1 ? target.querySelector<HTMLElement>('h2') ?? target : target
    row.removeAttribute('data-landed')
    void row.offsetWidth
    row.setAttribute('data-landed', '')
    row.addEventListener('animationend', () => row.removeAttribute('data-landed'), { once: true })
  }

  const leave = (): void => {
    setKeyed(null)
    cue('outline-close')
    navRef.current?.blur()
  }

  return (
    <nav
      ref={navRef}
      className="tiptap-toc mf-settings-toc"
      data-settings-contents
      data-wide={wide ? '' : undefined}
      data-open={keyed === null ? undefined : 'true'}
      style={wide ? { left: room.left + 20, maxWidth: Math.min(272, room.width - 36) } : undefined}
      tabIndex={0}
      aria-label="Settings on this page"
      aria-activedescendant={keyed === null ? undefined : `settings-toc-${keyed}`}
      onFocus={(event) => {
        if (event.target !== event.currentTarget || keyed !== null) return
        cue('outline')
        setKeyed(Math.max(0, active))
      }}
      onBlur={() => keyed !== null && setKeyed(null)}
      onKeyDown={(event) => {
        if (keyed === null) return
        const down = event.key === 'ArrowDown' || event.key === 'j'
        const up = event.key === 'ArrowUp' || event.key === 'k'
        // Spent here: the page's own j and k move between its controls.
        if (down || up || event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          event.stopPropagation()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : Math.min(entries.length - 1, Math.max(0, keyed + (down ? 1 : -1)))
          if (next !== keyed) cue('outline-step', next)
          setKeyed(next)
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          go(keyed)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          leave()
        }
      }}
    >
      {entries.map((entry, index) => (
        <button
          key={`${entry.level}:${entry.text}:${index}`}
          id={`settings-toc-${index}`}
          type="button"
          ref={index === lit ? activeRef : undefined}
          tabIndex={-1}
          className="tiptap-toc-item"
          data-level={entry.level}
          data-active={index === active ? 'true' : undefined}
          data-keyed={index === keyed ? 'true' : undefined}
          title={entry.text}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => go(index)}
        >
          <span className="tiptap-toc-rule" />
          <span className="tiptap-toc-text">{entry.text}</span>
        </button>
      ))}
    </nav>
  )
}
