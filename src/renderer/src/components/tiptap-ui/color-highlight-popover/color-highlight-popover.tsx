import { forwardRef, useMemo, useRef, useState } from "react"
import { type Editor } from "@tiptap/react"

// --- Hooks ---
import { useMenuNavigation } from "@/hooks/use-menu-navigation"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { BanIcon } from "@/components/tiptap-icons/ban-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/tiptap-ui-primitive/popover"
import { Island, POP_ISLANDS } from "@/components/haligtree/ui"
import { Swatch } from "@/components/haligtree/row-menu"

// --- Tiptap UI ---
import type {
  HighlightColor,
  UseColorHighlightConfig,
} from "@/components/tiptap-ui/color-highlight-button"
import {
  ColorHighlightButton,
  pickHighlightColorsByValue,
  useColorHighlight,
} from "@/components/tiptap-ui/color-highlight-button"

interface ColorHighlightPopoverContentProps {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Optional colors to use in the highlight popover.
   * If not provided, defaults to a predefined set of colors.
   */
  colors?: HighlightColor[]
  /**
   * When true, uses the actual color value (colorValue) instead of CSS variable (value).
   * @default false
   */
  useColorValue?: boolean
}

interface ColorHighlightPopoverProps
  extends
    Omit<ButtonProps, "type">,
    Pick<
      UseColorHighlightConfig,
      "editor" | "hideWhenUnavailable" | "onApplied"
    > {
  /**
   * Optional colors to use in the highlight popover.
   * If not provided, defaults to a predefined set of colors.
   */
  colors?: HighlightColor[]
  /**
   * When true, uses the actual color value (colorValue) instead of CSS variable (value).
   * @default false
   */
  useColorValue?: boolean
}

const ColorHighlightPopoverButton = forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({ className, children, ...props }, ref) => (
  <Button
    type="button"
    className={className}
    variant="ghost"
    data-appearance="default"
    role="button"
    tabIndex={-1}
    aria-label="Highlight text"
    tooltip="Highlight"
    ref={ref}
    {...props}
  >
    {children ?? <HighlighterIcon className="tiptap-button-icon" />}
  </Button>
))

ColorHighlightPopoverButton.displayName = "ColorHighlightPopoverButton"

/** The swatches both the popover and its content fall back to. */
const DEFAULT_COLORS = pickHighlightColorsByValue([
  "var(--tt-color-highlight-green)",
  "var(--tt-color-highlight-blue)",
  "var(--tt-color-highlight-red)",
  "var(--tt-color-highlight-purple)",
  "var(--tt-color-highlight-yellow)",
])

export function ColorHighlightPopoverContent({
  editor,
  colors = DEFAULT_COLORS,
  useColorValue = false,
}: ColorHighlightPopoverContentProps) {
  const { handleRemoveHighlight } = useColorHighlight({ editor })
  const containerRef = useRef<HTMLDivElement>(null)

  const menuItems = useMemo(
    () => [...colors, { label: "Remove highlight", value: "none" }],
    [colors]
  )

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    items: menuItems,
    orientation: "both",
    onSelect: (item) => {
      if (!containerRef.current) return false
      const highlightedElement = containerRef.current.querySelector(
        '[data-highlighted="true"]'
      ) as HTMLElement
      if (highlightedElement) highlightedElement.click()
      if (item.value === "none") handleRemoveHighlight()
      return true
    },
    autoSelectFirstItem: false,
  })

  // The islanded popover's anatomy (the marked-day popover, milestones.tsx): a small heading over an island holding the
  // colours as one line of squares, the one worn ticked, and "None" at its end to take a highlight off.
  const tile =
    "grid size-7! min-w-7! shrink-0 cursor-pointer place-items-center rounded-md! p-0!"
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="menu"
      aria-label="Highlight colors"
      className={`flex flex-col rounded-float border bg-popover p-3 text-control shadow-(--mf-panel-shadow) outline-none ${POP_ISLANDS}`}
    >
      <Island compact title="Highlight">
        <div role="group" aria-label="Its colour" className="flex flex-nowrap items-center gap-0.5 px-1.5 py-1">
          {colors.map((color, index) => {
            const value = useColorValue ? color.colorValue : color.value
            return (
              <ColorHighlightButton
                key={color.value}
                editor={editor}
                highlightColor={value}
                tooltip={color.label}
                aria-label={`${color.label} highlight color`}
                tabIndex={index === selectedIndex ? 0 : -1}
                data-highlighted={selectedIndex === index}
                useColorValue={useColorValue}
                className={tile}
              >
                <Swatch color={color.value} on={!!editor?.isActive("highlight", { color: value })} />
              </ColorHighlightButton>
            )
          })}
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          <Button
            onClick={handleRemoveHighlight}
            aria-label="Remove highlight"
            tooltip="Remove highlight"
            tabIndex={selectedIndex === colors.length ? 0 : -1}
            type="button"
            role="menuitem"
            variant="ghost"
            data-highlighted={selectedIndex === colors.length}
            className="h-7! cursor-pointer gap-1.5 rounded-md! px-2!"
          >
            <BanIcon className="size-3.5 shrink-0" />
            None
          </Button>
        </div>
      </Island>
    </div>
  )
}

export function ColorHighlightPopover({
  editor: providedEditor,
  colors = DEFAULT_COLORS,
  hideWhenUnavailable = false,
  useColorValue = false,
  onApplied,
  ...props
}: ColorHighlightPopoverProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = useState(false)
  const { isVisible, canColorHighlight, isActive, label, Icon } =
    useColorHighlight({
      editor,
      hideWhenUnavailable,
      onApplied,
    })

  if (!isVisible) return null

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <ColorHighlightPopoverButton
          disabled={!canColorHighlight}
          data-active-state={isActive ? "on" : "off"}
          data-disabled={!canColorHighlight}
          aria-pressed={isActive}
          aria-label={label}
          tooltip={label}
          {...props}
        >
          <Icon className="tiptap-button-icon" />
        </ColorHighlightPopoverButton>
      </PopoverTrigger>
      <PopoverContent aria-label="Highlight colors">
        <ColorHighlightPopoverContent
          editor={editor}
          colors={colors}
          useColorValue={useColorValue}
        />
      </PopoverContent>
    </Popover>
  )
}
