import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from "react"
import type { SuggestionProps } from "@tiptap/suggestion"

import {
  createSuggestionRenderer,
  type SuggestionListHandle,
} from "@/components/suggestion/suggestion-renderer"
import type { SlashItem } from "@/extensions/slash-command"

const SlashList = forwardRef(function SlashList(
  { items, command }: SuggestionProps<SlashItem>,
  ref: ForwardedRef<SuggestionListHandle>
) {
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState<SlashItem | null>(null)
  const [value, setValue] = useState("")

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
      if (event.key === "ArrowUp") {
        setSelected((current) => (current + items.length - 1) % items.length)
        return true
      }
      if (event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
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
    <div className="tiptap-slash-menu">
      <div className="tiptap-slash-menu-list">
        {items.map((item, index) => {
          const header = item.group !== lastGroup ? item.group : null
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
                onMouseEnter={() => setSelected(index)}
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
    </div>
  )
})

export const slashRenderer = createSuggestionRenderer(SlashList)
