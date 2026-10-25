/**
 * The app's name, wherever a person reads it: windows, menus, notices, help
 * and Settings. A rename is this line, plus productName and the .dmg's name
 * in electron-builder.yml. The data folder keeps its own fixed name
 * (realRoot in sandbox.ts), so a rename never moves your notes.
 */
export const APP_NAME = 'Haligtree'

/** The letter before a note's number, `H-30`: the app's first. Older notes' `V-30` and `MF-30` still find theirs. */
export const NOTE_KEY = APP_NAME[0].toUpperCase()

/** The tag on the "Learn the app" deck, named after the app so it never shows an old name. */
export const LEARN_TAG = `learn-${APP_NAME.toLowerCase()}`
