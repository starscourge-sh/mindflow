import { Children, type ReactNode } from 'react'
import {
  AlarmClock, AppWindow, Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Ban, Bell, Braces, BookCopy, BookOpen, Bookmark, Brain, Calendar,
  CalendarClock, CalendarDays, CalendarPlus, CalendarX, Camera, CameraOff, ChartBar, CheckCheck, ChevronsDownUp, ChevronsUpDown, CircleCheck, CircleOff,
  CircleX, Clipboard, Clock, Columns2, Copy, CopyPlus, Dice5, DoorOpen, Dot, Download, Eraser, ExternalLink, Eye, EyeOff, FilePlus, FileText, Files, Flag,
  FolderInput, FolderMinus, FolderPlus, Footprints, Gift, GraduationCap, Hash, History, Hourglass, House, Image, Inbox, Keyboard, LayoutGrid,
  Library, Lightbulb, Link, List, ListChecks, ListStart, Lock, LockOpen, LogOut, Map as MapIcon, Maximize2, MessageCircleQuestion, MessageSquare, Minimize2, Monitor,
  MonitorUp, MoveRight, NotebookText, Palette, Scissors, Pause, Play, Scale, PanelLeft, PanelRight, Pencil, Pin, PinOff, Plus, Quote, Repeat, RotateCcw, Search, Settings, Shapes, Shield,
  ShieldCheck, Smile, Snowflake, Sparkles, SquareCheck, SquareKanban, SquarePen, Star, StickyNote, Sun, Tag, Target, Timer, Trash2, Type, Undo2, Ungroup, Upload,
  User, Volume2, VolumeX, WandSparkles, Wrench, X, Zap, type LucideIcon
} from 'lucide-react'

/**
 * One icon for every line of a menu, app-wide: a right click on a row, a ⋯
 * menu, a group's menu. Each line is matched by its words, so the menus
 * themselves stay lists of words and the drawing follows the meaning. The
 * first rule that fits wins, so the narrow ones come before the broad.
 */
