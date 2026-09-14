import type { Editor } from "@tiptap/react"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

// --- Items ---
import { slashItems } from "@/components/slash/slash-items"

/** The same conversions `/` offers, minus everything that inserts. */
const CONVERSIONS = slashItems.filter((item) => item.turnInto)

/**
 * Change what the current block is, after the fact.
 *
 * The list is the `/` menu's own conversions rather than a second copy, so the
 * two can never drift. Collapsing is the one people reach for retroactively:
 * `setDetails` wraps the selected blocks and leaves the caret in an empty
 * summary, so you write the section first and title it second.
 */
export function TurnIntoMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" showTooltip={false}>
          <span className="tiptap-button-text">Turn into</span>
          <ChevronDownIcon className="tiptap-button-dropdown-small" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="tiptap-block-menu">
        {/* `.tiptap-block-menu` is the panel; the scrolling happens in the list
            inside it, so without this wrapper the rows are simply clipped. */}
        <div className="tiptap-block-menu-list">
          {CONVERSIONS.map((item) => (
            <DropdownMenuItem key={item.title} asChild>
              <button type="button" onClick={() => item.run(editor, "")}>
                {item.icon}
                <span className="tiptap-slash-menu-title">{item.title}</span>
                {item.hint ? (
                  <span className="tiptap-slash-menu-hint">{item.hint}</span>
                ) : null}
              </button>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
