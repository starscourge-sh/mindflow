import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react"
import { ReactRenderer } from "@tiptap/react"
import { Emoji, type EmojiItem } from "@tiptap/extension-emoji"
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion"

/**
 * `:` emoji autocomplete.
 *
 * The extension already owns the trigger character and the insertion; what it
 * leaves to the app is which emoji to offer and how to draw the list.
 */

const MAX_RESULTS = 8

interface EmojiListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const EmojiList = forwardRef(function EmojiList(
  { items, command }: SuggestionProps<EmojiItem>,
  ref: ForwardedRef<EmojiListHandle>
) {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [items])

  const pick = (index: number) => {
    const item = items[index]
    if (item) command({ name: item.name })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        setSelected((current) => (current + items.length - 1) % items.length)
        return true
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % items.length)
        return true
      }
      // Tab completes; Shift+Tab steps back rather than being swallowed
      // by whatever handles it downstream.
      if (event.key === "Tab" && event.shiftKey) {
        setSelected((current) => (current + items.length - 1) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pick(selected)
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div className="tiptap-emoji-list">
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          title={`:${item.name}:`}
          className={index === selected ? "is-selected" : undefined}
          onMouseEnter={() => setSelected(index)}
          onClick={() => pick(index)}
        >
          {item.emoji}
        </button>
      ))}
    </div>
  )
})

export const EmojiSuggestion = Emoji.configure({
  enableEmoticons: true,
  suggestion: {
    items: ({ editor, query }) => {
      const term = query.toLowerCase()
      const { emojis, isSupported } = editor.storage.emoji
      return emojis
        .filter(
          (item: EmojiItem) =>
            isSupported(item) &&
            (item.shortcodes.some((code) => code.startsWith(term)) ||
              item.tags.some((tag) => tag.startsWith(term)))
        )
        .slice(0, MAX_RESULTS)
    },

    render: () => {
      let renderer: ReactRenderer<EmojiListHandle> | null = null

      /**
       * The list is appended to the body, so it has to be placed by hand.
       *
       * The z-index belongs on this wrapper: it is the positioned element, and
       * without it the toolbar's own stacking order paints over the list.
       */
      const place = (rect: DOMRect | null | undefined) => {
        if (!rect) return

        // React renders asynchronously, so measuring straight after appending
        // or updating reads a height of zero and the list never flips.
        requestAnimationFrame(() => {
          const element = renderer?.element as HTMLElement | undefined
          if (!element) return

          element.style.position = "fixed"
          element.style.zIndex = "50"

          const { offsetWidth: width, offsetHeight: height } = element
          const gap = 4
          const margin = 8

          // Flip above the caret when there is no room below it.
          const below = rect.bottom + gap
          element.style.top =
            below + height <= window.innerHeight - margin
              ? `${below}px`
              : `${Math.max(margin, rect.top - height - gap)}px`

          element.style.left = `${Math.max(
            margin,
            Math.min(rect.left, window.innerWidth - width - margin)
          )}px`
        })
      }

      const teardown = () => {
        window.removeEventListener("keydown", onEscape, true)
        renderer?.element.remove()
        renderer?.destroy()
        renderer = null
      }

      /**
       * Vim mode claims Escape before the suggestion plugin is offered it, so
       * the list would be left on screen. Capture phase runs before either.
       */
      const onEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") teardown()
      }

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(EmojiList, {
            props,
            editor: props.editor,
          })
          document.body.appendChild(renderer.element)
          window.addEventListener("keydown", onEscape, true)
          place(props.clientRect?.())
        },
        onUpdate: (props) => {
          renderer?.updateProps(props)
          place(props.clientRect?.())
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            teardown()
            return true
          }
          return renderer?.ref?.onKeyDown(props) ?? false
        },
        onExit: teardown,
      }
    },
  },
})

export default EmojiSuggestion