const RULES: [RegExp, LucideIcon][] = [
  // Where notes come in from: each source by what it is, before any word in its name is read as an action.
  [/apple notes/i, NotebookText],
  [/obsidian|notion|\bvault\b/i, FolderInput],
  // Taking a date off is not deleting anything: a calendar crossed out, never the Bin's can.
  [/^clear the (date|due|deadline)/i, CalendarX],
  [/^reschedule/i, CalendarClock],
  // A goal chosen for Home, and the Bin from any menu, before "show" and "move" read them as something else.
  [/(on|off) home$/i, House],
  [/to the bin$/i, Trash2],
  [/(on|off) ice$/i, Snowflake],
  [/back into (a )?notes?$/i, Undo2],
  [/^show the session/i, Timer],
  // Pins and splits first: "Unpin" must not read as "Pin", nor "Open to the side" as "Open".
  [/^unpin|^pin off|^stop showing in quick capture/i, PinOff],
  [/in quick capture/i, Pin],
  [/^pin\b|^keep .*on screen|^pin the layout/i, Pin],
  [/to the side|as split|^split|beside it|^add (left|right) split|pane to the (left|right)/i, Columns2],
  [/^separate/i, Ungroup],
  [/^decide/i, Scale],
  [/^queue$|^read next/i, ListStart],
  [/close other panes/i, CircleX],
  [/^close (this )?pane|^close without/i, X],
  [/new window|own window|in a window/i, AppWindow],
  [/^open .*sandbox|sandbox/i, Shapes],
  [/^open|^go to|^show .*note|^read from here|^read the inbox|^write in it/i, ExternalLink],
  // Groups.
  [/^new group|^group with|new note in group/i, FolderPlus],
  [/remove from group/i, FolderMinus],
  [/^move to group|^move .*to (group|list)|^move to list/i, FolderInput],
  [/^move to top/i, ArrowUp],
  [/^move to bottom/i, ArrowDown],
  // A step in your own order: the way it goes.
  [/^move up$/i, ArrowUp],
  [/^move down$/i, ArrowDown],
  [/^move left$/i, ArrowLeft],
  [/^move right$/i, ArrowRight],
  [/^move|^send/i, MoveRight],
  // Copies.
  [/copy to book|into which book|another book/i, BookCopy],
  [/^copy .*links?$|^copy link|all links/i, Link],
  [/^duplicate/i, CopyPlus],
  [/^copy/i, Copy],
  // Names and looks.
  [/^rename|^edit|^change the question|^say who/i, Pencil],
  [/icon/i, Smile],
  [/^colou?r|theme|^paint/i, Palette],
  [/kind/i, Shapes],
  [/^tag|#|^add a tag/i, Hash],
  // Keeping and letting go.
  [/^unarchive|^restore/i, ArchiveRestore],
  [/^archive/i, Archive],
  // Letting a selection go removes nothing: a plain ✕, not the bin.
  [/^clear the selection/i, X],
  [/^delete|^discard|^clear|^let (it )?go|^drop/i, Trash2],
  [/^take the step out/i, Eraser],
  [/^not private|not private|unlock|^show private|blur private titles again/i, LockOpen],
  // Private blurs, so its drawing is the closed eye; the lock is Lock's own.
  [/^private: blurred|^private$|^make it private/i, EyeOff],
  [/^raw data|^show the source|^hide the source/i, Braces],
  [/word count/i, Type],
  [/private|^lock/i, Lock],
  [/^hide|out of view|^blur/i, EyeOff],
  [/^show|^keep .* in view|^reveal/i, Eye],
  // Tasks and time.
  // A running session's own lines, from a task's menu: before "task" and "done" catch them.
  [/^pause the session/i, Pause],
  [/^resume the session/i, Play],
  [/^end (session|it) early/i, CircleCheck],
  [/^abandon session/i, CircleOff],
  [/^not done/i, RotateCcw],
  [/task|^complete|^done|^mark (it )?done/i, SquareCheck],
  [/^save as a gem/i, Lightbulb],
  [/^resolve|^made it|answered/i, CircleCheck],
  [/^remind|^alarm/i, AlarmClock],
  [/^due|deadline|exam date/i, CalendarClock],
  [/today|tomorrow|this week|next week|^later|^someday|come back|^plan|^schedule|^snooze/i, CalendarDays],
  [/^add a date|date/i, CalendarPlus],
  [/repeat|routine/i, Repeat],
  [/timer|^start .*focus|^focus/i, Timer],
  [/^hold/i, Hourglass],
  [/^stop/i, CircleOff],
  // Learning and thinking.
  [/question|clue|^test me|^ask/i, MessageCircleQuestion],
  [/^study|^review|tested/i, GraduationCap],
  [/thought|^comment/i, MessageSquare],
  [/idea|\bgems?\b/i, Lightbulb],
  [/^goal/i, Target],
  [/quote|who said/i, Quote],
  [/article|^read/i, BookOpen],
  [/card/i, StickyNote],
  [/sticky|desktop/i, StickyNote],
  // Pages and places.
  [/^new book|^switch book|book/i, Library],
  [/^new capture|^new note|^new|^add/i, Plus],
  [/version|history/i, History],
  [/^import/i, Download],
  [/^export|^save its|^save/i, Upload],
  // Customize has a tool of its own, so it is never taken for Settings' gear.
  [/^customi[sz]e/i, Wrench],
  [/settings/i, Settings],
  [/keyboard|shortcut|vim/i, Keyboard],
  [/welcome/i, DoorOpen],
  [/celebrat|wrapped/i, Gift],
  [/^what .*haligtree|power/i, Sparkles],
  [/words|meaning/i, Type],
  [/safe mode/i, ShieldCheck],
  [/screen recording/i, CameraOff],
  [/camera/i, Camera],
  [/sound/i, Volume2],
  [/mute|silen/i, VolumeX],
  [/sidebar|side panel|^panel/i, PanelLeft],
  [/outline|properties|source/i, PanelRight],
  [/fill the screen|expand|bigger/i, Maximize2],
  [/compact|shrink/i, Minimize2],
  [/^board|board view|as a board/i, SquareKanban],
  [/page width|width/i, ChevronsUpDown],
  [/^fold|^collapse/i, ChevronsDownUp],
  [/^unfold|^expand/i, ChevronsUpDown],
  [/^search|^find/i, Search],
  [/^tidy|^sweep/i, WandSparkles],
  [/^two at random|random|shuffle/i, Dice5],
  [/sort|order/i, ArrowUpDown],
  [/^select|^unselect|^pick/i, CheckCheck],
  [/stat|recap/i, ChartBar],
  [/^map/i, MapIcon],
  [/^home/i, House],
  [/inbox/i, Inbox],
  [/grid|tiles/i, LayoutGrid],
  [/list/i, List],
  [/picture|image|photo/i, Image],
  [/file|markdown|page/i, FileText],
  [/year|month|week|day|calendar/i, Calendar],
  [/^undo/i, Undo2],
  [/^reset|^again|^redo/i, RotateCcw],
  [/notif|bell|nudge/i, Bell],
  [/morning|sun/i, Sun],
  [/^log|^track/i, ListChecks],
  [/person|people|someone/i, User],
  [/^star|favou?rite/i, Star],
  [/^bookmark/i, Bookmark],
  [/flag|important|priority|urgent/i, Flag],
  [/learn|struggl|memor/i, Brain],
  [/quick|^now|^do now/i, Zap],
  [/^leave|^quit|^back to my notes/i, LogOut],
  [/^cut$/i, Scissors],
  [/^paste|clipboard/i, Clipboard],
  [/^upload|^attach/i, FilePlus],
  [/^monitor|^present/i, Monitor],
  [/^share|^publish/i, MonitorUp],
  [/^shield|^guard/i, Shield],
  [/^write|^draft|^compose|^edit/i, SquarePen],
  [/^untitled|^note/i, FileText],
  [/^tags?\b/i, Tag],
  [/^come|^walk|^step/i, Footprints],
  [/^never|^off$/i, Ban],
  [/time|^when|^age/i, Clock],
  [/^files?|^attachments?/i, Files],
  [/^eras/i, Eraser]
]

/** The drawing for a menu line's words, or a quiet dot for words no rule knows yet. */
export function menuIcon(label: string): LucideIcon {
  const words = label.replace(/\s+/g, ' ').trim()
  return RULES.find(([rule]) => rule.test(words))?.[1] ?? Dot
}

/**
 * A menu line's children, its icon set in front: only when the line begins
 * with its words. A line that brings its own drawing (a theme's swatch, a
 * group's dot, an icon passed in) keeps it, and gets no second one.
 */
export function withMenuIcon(children: ReactNode): ReactNode {
  const parts = Children.toArray(children)
  let words = ''
  for (const part of parts) {
    if (typeof part !== 'string' && typeof part !== 'number') break
    words += String(part)
  }
  if (!words.trim()) return children
  const Icon = menuIcon(words)
  return [<Icon key="menu-icon" aria-hidden data-menu-icon="" className="size-3.5 shrink-0 text-muted-foreground" />, ...parts]
}
