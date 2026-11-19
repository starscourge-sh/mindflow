import {
  AlarmClock, AppWindow, PictureInPicture2, ArrowUpRight, BellOff, Archive, ArchiveRestore, BookPlus, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Ban, Bell, Braces, BookCopy, BookOpen, Bookmark, Brain, Calendar,
  CalendarClock, CalendarDays, CalendarPlus, CalendarX, Camera, CameraOff, ChartBar, CheckCheck, ChevronsDownUp, ChevronsUpDown, CircleCheck, CircleOff,
  CircleX, Clipboard, Clock, Folder, Columns2, Copy, CopyPlus, Dice5, DoorOpen, Dot, Download, GripVertical, Eraser, ExternalLink, Eye, EyeOff, FilePlus, FileText, Files, Flag,
  FolderCheck, FolderInput, FolderMinus, FolderPlus, Footprints, Gift, GraduationCap, Hash, History, Hourglass, House, Image, Images, Inbox, Keyboard, LayoutGrid,
  Library, Lightbulb, Link, List, ListChecks, ListStart, Lock, LockOpen, LogOut, Map as MapIcon, Maximize2, Merge, MessageCircleQuestion, MessageSquare, Minimize2, Monitor,
  MonitorUp, MoveRight, NotebookText, Palette, Languages, Scissors, Pause, Play, Scale, ScanText, PanelLeft, PanelRight, Pencil, Pin, PinOff, Plus, Quote, Repeat, RotateCcw, Search, Settings, Shapes, Shield,
  ShieldCheck, Smile, Snowflake, Sparkles, SquareCheck, SquareKanban, SquarePen, Star, StickyNote, Sun, Tag, Target, Timer, Trash2, Type, Undo2, Ungroup, Upload,
  PanelTop, PanelsTopLeft, Speech, ThumbsDown, ThumbsUp, Unlink, User, UserCheck, UserX, Video, Volume2, VolumeX, WandSparkles, Wrench, X, Zap, PenLine, SpellCheck, Mic, ArrowLeftRight, ClipboardPaste, SlidersHorizontal, Minus, Highlighter, Layers, Heart, StarOff, ArrowUpToLine, ArrowDownToLine, ToggleLeft, ToggleRight, FlipVertical2, GalleryVertical, File as FileIcon, Moon, ScrollText, Users, Magnet, Mountain, PaintBucket, Telescope, type LucideIcon
} from 'lucide-react'

/**
 * One icon for every line of a menu, app-wide: a right click on a row, a ⋯
 * menu, a group's menu. Each line is matched by its words, so the menus
 * themselves stay lists of words and the drawing follows the meaning. The
 * first rule that fits wins, so the narrow ones come before the broad.
 */
