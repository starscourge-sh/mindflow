import * as React from "react"
import { createPortal } from "react-dom"
import { FLOAT } from '@/lib/float'
import { quietClose } from "@/lib/quiet-focus"
import { cn } from "@/lib/cn"
import { openCue } from "@/lib/sound"
import { blinkThen } from "./menu-blink"
import { byKeys, markKeyed } from "@/lib/motion"
import { Highlight, makeLight, spotOf } from "@/components/haligtree/glide"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { notTheOpeningRelease, onlyRealMoves } from "@/lib/real-move"
import { withMenuIcon } from "./menu-icon"
import { ChevronRight as ChevronRightIcon } from '@/components/ui/icons'

/** A menu row never shows a tip (one hover, one surface): its extra words go in the row or in its preview card. */
type NoTip<P> = Omit<P, 'title'> & { title?: never }

/** Clear of the window's edges, and of the title bar at the top, where the window's own buttons sit. */
const MENU_ROOM = { top: 52, right: 12, bottom: 12, left: 12 }

/**
 * A menu open is modal as before (the page behind takes no hover, press or scroll, and a press outside only closes the
 * menu), but by a clear sheet under the menu, not by Radix's own way: that sets the body's pointer-events and a
 * scroll-lock style on the body, and a change to the body's style restyles every element in the window, on opening and
 * again on closing. Over a long page in the reader (a Fandom article, 30,000 elements) each took over two seconds.
 */
// Under its own menu always (the menus are z-[51]): at the same z-50, a menu still mounted when it opened again (the
// PDF reader's, opened twice in a row) was drawn under the new shield, which then took every hover and press meant for it.
export function MenuShield({ open }: { open: boolean }): React.JSX.Element | null {
  return open ? createPortal(<div data-menu-shield aria-hidden className="pointer-events-auto fixed inset-0 z-50" onContextMenu={(event) => event.preventDefault()} />, document.body) : null
}

/** A menu's open state, kept here for its shield whether the menu's owner holds it or Radix does. */
export function useShieldedOpen(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }): [boolean, (open: boolean) => void] {
  const [own, setOwn] = React.useState(props.defaultOpen ?? false)
  const { onOpenChange } = props
  return [props.open ?? own, React.useCallback((open: boolean) => (setOwn(open), onOpenChange?.(open)), [onOpenChange])]
}

