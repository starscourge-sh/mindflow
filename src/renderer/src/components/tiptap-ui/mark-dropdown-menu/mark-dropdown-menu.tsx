import { forwardRef, useCallback, useEffect, useState } from "react"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import type { UseMarkDropdownMenuConfig } from "@/components/tiptap-ui/mark-dropdown-menu"
import {
  markLabels,
  useMarkDropdownMenu,
} from "@/components/tiptap-ui/mark-dropdown-menu"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

export interface MarkDropdownMenuProps
  extends Omit<ButtonProps, "type">, UseMarkDropdownMenuConfig {
  /**
   * Callback for when the dropdown opens or closes
   */
  onOpenChange?: (isOpen: boolean) => void
  /**
   * Whether the dropdown should use a modal
   */
  modal?: boolean
}

/**
 * Dropdown menu component for toggling text marks in a Tiptap editor.
 *
 * For custom dropdown implementations, use the `useMarkDropdownMenu` hook instead.
 */
export const MarkDropdownMenu = forwardRef<
  HTMLButtonElement,
  MarkDropdownMenuProps
>(
  (
    {
      editor: providedEditor,
      types,
      hideWhenUnavailable = false,
      onOpenChange,
      children,
      modal = true,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const [isOpen, setIsOpen] = useState<boolean>(false)
    const {
      isVisible,
      isActive,
      canToggle,
      types: markTypes,
      Icon,
    } = useMarkDropdownMenu({ editor, types, hideWhenUnavailable })

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!editor || !canToggle) return
        setIsOpen(open)
        onOpenChange?.(open)
        // One menu open at a time in the bar (see sub-menu.tsx).
        if (open) document.dispatchEvent(new CustomEvent("mf:menu", { detail: "marks" }))
      },
      [canToggle, editor, onOpenChange]
    )
    useEffect(() => {
      const other = (event: Event): void => void ((event as CustomEvent<string>).detail !== "marks" && setIsOpen(false))
      document.addEventListener("mf:menu", other)
      return () => document.removeEventListener("mf:menu", other)
    }, [])

    if (!isVisible) {
      return null
    }

    return (
      <DropdownMenu modal={modal} open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            data-active-state={isActive ? "on" : "off"}
            role="button"
            tabIndex={-1}
            disabled={!canToggle}
            data-disabled={!canToggle}
            aria-label="Format text"
            aria-pressed={isActive}
            tooltip="Format"
            {...buttonProps}
            ref={ref}
          >
            {children ? (
              children
            ) : (
              <>
                <Icon className="tiptap-button-icon" />
                <ChevronDownIcon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {markTypes.map((type) => (
              <DropdownMenuItem key={`mark-${type}`} asChild>
                <MarkButton
                  editor={editor}
                  type={type}
                  text={markLabels[type]}
                  showTooltip={false}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
)

MarkDropdownMenu.displayName = "MarkDropdownMenu"
