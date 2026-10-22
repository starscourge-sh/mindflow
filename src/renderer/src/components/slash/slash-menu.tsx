import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from "react"
import { exitSuggestion, type SuggestionProps } from "@tiptap/suggestion"

import { Kbd } from "@/components/vigil/ui"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import type { SlashItem } from "@/extensions/slash-command"
import { listDirection, step } from "@/lib/menu-keys"
import { realMove } from "@/lib/real-move"
import { SlashPeek } from "./slash-peek"

/** How long the menu stays open, untouched, before the chosen block's preview shows. */
const REST = 450

const SlashList = forwardRef(function SlashList(
  { items, command, query, editor, range }: SuggestionProps<SlashItem>,
  ref: ForwardedRef<SuggestionListHandle>
) {
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState<SlashItem | null>(null)
  const [value, setValue] = useState("")
  // The preview beside the menu: up once the pointer or the arrows move
  // through it, or once it has been open a moment. Fades in only the first time.
  const menuRef = useRef<HTMLDivElement>(null)
  const [peeking, setPeeking] = useState(false)
  const seen = useRef(false)
  useEffect(() => {
    const timer = setTimeout(() => setPeeking(true), REST)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => void (peeking && (seen.current = true)))

  useEffect(() => {
    setSelected(0)
  }, [items])

  // Arrowing past the fold has to bring the row with it.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selected])

  const choose = (index: number) => {
    const item = items[index]
    if (!item) return
    // Items that need a value swap the list for an input first.
    if (item.prompt) {
      setPending(item)
      setValue("")
      return
    }
    command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (pending || !items.length) return false

      const direction = listDirection(event)
      if (direction) {
        setSelected((current) => step(current, direction, items.length))
        setPeeking(true)
        return true
      }
      // ⌘↵ sends what is written, menu open or not: only a plain Return or Tab picks.
      if ((event.key === "Enter" && !event.metaKey && !event.ctrlKey) || event.key === "Tab") {
        choose(selected)
        return true
      }
      return false
    },
  }))

  if (pending) {
    return (
      <div className="tiptap-slash-menu">
        <input
          autoFocus
          type="text"
          placeholder={pending.prompt}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Escape goes back to the list rather than closing the menu, which
            // would tear out the element holding the focus.
            if (event.key === "Escape") {
              event.stopPropagation()
              setPending(null)
              return
            }
            if (event.key !== "Enter" || !value.trim()) return
            event.preventDefault()
            command({ ...pending, value: value.trim() })
          }}
        />
      </div>
    )
  }

  if (!items.length) return null

  let lastGroup: string | null = null

  return (
    <div className="tiptap-slash-menu" ref={menuRef}>
      {peeking && items[selected] ? (
        <SlashPeek title={items[selected].title} menuRef={menuRef} fresh={!seen.current} />
      ) : null}
      <div className="tiptap-slash-menu-list">
        {items.map((item, index) => {
          // Found by a search, best first: the groups no longer hold together.
          const header = !query && item.group !== lastGroup ? item.group : null
          lastGroup = item.group

          return (
            <Fragment key={item.title}>
              {header ? (
                <div className="tiptap-slash-menu-group">{header}</div>
              ) : null}
              <button
                type="button"
                ref={index === selected ? selectedRef : undefined}
                className={index === selected ? "is-selected" : undefined}
                onMouseMove={(event) => realMove(event) && (setSelected(index), setPeeking(true))}
                onClick={() => choose(index)}
              >
                {item.icon}
                <span className="tiptap-slash-menu-title">{item.title}</span>
                {item.hint ? (
                  <span className="tiptap-slash-menu-hint">{item.hint}</span>
                ) : null}
              </button>
            </Fragment>
          )
        })}
      </div>
      {/* As Notion ends its menu: the way out, always in sight under the list. */}
      <button type="button" className="tiptap-menu-close" data-close-menu onMouseDown={(event) => event.preventDefault()} onClick={() => {
        // As Escape does: a lone `/` goes with the menu.
        if (!query) editor.chain().focus().deleteRange(range).run()
        exitSuggestion(editor.view)
      }}>
        <span>Close menu</span>
        <Kbd>esc</Kbd>
      </button>
    </div>
  )
})

export const slashRenderer = createSuggestionRenderer(SlashList)
