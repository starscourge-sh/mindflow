import { forwardRef, useCallback, useState } from "react"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import type { UseTextAlignDropdownMenuConfig } from "@/components/tiptap-ui/text-align-dropdown-menu"
import { useTextAlignDropdownMenu } from "@/components/tiptap-ui/text-align-dropdown-menu"

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

export interface TextAlignDropdownMenuProps
  extends Omit<ButtonProps, "type">, UseTextAlignDropdownMenuConfig {
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
 * Dropdown menu component for setting text alignment in a Tiptap editor.
 *
 * For custom dropdown implementations, use the `useTextAlignDropdownMenu` hook instead.
 */
export const TextAlignDropdownMenu = forwardRef<
  HTMLButtonElement,
  TextAlignDropdownMenuProps
>(
  (
    {
      editor: providedEditor,
      aligns,
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
      canSet,
      aligns: alignTypes,
      labels,
      Icon,
    } = useTextAlignDropdownMenu({ editor, aligns, hideWhenUnavailable })

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!editor || !canSet) return
        setIsOpen(open)
        onOpenChange?.(open)
      },
      [canSet, editor, onOpenChange]
    )

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
            disabled={!canSet}
            data-disabled={!canSet}
            aria-label="Align text"
            aria-pressed={isActive}
            tooltip="Align"
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
            {alignTypes.map((align) => (
              <DropdownMenuItem key={`text-align-${align}`} asChild>
                <TextAlignButton
                  editor={editor}
                  align={align}
                  text={labels[align]}
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

TextAlignDropdownMenu.displayName = "TextAlignDropdownMenu"

export default TextAlignDropdownMenu