function ContextMenu({
  modal = true,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const [open, onOpenChange] = useShieldedOpen(props)
  return (
    <ContextMenuPrimitive.Root data-slot="context-menu" {...props} modal={false} onOpenChange={onOpenChange}>
      {modal && <MenuShield open={open} />}
      {children}
    </ContextMenuPrimitive.Root>
  )
}

function ContextMenuTrigger({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

// It grows in from where it was opened in 80ms and fades going away quicker
// still: a menu is used all day, so it never makes you wait.
function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={openCue}
        data-slot="context-menu-content"
        // Kept clear of the window's edges (sliding off its opening point if it must, so it never
        // covers the window's own buttons), never touching them, and never
        // taller than the room it has: only a menu that cannot fit scrolls.
        collisionPadding={MENU_ROOM}
        sticky="always"
        className={cn("z-[51] flex max-h-(--radix-context-menu-content-available-height) min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-float", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
        {...props}
        onCloseAutoFocus={quietClose(props.onCloseAutoFocus)}
      >
        <MenuScroll>{children}</MenuScroll>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

/**
 * The rows scroll inside the panel, not the panel itself, so the fade that
 * says there is more (mf-more) dims the rows while the panel's edge and
 * shadow stay whole. The scroll padding keeps a row reached by the arrows
 * clear of that fade.
 *
 * The rows share one light, which glides to the row the pointer or the
 * arrows reach (an arrow moves it at once, as keys do everywhere). Between
 * rows, over a divider or the padding, the nearest row stays lit and a click
 * there picks it: what is lit is what a click lands on.
 */
/** The row a menu has picked: a ticked choice, or the one that is open now (a book, a place). */
export const PICKED_ROW = '[role="menuitemradio"][data-state="checked"], [role="menuitem"][aria-current]:not([aria-current="false"])'

export function MenuScroll({ children }: { children: React.ReactNode }): React.JSX.Element {
  const box = React.useRef<HTMLDivElement>(null)
  // The light is moved by the menu's own events (glide.tsx makeLight): no row crossed draws the menu again.
  const [light] = React.useState(makeLight)
  const litRow = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const rowOf = (node: EventTarget | null): HTMLElement | null => (node instanceof Element ? node.closest<HTMLElement>('[role^="menuitem"]') : null)
    // A submenu open from here keeps its row lit, wherever the pointer goes on its way there.
    const held = (): boolean => !!el.querySelector('[role^="menuitem"][data-state="open"]')
    const show = (row: HTMLElement, snap: boolean): void => {
      litRow.current = row
      // A row that shows it is lit by itself (a book on the shelf turns out to you) has no light drawn behind it.
      if (row.closest("[data-unlit]")) return light.to(null, true)
      light.to(spotOf(row, el), snap, row.dataset.variant === "destructive")
    }
    const focused = (event: FocusEvent): void => {
      const row = rowOf(event.target)
      if (row && el.contains(row)) show(row, byKeys())
    }
    const moved = (event: PointerEvent): void => {
      if (rowOf(event.target) || held() || !el.contains(event.target as Node)) return
      const at = el.getBoundingClientRect()
      const y = event.clientY - at.top + el.scrollTop
      let nearest: HTMLElement | null = null
      let best = Infinity
      for (const row of el.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([data-disabled])')) {
        const spot = spotOf(row, el)
        const far = Math.abs(y - (spot.top + spot.height / 2))
        if (far < best) (best = far), (nearest = row)
      }
      // Focused, the menu itself lights it: Enter then picks the row that is lit.
      if (nearest && document.activeElement !== nearest) nearest.focus()
    }
    const left = (): void => {
      if (held()) return
      litRow.current = null
      light.to(null, false)
    }
    const clicked = (event: MouseEvent): void => {
      const row = litRow.current
      if (row && !rowOf(event.target) && el.contains(event.target as Node) && row.isConnected) row.click()
    }
    el.addEventListener("focusin", focused)
    el.addEventListener("pointermove", moved)
    el.addEventListener("pointerleave", left)
    el.addEventListener("click", clicked)
    return () => {
      el.removeEventListener("focusin", focused)
      el.removeEventListener("pointermove", moved)
      el.removeEventListener("pointerleave", left)
      el.removeEventListener("click", clicked)
    }
  }, [light])
  // It opens with what is picked in view, in the middle, as a Mac's pop-up menu does: a long list (the Mac's fonts)
  // opened at its top with the picked one far below. Again as rows arrive (a list read once the menu is open) or the
  // panel takes its height, until the person scrolls it.
  const placed = React.useRef(false)
  const toPicked = React.useCallback((): void => {
    const el = box.current
    const picked = el?.querySelector<HTMLElement>(PICKED_ROW)
    if (!el || !picked || placed.current) return
    const spot = spotOf(picked, el)
    if (el.scrollHeight <= el.clientHeight) return
    el.scrollTop = spot.top - (el.clientHeight - spot.height) / 2
  }, [])
  React.useLayoutEffect(toPicked)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const sized = new ResizeObserver(toPicked)
    sized.observe(el)
    const mine = (): void => void (placed.current = true)
    // Opened by the keys, it starts on the picked one, lit, as a Mac's pop-up menu does, and the arrows go on from
    // there: the menu's own first focus (its first row) is moved there once. By the pointer nothing is lit.
    let first = true
    const entered = (event: FocusEvent): void => {
      if (!first) return
      first = false
      const picked = el.querySelector<HTMLElement>(PICKED_ROW)
      if (picked && byKeys() && event.target !== picked && (event.target as Element | null)?.closest?.('[role^="menuitem"]')) picked.focus({ preventScroll: true })
    }
    el.addEventListener("focusin", entered)
    el.addEventListener("wheel", mine, { passive: true })
    el.addEventListener("keydown", mine)
    return () => (sized.disconnect(), el.removeEventListener("focusin", entered), el.removeEventListener("wheel", mine), el.removeEventListener("keydown", mine))
  }, [toPicked])
  return (
    <div ref={box} data-menu-scroll className="mf-more relative isolate min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-1">
      <Highlight light={light} className="rounded-sm bg-accent data-[danger]:bg-destructive/10 dark:data-[danger]:bg-destructive/20" />
      {children}
    </div>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  children,
  ...props
}: NoTip<React.ComponentProps<typeof ContextMenuPrimitive.Item>> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      onSelect={blinkThen(onSelect)}
      className={cn(
        "group/context-menu-item relative flex min-h-7 whitespace-nowrap cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
      onPointerUp={notTheOpeningRelease(props.onPointerUp)}
    >
      {props.asChild ? children : withMenuIcon(children)}
    </ContextMenuPrimitive.Item>
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: NoTip<React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 whitespace-nowrap text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {withMenuIcon(children)}
      <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  // In a portal, so the menu's own clipping never cuts it off.
  return (
    <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      ref={markKeyed}
      collisionPadding={MENU_ROOM}
      sticky="always"
      data-slot="context-menu-sub-content"
      className={cn("z-[51] flex max-h-(--radix-context-menu-content-available-height) min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-float", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
      {...props}
    >
      <MenuScroll>{children}</MenuScroll>
    </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-xs text-muted-foreground data-inset:pl-7.5",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto shrink-0 pl-3 whitespace-nowrap text-key tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
}
