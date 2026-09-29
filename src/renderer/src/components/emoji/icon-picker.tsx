import { useEffect, useMemo, useRef, useState } from "react"
import { emojis } from "@tiptap/extension-emoji"

import { BLOCK_COLORS, type BlockColor } from "@/extensions/block-color"
import { listDirection } from "@/lib/menu-keys"

type Emoji = (typeof emojis)[number] & { emoji: string }

/**
 * The list minus what has no business being an icon.
 *
 * The first twenty-six entries are the regional indicators - the letters flags
 * are built from - which draw as dashed boxes rather than as anything, and the
 * components are skin tones and hair colours, which are modifiers rather than
 * emoji. Some entries carry no glyph at all, only a fallback image, and those
 * drew as nothing.
 */
const USABLE = emojis.filter(
  (item): item is Emoji =>
    Boolean(item.emoji) &&
    item.group !== "components" &&
    !item.name.startsWith("regional_indicator_")
)

/**
 * The groups, in the order they are shown, under the names people read.
 *
 * The faces are the ones with no group of their own in the data, and they go
 * first: they are what anyone opening this is looking for.
 */
const GROUPS: Array<[label: string, group: string]> = [
  ["Smileys & People", ""],
  ["People & Body", "people & body"],
  ["Animals & Nature", "animals & nature"],
  ["Food & Drink", "food & drink"],
  ["Travel & Places", "travel & places"],
  ["Activities", "activities"],
  ["Objects", "objects"],
  ["Symbols", "symbols"],
  ["Flags", "flags"],
]

/** The groups again, each with its own emoji. Built once, not per mount. */
const SECTIONS = GROUPS.map(
  ([label, group]) => [label, USABLE.filter((item) => item.group === group)] as const
).filter(([, items]) => items.length)

/**
 * The same emoji as one list, and where each group starts in it.
 *
 * The keys walk one list whether the groups are showing or not, so every cell
 * needs its position in that list - and counting it up again on every render
 * is work that never changes.
 */
const ALL = SECTIONS.flatMap(([, items]) => items)
const STARTS = SECTIONS.map((_, group) =>
  SECTIONS.slice(0, group).reduce((sum, [, items]) => sum + items.length, 0)
)

/**
 * Draw it as a picture rather than as a letter.
 *
 * The older emoji - ☺, ✌, ❤ - predate emoji and default to text presentation,
 * so they come out as thin monochrome outlines beside the colourful ones. The
 * variation selector asks for the emoji form. Only for a single UTF-16 unit:
 * everything above the BMP is already a picture, and appending this to a
 * sequence would change what the sequence means.
 */
const drawn = (emoji: string): string => (emoji.length === 1 ? `${emoji}️` : emoji)

/** Kept in step with `grid-template-columns` on `.tiptap-icon-picker-grid`. */
const COLUMNS = 9

/**
 * Pick the icon and the colour of a callout.
 *
 * Emoji rather than an icon set: an emoji is text, so it needs no registry, no
 * sprite and nothing to resolve a name against - and the extension already
 * ships the list, tagged and grouped, for its `:` autocomplete.
 */
export function IconPicker({
  icon,
  color,
  className = "",
  onPick,
}: {
  icon: string
  /** Left out, the swatches are not offered: not everything takes a colour. */
  color?: BlockColor
  className?: string
  onPick: (change: { icon?: string; color?: BlockColor }) => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Searching flattens the groups: a heading over two results is noise, and
  // what was asked for is the answer, not where it files.
  const found = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return null
    return USABLE.filter(
      (item) =>
        item.name.includes(term) ||
        item.shortcodes.some((code) => code.includes(term)) ||
        item.tags.some((tag) => tag.includes(term))
    )
  }, [query])

  const visible = found ?? ALL

  // A new search is a new list, and the first result is the answer to it.
  useEffect(() => setActive(0), [visible])

  // Walking past the fold has to bring the row with it.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  const move = (by: number): void =>
    setActive((current) => Math.max(0, Math.min(visible.length - 1, current + by)))

  const cell = (item: Emoji, index: number): React.JSX.Element => (
    <button
      key={item.name}
      type="button"
      ref={index === active ? activeRef : undefined}
      data-selected={index === active ? "" : undefined}
      data-active={drawn(item.emoji) === icon ? "" : undefined}
      title={item.name.replace(/_/g, " ")}
      onMouseEnter={() => setActive(index)}
      onClick={() => onPick({ icon: drawn(item.emoji) })}
    >
      {drawn(item.emoji)}
    </button>
  )

  return (
    <div className={`tiptap-icon-picker ${className}`.trim()}>
      {color && (
      <div className="tiptap-icon-picker-colors">
        {BLOCK_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            data-color={swatch}
            data-active={swatch === color ? "" : undefined}
            title={swatch}
            onClick={() => onPick({ color: swatch })}
          />
        ))}
      </div>
      )}

      <input
        type="text"
        autoFocus
        placeholder="Search emoji…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const item = visible[active]
            if (!item) return
            event.preventDefault()
            onPick({ icon: drawn(item.emoji) })
            return
          }
          // A grid, so up and down are a row apart and the arrows along it are
          // one. The Ctrl chords every other menu here takes move by a row too.
          const direction = listDirection(event)
          if (direction) {
            event.preventDefault()
            move(direction === "down" ? COLUMNS : -COLUMNS)
            return
          }
          if (event.key === "ArrowRight") {
            event.preventDefault()
            move(1)
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            move(-1)
          }
        }}
      />

      <div className="tiptap-icon-picker-scroll">
        {found ? (
          <div className="tiptap-icon-picker-grid">{found.map(cell)}</div>
        ) : (
          SECTIONS.map(([label, items], group) => (
            <section key={label}>
              <h3>{label}</h3>
              <div className="tiptap-icon-picker-grid">
                {items.map((item, index) => cell(item, STARTS[group] + index))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
