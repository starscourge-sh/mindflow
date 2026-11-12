/**
 * When the database keeps a version of a note: the rule its `…_versions` triggers are made with (notes.ts), on its
 * own so a test can make the same trigger (test/version-rule.test.ts). No Electron in it.
 *
 * A version is the words as they were before a sitting's edits: kept by the database, so every way a body changes
 * is covered, and at most one every ten minutes, so autosave does not keep a copy per keystroke. Except when a
 * lot goes at once (under 60% of what it was, or a paragraph or more cut, a paste over the lot, say): that is kept
 * whatever the clock says, or the words written since the last version would be gone for good.
 *
 * "A lot" is counted in letters, as it always was, for a note under LETTERS_UNDER bytes as kept, where counting
 * costs nothing. Past that it is counted in bytes, which the database knows without reading the words: counted in
 * letters, every save of a 4 MB note read it through four times (9 ms of each keystroke's save). A cut of 40% of
 * such a note is tens of thousands of letters, far past the paragraph, in bytes as in letters; the two can only
 * differ there for a save that takes out more than 240 letters while putting in wider ones (emoji for plain
 * letters), which bytes count as smaller than it is.
 */
export const LETTERS_UNDER = 200_000

const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
const bytes = (words: string): string => `length(cast(${words} as blob))`
const lot = (size: (words: string) => string): string =>
  `coalesce(${size('new.body')}, 0) < ${size('old.body')} * 0.6 or ${size('old.body')} - coalesce(${size('new.body')}, 0) > 240`

/** The trigger's `when … begin … end;`, for the note or day page named by `key` (`old.id`, `'day:' || old.day`). */
export const versionRule = (key: string): string => `
      when old.body is not new.body and old.body is not null and old.body not in ('null', '""')
        and (coalesce((select max(saved_at) from versions where item_id = ${key}), '') < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')
          or case when ${bytes('old.body')} < ${LETTERS_UNDER} then ${lot((words) => `length(${words})`)} else ${lot(bytes)} end)
      begin
        insert into versions (item_id, body, saved_at) values (${key}, old.body, ${stamp});
        delete from versions where item_id = ${key} and id not in (select id from versions where item_id = ${key} order by id desc limit 50);
      end;`