const RULES: [RegExp, LucideIcon][] = [
  // Writing help on picked words (writing-help.tsx), Apple Intelligence's on this Mac: the group, then each help.
  [/^writing help$/i, Sparkles],
  [/^fix it$/i, SpellCheck],
  [/^shorter$/i, Scissors],
  [/^friendlier$/i, Smile],
  [/^plainer$/i, Type],
  [/^in my words$/i, PenLine],
  [/^make it a card$/i, Layers],
  [/^pull the quote$/i, Quote],
  // Files: the pictures most like this one (picture-sight.ts).
  [/^more like this$/i, Images],
  // Lines found falling back to the dot (test/menu-icons.test.ts lists any new ones).
  // A link to a name two notes in the vault have (note-link.ts chooseNote): each note by its path, or neither.
  [/\.md$/i, FileText],
  [/^a new empty note instead$/i, FilePlus],
  // Home's goals (the strip's own menu, and ⌘K's “Goals on Home…”): which goals show there, by their day or by your choice.
  [/^choose what shows here/i, ListChecks],
  [/^the nearest (\S+ )?goals?$/i, CalendarClock],
  [/^only the goals i choose$/i, ListChecks],
  // The Calendar's panels, as lines of its ⋯ when the bar is narrow.
  [/^the small month and calendars$/i, PanelLeft],
  [/^upcoming$/i, PanelRight],
  // A row of columns in a note (block-menu.tsx): each column a card, or plain columns again.
  [/^show as cards$/i, LayoutGrid],
  [/^show as plain columns$/i, Columns2],
  // A table's row and column menus (table-menu.tsx): where the new one goes.
  [/^insert row above$/i, ArrowUpToLine],
  [/^insert row below$/i, ArrowDownToLine],
  [/^insert column left$/i, ArrowLeft],
  [/^insert column right$/i, ArrowRight],
  [/^merge or split cells$/i, LayoutGrid],
  // Two notes made one (a capture's “Where it goes”): the same mark its row in the details wears.
  [/^merge into/i, Merge],
  [/^clear (row|column) contents$/i, Eraser],
  // A person made a character of a work, or a character a real person again (avatar.tsx).
  [/^make a character of a work/i, BookOpen],
  [/^change the work/i, BookOpen],
  [/^make a real person$/i, User],
  [/^add as a character$/i, BookOpen],
  // A person marked as you, wearing your photo, or not you any more (avatar.tsx's markMe).
  [/^this is me$/i, UserCheck],
  [/^this is not me$/i, UserX],
  // Media: a file into a note, where it is used, and how to look at one.
  [/^put .*in a note/i, FilePlus],
  [/^used in$/i, Link],
  [/^show in media$/i, Image],
  [/^look at it$|^preview it$/i, Eye],
  [/^play it$/i, Play],
  [/^a book with no file yet/i, BookOpen],
  // The PDF reader's Pages menu: how pages are laid out, and how they look.
  // Review's hint from Apple Intelligence: a nudge, then a stronger one.
  [/^(give me a hint|a stronger hint)$/i, Lightbulb],
  [/^five cards from (this chapter|these pages)$/i, Sparkles],
  [/^continuous scroll/i, GalleryVertical],
  // A task in your Mac's Reminders.
  [/^add to reminders$/i, Bell],
  [/^take out of reminders$/i, BellOff],
  // The offers under a note (note-offers.tsx), named as their lines are.
  [/^you already wrote this/i, Copy],
  [/^join them$/i, Layers],
  [/^link it$/i, Link],
  [/^use this name$/i, Type],
  [/^(keep it as|add it to) the summary$/i, Sparkles],
  [/^single page$/i, FileIcon],
  [/^two pages$/i, BookOpen],
  [/^paper pages$/i, ScrollText],
  [/^white pages$/i, Sun],
  [/^dark pages$/i, Moon],
  // The PDF reader's View menu: the rail's other pages in grey.
  [/^only this page in colour$/i, Palette],
  [/^captures\b/i, Inbox],
  [/^no deck$/i, CircleOff],
  [/^a landscape sketch/i, Mountain],
  [/^its colou?r$/i, PaintBucket],
  [/^backdrop/i, Mountain],
  [/^snap to other shapes/i, Magnet],
  [/^keep the tool/i, Lock],
  [/^put it first/i, ArrowUpToLine],
  [/^stop putting it first/i, ArrowDownToLine],
  [/^record a voice note/i, Mic],
  // A meeting: both sides of a call, who said what.
  [/^(record (a call or lecture|this meeting)|recordings$|note this moment|stop and keep the recording)/i, Users],
  [/^delete the recording/i, Trash2],
  // A misheard word in a meeting line, fixed in place.
  [/^fix this line$/i, SpellCheck],
  [/^keep asking/i, Repeat],
  [/^missed$/i, CircleX],
  // A goal's own lines: a someday goal wears the telescope wherever it shows; given a day, the calendar with a plus; settled, opened again.
  [/^make it someday$/i, Telescope],
  [/^give it a day$/i, CalendarPlus],
  [/^open it again$/i, RotateCcw],
  [/^switch$/i, ArrowLeftRight],
  [/^collect what i copy/i, ClipboardPaste],
  [/^set it aside/i, Archive],
  [/^change the rule/i, SlidersHorizontal],
  [/^no length$/i, CircleOff],
  [/^the session$|^i have \d+ min/i, Timer],
  [/^make it a line/i, Minus],
  [/^keep the link/i, Link],
  [/^look up$/i, Search],
  [/^highlight$/i, Highlighter],
  [/^reopen what you closed/i, RotateCcw],
  // A read that failed, asked again (ui.tsx's notice, a tag's page).
  [/^try again$/i, RotateCcw],
  [/^decks$/i, Layers],
  [/^liked$/i, Heart],
  [/^make everything smaller/i, Minimize2],
  [/^tell it what to do/i, MessageSquare],
  [/^journal$/i, Sun],
  [/ style$/i, Palette],
  [/^turn .+ on$/i, ToggleRight],
  [/^turn .+ off$/i, ToggleLeft],
  [/^turn face up|^turn over/i, FlipVertical2],
  [/^bring (back|it|them)/i, Undo2],
  [/^make it a step/i, ListChecks],
  [/^mark it again|^name this day|^add another name/i, Flag],
  [/^take (the line|it) (out|off)/i, X],
  [/^mark mistakes/i, SpellCheck],
  [/^fit height/i, ArrowUpDown],
  // A small window's two switches: it grows with the words; it steps aside for the pointer.
  [/^auto-size/i, ArrowUpDown],
  [/^steps aside/i, ArrowUpRight],
  [/^keep on top/i, Layers],
  // A picture's quick look (Space), and its caption: the words under it.
  [/^look$/i, Eye],
  // A favourite tag: a star, struck through to take it out.
  [/^remove from favourites/i, StarOff],
  [/favourites/i, Star],
  // A link taken off its words: the words stay, so never the Bin's can.
  [/^remove link/i, Unlink],
  [/^go to the footnote/i, ArrowDownToLine],
  // A DOI made a citation; a work's details written in by hand.
  [/^make it a citation/i, Quote],
  [/^fill it in by hand/i, PenLine],
  // A file shown where it sits: the folder, never the eye of "Show".
  [/in finder$/i, Folder],
  [/^turn it into/i, WandSparkles],
  // Menu lines that once fell back to the dot while the lines beside them had a drawing.
  [/^pause$/i, Pause],
  [/^writing tools/i, PenLine],
  [/^how it reads/i, BookOpen],
  [/^try it for/i, Timer],
  [/^how long it takes/i, Hourglass],
  [/^hidden pages/i, EyeOff],
  [/^peek$|^details$/i, PanelRight],
  [/^window$/i, AppWindow],
  [/^keep it pinned/i, Pin],
  [/^choose another folder/i, FolderInput],
  [/word aim/i, Target],
  [/caption/i, Type],
  // A recording into words: someone speaking, never the cc of a video's captions.
  [/^transcribe/i, Speech],
  [/^play from start$|^play$/i, Play],
  [/^save a copy$/i, Download],
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
  [/^pin\b|^keep .*on screen/i, Pin],
  // The ways to open a thing, each its own drawing (11 Nov: "Open" and "Open in…" shared the arrow, a new tab and the
  // side shared the two columns): the line that holds them is the window and its parts, a new tab is a pane under
  // its tab strip, the side is the two columns, a new window is the window (below), "Read" the open book.
  [/^open in…$|^open in\.\.\.$/i, PanelsTopLeft],
  [/in a new tab/i, PanelTop],
  [/to the side|as split|^split|beside it|^add (left|right) split|pane to the (left|right)|^move to (the split|a new split)|^end the split|^open this split/i, Columns2],
  [/^separate|^ungroup/i, Ungroup],
  // Figma's ⌘G: notes gathered into a group in place, drawn as the stack a group starts with.
  [/^group (the picked|[0-9,]+ notes)/i, Layers],
  [/^decide/i, Scale],
  [/^queue$|^read next/i, ListStart],
  // The views of a note (the top of a note's "…"): each its own drawing.
  [/writing room/i, PenLine],
  [/^read$/i, BookOpen],
  [/^read it to me|^read aloud/i, Volume2],
  [/^stop reading/i, VolumeX],
  [/^proofread/i, SpellCheck],
  [/^close others|^close to the right/i, CircleX],
  [/^close without/i, X],
  // Any other close (a tab, a window): the same plain ✕.
  [/^close\b(?! the (day|week))/i, X],
  [/^even out/i, Columns2],
  [/^back$/i, ArrowLeft],
  [/^forward$/i, ArrowRight],
  [/^join .*call/i, Video],
  [/^see the original/i, ExternalLink],
  // A note in a small window of its own, apart from quick capture: the small window over the big one.
  [/small window/i, PictureInPicture2],
  [/new window|own window|in a window/i, AppWindow],
  // A page opened in the app's own reader is a book opened; the arrow out stays for leaving the app ("Open in the default app").
  [/^open at page|^open in the reader|^continue at p\./i, BookOpen],
  [/^open .*sandbox|sandbox/i, Shapes],
  [/^open|^go to|^show .*note|^read from here|^read the inbox|^write in it/i, ExternalLink],
  // Groups.
  // A group made a folder (the one place its notes live) wears the folder; a folder made a group, the group's stack.
  [/^make it a folder$/i, Folder],
  [/^make it a group$/i, Layers],
  // A new folder and a new page side by side in one menu (Writing's, a folder's) each wear their own sign.
  [/^new folder/i, FolderPlus],
  // Folders (side-folder-section.tsx, folder-view.tsx): kept in one, taken out, on or off the sidebar, archived, gone.
  [/^keep (\S+ )?in folder/i, FolderInput],
  [/^take out of /i, FolderMinus],
  [/^all folders/i, Folder],
  [/^show in the sidebar$/i, Star],
  [/^remove from the sidebar$/i, StarOff],
  [/^archive folder$/i, Archive],
  [/^unarchive folder$/i, ArchiveRestore],
  [/^delete folder, keep what/i, FolderMinus],
  [/^archive them$/i, Archive],
  // A group gathers by a tag and is no folder (it never opens): its own sign, never the folder's beside "New folder".
  [/^new group by a tag/i, Hash],
  [/^new page/i, FilePlus],
  [/^new group|^group with|new note in group/i, FolderPlus],
  [/remove from group|^out of its group/i, FolderMinus],
  [/^move (\d[\d,]* )?to writing/i, FileText],
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
  [/^copy text from (an )?image/i, ScanText],
  [/^text in it/i, ScanText],
  [/^make it a note/i, NotebookText],
  [/^find this in my notes/i, Search],
  [/^translate/i, Languages],
  [/^copy .*links?$|^copy link|all links/i, Link],
  [/^duplicate/i, CopyPlus],
  // The menu for the whole line a link or a word sits on: drawn as the grip that opens the same menu beside a line.
  [/^block$/i, GripVertical],
  [/^copy/i, Copy],
  // Names and looks.
  [/^rename|^give it a title|^edit|^add a page$|^change the question|^say who/i, Pencil],
  [/icon/i, Smile],
  [/^colou?r|theme|^paint/i, Palette],
  [/kind/i, Shapes],
  [/^tag|#|^add a tag/i, Hash],
  // Keeping and letting go.
  [/^unarchive|^restore/i, ArchiveRestore],
  [/^archive/i, Archive],
  // Letting a selection go removes nothing: a plain ✕, not the bin.
  [/^clear the selection/i, X],
  // Taken out of a folder, the queue or Read: out of that place only, nothing deleted.
  [/^remove from folder/i, FolderMinus],
  [/^remove from queue|^remove from note|^take out of/i, CircleOff],
  // A file kept in Files whether or not a note holds it.
  [/^keep in files/i, FolderCheck],
  [/^put (it|them) back|^bring it back|^changed my mind/i, Undo2],
  [/^remove/i, Trash2],
  [/^delete|^discard|^clear|^let (it )?go|^drop/i, Trash2],
  [/^take the step out/i, Eraser],
  [/^not private|not private|unlock|^show private|blur private titles again/i, LockOpen],
  // Hidden until a day is away for a time, not blurred: the telescope its "Hidden until" chip wears on a row and in
  // the task box, never the closed eye that means private.
  [/^hide until|^hidden until/i, Telescope],
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
  [/^abandon (the )?session|^give it up/i, CircleOff],
  [/^finish the session/i, CircleCheck],
  [/^name this/i, Pencil],
  [/^not done/i, RotateCcw],
  [/^mark as read/i, CheckCheck],
  [/^unmark/i, RotateCcw],
  [/task|^complete|^done|^mark (it )?done/i, SquareCheck],
  [/^save as a gem/i, Lightbulb],
  [/^resolve|^made it|^cross it off|answered/i, CircleCheck],
  [/^remind|^alarm/i, AlarmClock],
  [/^due|deadline|exam date/i, CalendarClock],
  [/today|tomorrow|this week|next week|^later|^someday|come back|^plan|^schedule|^snooze/i, CalendarDays],
  [/^add a date|date/i, CalendarPlus],
  [/repeat|routine/i, Repeat],
  [/timer|^start .*focus|^focus/i, Timer],
  [/^hold/i, Hourglass],
  [/^stop/i, CircleOff],
  // Learning and thinking.
  [/^learn spelling/i, BookPlus],
  // "Make them": the offer line's study questions (note-offers.tsx), drawn as the questions are.
  [/question|clue|^test me|^ask|^make them$/i, MessageCircleQuestion],
  [/^study|^review|tested/i, GraduationCap],
  [/thought|^comment/i, MessageSquare],
  [/idea|\bgems?\b/i, Lightbulb],
  [/^goal|^set a goal|^make it a goal/i, Target],
  [/^like$/i, ThumbsUp],
  [/^less of this/i, ThumbsDown],
  [/^play next|^go back to it/i, ListStart],
  [/^link this/i, Link],
  [/quote|who said/i, Quote],
  [/article|^read/i, BookOpen],
  // A sticky's own menu (main's popup-menu.ts): off the desktop, the desk's lines together, tidied back, laid flat.
  [/^take it down$/i, PinOff],
  [/^all stickies$/i, Layers],
  [/^put stickies back/i, Undo2],
  [/^fold every card/i, Minimize2],
  [/^keep open$/i, Pin],
  [/^open the cards it folded/i, Maximize2],
  [/card/i, StickyNote],
  [/sticky|desktop|^stick all/i, StickyNote],
  // Pages and places.
  // A book's colour is a colour first: the palette, as "Colour" and the themes wear.
  [/^book colou?r/i, Palette],
  [/^new book|^switch book|book/i, Library],
  [/^new capture|^new note|^new|^add/i, Plus],
  [/version|history/i, History],
  [/^import/i, Download],
  [/^download/i, Download],

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
