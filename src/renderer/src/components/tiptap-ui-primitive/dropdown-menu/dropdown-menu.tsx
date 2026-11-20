import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/tiptap-utils"

import "@/components/tiptap-ui-primitive/dropdown-menu/dropdown-menu.scss"
import { openChime } from "@/lib/sound"
import { notTheOpeningRelease, onlyRealMoves } from "@/lib/real-move"
import { quietClose } from "@/lib/quiet-focus"
import { escOneLayer } from "@/lib/menu-keys"


function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return (
    <DropdownMenuPrimitive.Root data-slot="tiptap-dropdown-menu" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="tiptap-dropdown-menu-trigger"
      {...props}
    />
  )
}

/** The room a menu and its submenus keep from the window's edges: clear of the title bar's buttons, never touching a side. */
const ROOM = { top: 52, right: 10, bottom: 10, left: 10 }

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={openChime}
        collisionPadding={ROOM}
        data-slot="tiptap-dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn("tiptap-dropdown-menu-content", className)}
        {...props}
        // A line that asks for words ("Edit formula…") hands its field the keys as the menu goes, as the app's other menus do.
        onCloseAutoFocus={quietClose(props.onCloseAutoFocus ?? ((e) => e.preventDefault()))}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group
      data-slot="tiptap-dropdown-menu-group"
      className={cn("tiptap-dropdown-menu-group", className)}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="tiptap-dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn("tiptap-dropdown-menu-item", className)}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
      onPointerUp={notTheOpeningRelease(props.onPointerUp)}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return (
    <DropdownMenuPrimitive.Sub
      data-slot="tiptap-dropdown-menu-sub"
      {...props}
    />
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="tiptap-dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn("tiptap-dropdown-menu-sub-trigger", className)}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {children}
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  // Portalled for the same reason Content is: a submenu rendered inside its
  // parent panel is clipped by that panel's own `overflow`.
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        collisionPadding={ROOM}
        data-slot="tiptap-dropdown-menu-sub-content"
        onEscapeKeyDown={escOneLayer}
        className={cn("tiptap-dropdown-menu-sub-content", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
