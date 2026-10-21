// Run with: node --test test/date-phrases.test.ts
// A few hundred ways people say when, each with the day it should land on.
// Said on Wednesday 21 October 2026 at ten in the morning. A "?" at the end
// means the reading is a guess and must be shown as one, never set silently.
process.env.TZ = 'Africa/Johannesburg'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { readTask } from '../src/main/task-words.ts'

const at = new Date(2026, 9, 21, 10, 0)

/** "due Thu 22 Oct 15:00", "by Sun 25 Oct", "plan 2026-11", "none": what the words were read as. */
function said(words: string): { said: string; title: string } {
  const read = readTask(words, at)
  const day = (iso: string, timed: boolean): string => dayjs(iso).format(`ddd D MMM${dayjs(iso).year() === 2026 ? '' : ' YYYY'}${timed ? ' HH:mm' : ''}`)
  const parts = [
    read.due && `due ${day(read.due, !read.allDay)}`,
    read.deadline && `by ${day(read.deadline, read.deadlineTimed)}`,
    read.plan && `plan ${read.plan}`
  ].filter(Boolean)
  const guess = read.spans.some((one) => one.guess) ? ' ?' : ''
  return { said: (parts.join(', ') || 'none') + guess, title: read.title }
}

// [words after "call Sam", what they mean]. The title must come back as "call Sam".
const WHEN: [string, string][] = [
  // Today and tomorrow, and the ways people misspell them.
  ['today', 'due Wed 21 Oct'],
  ['tdy', 'due Wed 21 Oct ?'],
  ['tody', 'due Wed 21 Oct ?'],
  ['tomorrow', 'due Thu 22 Oct'],
  ['Tomorrow', 'due Thu 22 Oct'],
  ['TOMORROW', 'due Thu 22 Oct'],
  ['tmrw', 'due Thu 22 Oct'],
  ['tmr', 'due Thu 22 Oct'],
  ['tmw', 'due Thu 22 Oct'],
  ['2moro', 'due Thu 22 Oct'],
  ['2morrow', 'due Thu 22 Oct'],
  ['tomorow', 'due Thu 22 Oct ?'],
  ['tommorow', 'due Thu 22 Oct ?'],
  ['tommorrow', 'due Thu 22 Oct ?'],
  ['tomorrw', 'due Thu 22 Oct ?'],
  ['tomoro', 'due Thu 22 Oct ?'],
  ['day after tomorrow', 'due Fri 23 Oct'],
  ['the day after tomorrow', 'due Fri 23 Oct'],
  ['day after tmrw', 'due Fri 23 Oct'],
  ['tonight', 'due Wed 21 Oct 20:00'],
  ['tonite', 'due Wed 21 Oct 20:00'],
  ['tonight 9', 'due Wed 21 Oct 21:00'],
  ['tonight at 10:30', 'due Wed 21 Oct 22:30'],
  ['tonight at 11pm', 'due Wed 21 Oct 23:00'],
  ['this evening', 'due Wed 21 Oct 20:00'],
  ['this morning', 'due Wed 21 Oct'],
  ['this afternoon', 'due Wed 21 Oct'],
  ['eod', 'due Wed 21 Oct 17:00'],
  ['end of day', 'due Wed 21 Oct 17:00'],
  ['end of the day', 'due Wed 21 Oct 17:00'],
  ['by end of day', 'by Wed 21 Oct 17:00'],
  ['by the end of the day', 'by Wed 21 Oct 17:00'],
  ['by eod', 'by Wed 21 Oct 17:00'],

  // Weeks: a week is a week, never one day of it.
  ['this week', 'by Sun 25 Oct'],
  ['This week', 'by Sun 25 Oct'],
  ['sometime this week', 'by Sun 25 Oct'],
  ['some time this week', 'by Sun 25 Oct'],
  ['later this week', 'by Sun 25 Oct'],
  ['by this week', 'by Sun 25 Oct'],
  ['before the end of this week', 'by Fri 23 Oct 17:00'],
  ['next week', 'by Sun 1 Nov'],
  ['sometime next week', 'by Sun 1 Nov'],
  ['by next week', 'by Sun 1 Nov'],
  ['nxt week', 'by Sun 1 Nov'],
  ['eow', 'due Fri 23 Oct 17:00'],
  ['end of week', 'due Fri 23 Oct 17:00'],
  ['end of the week', 'due Fri 23 Oct 17:00'],
  ['end of this week', 'due Fri 23 Oct 17:00'],
  ['by the end of the week', 'by Fri 23 Oct 17:00'],
  ['by end of week', 'by Fri 23 Oct 17:00'],
  ['end of next week', 'due Fri 30 Oct 17:00'],
  ['by the end of next week', 'by Fri 30 Oct 17:00'],
  ['start of next week', 'due Mon 26 Oct'],
  ['beginning of next week', 'due Mon 26 Oct'],
  ['early next week', 'due Mon 26 Oct'],
  ['mid next week', 'due Wed 28 Oct'],
  ['middle of next week', 'due Wed 28 Oct'],
  ['monday next week', 'due Mon 26 Oct'],
  ['fri next week', 'due Fri 30 Oct'],
  ['friday next week', 'due Fri 30 Oct'],
  ['the week after next', 'due Mon 2 Nov'],
  ['week after next', 'due Mon 2 Nov'],
  ['a week from today', 'due Wed 28 Oct'],
  ['a week from now', 'due Wed 28 Oct'],
  ['a week from tomorrow', 'due Thu 29 Oct'],
  ['a week from friday', 'due Fri 30 Oct'],
  ['friday week', 'due Fri 30 Oct ?'],
  ['this weekend', 'due Sat 24 Oct'],
  ['next weekend', 'due Sat 31 Oct'],

  // From now.
  ['in a week', 'due Wed 28 Oct'],
  ['in 1 week', 'due Wed 28 Oct'],
  ['in one week', 'due Wed 28 Oct'],
  ['in 2 weeks', 'due Wed 4 Nov'],
  ['in two weeks', 'due Wed 4 Nov'],
  ['in 2 wks', 'due Wed 4 Nov'],
  ['in 1 wk', 'due Wed 28 Oct'],
  ['in a fortnight', 'due Wed 4 Nov'],
  ['in 3 weeks', 'due Wed 11 Nov'],
  ['two weeks from now', 'due Wed 4 Nov'],
  ['in 3 days', 'due Sat 24 Oct'],
  ['in three days', 'due Sat 24 Oct'],
  ['in a day', 'due Thu 22 Oct'],
  ['in 1 day', 'due Thu 22 Oct'],
  ['in 10 days', 'due Sat 31 Oct'],
  ['in a couple of days', 'due Fri 23 Oct'],
  ['in a few days', 'due Sat 24 Oct'],
  ['in 2 hours', 'due Wed 21 Oct 12:00'],
  ['in 2 hrs', 'due Wed 21 Oct 12:00'],
  ['in an hour', 'due Wed 21 Oct 11:00'],
  ['in 1 hour', 'due Wed 21 Oct 11:00'],
  ['in 30 minutes', 'due Wed 21 Oct 10:30'],
  ['in 30 mins', 'due Wed 21 Oct 10:30'],
  ['in 30 min', 'due Wed 21 Oct 10:30'],
  ['in 45m', 'due Wed 21 Oct 10:45'],
  ['in 90 minutes', 'due Wed 21 Oct 11:30'],
  ['in a month', 'due Sat 21 Nov'],
  ['in 2 months', 'due Mon 21 Dec'],
  ['in a year', 'due Thu 21 Oct 2027'],

  // Days of the week. The one today is today; the rest are the next to come.
  ['mon', 'due Mon 26 Oct'],
  ['monday', 'due Mon 26 Oct'],
  ['Monday', 'due Mon 26 Oct'],
  ['on monday', 'due Mon 26 Oct'],
  ['tue', 'due Tue 27 Oct'],
  ['tues', 'due Tue 27 Oct'],
  ['tuesday', 'due Tue 27 Oct'],
  ['wed', 'due Wed 21 Oct'],
  ['weds', 'due Wed 21 Oct'],
  ['wednesday', 'due Wed 21 Oct'],
  ['thu', 'due Thu 22 Oct'],
  ['thur', 'due Thu 22 Oct'],
  ['thurs', 'due Thu 22 Oct'],
  ['thursday', 'due Thu 22 Oct'],
  ['fri', 'due Fri 23 Oct'],
  ['friday', 'due Fri 23 Oct'],
  ['on friday', 'due Fri 23 Oct'],
  ['sat', 'due Sat 24 Oct'],
  ['saturday', 'due Sat 24 Oct'],
  ['sun', 'due Sun 25 Oct'],
  ['sunday', 'due Sun 25 Oct'],
  ['this fri', 'due Fri 23 Oct'],
  ['this friday', 'due Fri 23 Oct'],
  ['coming friday', 'due Fri 23 Oct'],
  ['this coming friday', 'due Fri 23 Oct'],
  ['next monday', 'due Mon 26 Oct'],
  ['next mon', 'due Mon 26 Oct'],
  ['next fri', 'due Fri 30 Oct ?'],
  ['next friday', 'due Fri 30 Oct ?'],
  ['next tues', 'due Tue 27 Oct'],
  ['mondy', 'due Mon 26 Oct ?'],
  ['tuseday', 'due Tue 27 Oct ?'],
  ['wensday', 'due Wed 21 Oct ?'],
  ['wendsday', 'due Wed 21 Oct ?'],
  ['thrusday', 'due Thu 22 Oct ?'],
  ['thurday', 'due Thu 22 Oct ?'],
  ['firday', 'due Fri 23 Oct ?'],
  ['saterday', 'due Sat 24 Oct ?'],
  ['sundy', 'due Sun 25 Oct ?'],

  // By, due and before: when it must be done by.
  ['by friday', 'by Fri 23 Oct'],
  ['by fri', 'by Fri 23 Oct'],
  ['due friday', 'by Fri 23 Oct'],
  ['due by friday', 'by Fri 23 Oct'],
  ['before friday', 'by Fri 23 Oct'],
  ['by tomorrow', 'by Thu 22 Oct'],
  ['by tmrw', 'by Thu 22 Oct'],
  ['by 5pm', 'by Wed 21 Oct 17:00'],
  ['by 2 nov', 'by Mon 2 Nov'],
  ['tomorrow by 5pm', 'due Thu 22 Oct, by Thu 22 Oct 17:00'],
  ['monday by friday', 'due Mon 26 Oct, by Fri 23 Oct'],

  // Times of day.
  ['at 3', 'due Wed 21 Oct 15:00 ?'],
  ['at 3pm', 'due Wed 21 Oct 15:00'],
  ['3pm', 'due Wed 21 Oct 15:00'],
  ['3 pm', 'due Wed 21 Oct 15:00'],
  ['3PM', 'due Wed 21 Oct 15:00'],
  ['at 15:00', 'due Wed 21 Oct 15:00'],
  ['15:00', 'due Wed 21 Oct 15:00'],
  ['at 9', 'due Thu 22 Oct 09:00'],
  ['9am', 'due Thu 22 Oct 09:00'],
  ['at 9:30am', 'due Thu 22 Oct 09:30'],
  ['at 9.30', 'due Thu 22 Oct 09:30'],
  ['9.30am', 'due Thu 22 Oct 09:30'],
  ['at 11', 'due Wed 21 Oct 11:00'],
  ['11am', 'due Wed 21 Oct 11:00'],
  ['at 10.30pm', 'due Wed 21 Oct 22:30'],
  ['at noon', 'due Wed 21 Oct 12:00'],
  ['noon', 'due Wed 21 Oct 12:00'],
  ['midday', 'due Wed 21 Oct 12:00'],
  ['at midday', 'due Wed 21 Oct 12:00'],
  ['midnight', 'due Thu 22 Oct 00:00'],
  ['at 5:45', 'due Wed 21 Oct 17:45 ?'],
  ['at 18:30', 'due Wed 21 Oct 18:30'],
  ['at 06:00', 'due Thu 22 Oct 06:00'],

  // A day and a time.
  ['tomorrow 3pm', 'due Thu 22 Oct 15:00'],
  ['tomorrow at 3pm', 'due Thu 22 Oct 15:00'],
  ['tomorrow at 3', 'due Thu 22 Oct 15:00 ?'],
  ['tomorrow 3', 'due Thu 22 Oct 15:00 ?'],
  ['tmrw 3', 'due Thu 22 Oct 15:00 ?'],
  ['tmrw 3pm', 'due Thu 22 Oct 15:00'],
  ['tomorrow 9', 'due Thu 22 Oct 09:00'],
  ['tomorrow 9.30', 'due Thu 22 Oct 09:30'],
  ['tomorrow 9:30', 'due Thu 22 Oct 09:30'],
  ['tomorrow at 15:00', 'due Thu 22 Oct 15:00'],
  ['3pm tomorrow', 'due Thu 22 Oct 15:00'],
  ['10am tmrw', 'due Thu 22 Oct 10:00'],
  ['tomorrow at noon', 'due Thu 22 Oct 12:00'],
  ['fri 10', 'due Fri 23 Oct 10:00'],
  ['fri 2', 'due Fri 23 Oct 14:00 ?'],
  ['fri at 2pm', 'due Fri 23 Oct 14:00'],
  ['friday 10am', 'due Fri 23 Oct 10:00'],
  ['friday at noon', 'due Fri 23 Oct 12:00'],
  ['monday 9am', 'due Mon 26 Oct 09:00'],
  ['mon 9.30', 'due Mon 26 Oct 09:30'],
  ['tues 3pm', 'due Tue 27 Oct 15:00'],
  ['weds 11am', 'due Wed 21 Oct 11:00'],
  ['next monday at 10', 'due Mon 26 Oct 10:00'],
  ['tomorrow morning', 'due Thu 22 Oct'],
  ['tomorrow afternoon', 'due Thu 22 Oct'],
  ['tomorrow evening', 'due Thu 22 Oct'],
  ['first thing tomorrow', 'due Thu 22 Oct 09:00'],
  ['tomorrow first thing', 'due Thu 22 Oct 09:00'],
  ['first thing monday', 'due Mon 26 Oct 09:00'],
  ['first thing', 'due Thu 22 Oct 09:00'],
  ['first thing in the morning', 'due Thu 22 Oct 09:00'],
  ['tomorow 3pm', 'due Thu 22 Oct 15:00 ?'],
  ['firday at 4pm', 'due Fri 23 Oct 16:00 ?'],

  // Dates, the British way: the day first.
  ['2 nov', 'due Mon 2 Nov'],
  ['2nd nov', 'due Mon 2 Nov'],
  ['nov 2', 'due Mon 2 Nov'],
  ['nov 2nd', 'due Mon 2 Nov'],
  ['november 2', 'due Mon 2 Nov'],
  ['2 november', 'due Mon 2 Nov'],
  ['on 2 nov', 'due Mon 2 Nov'],
  ['on the 2nd of november', 'due Mon 2 Nov'],
  ['2/11', 'due Mon 2 Nov ?'],
  ['on 2/11', 'due Mon 2 Nov ?'],
  ['11/2', 'due Thu 11 Feb 2027 ?'],
  ['25/10', 'due Sun 25 Oct'],
  ['31/12', 'due Thu 31 Dec'],
  ['1/1', 'due Fri 1 Jan 2027'],
  ['25/12/2026', 'due Fri 25 Dec'],
  ['2026-11-05', 'due Thu 5 Nov'],
  ['5 nov 2026', 'due Thu 5 Nov'],
  ['5 nov 2027', 'due Fri 5 Nov 2027'],
  ['3 dec at 2pm', 'due Thu 3 Dec 14:00'],
  ['dec 3rd 9am', 'due Thu 3 Dec 09:00'],
  ['3 december 14:00', 'due Thu 3 Dec 14:00'],
  ['30 oct', 'due Fri 30 Oct'],
  ['oct 30', 'due Fri 30 Oct'],
  ['21 oct', 'due Wed 21 Oct'],
  ['20 oct', 'due Wed 20 Oct 2027'],
  ['on the 1st', 'due Sun 1 Nov'],
  ['on the 25th', 'due Sun 25 Oct'],
  ['on the 21st', 'due Wed 21 Oct'],
  ['on the 3rd at 3pm', 'due Tue 3 Nov 15:00'],
  ['febuary 3', 'due Wed 3 Feb 2027 ?'],
  ['3 feburary', 'due Wed 3 Feb 2027 ?'],
  ['ocotber 30', 'due Fri 30 Oct ?'],
  ['jan 5', 'due Tue 5 Jan 2027'],
  ['5th jan', 'due Tue 5 Jan 2027'],

  // Months, years and someday: a when with no day.
  ['this month', 'plan 2026-10'],
  ['next month', 'plan 2026-11'],
  ['this year', 'plan 2026'],
  ['next year', 'plan 2027'],
  ['someday', 'plan someday'],
  ['some day', 'plan someday'],
  ['end of month', 'due Sat 31 Oct'],
  ['end of the month', 'due Sat 31 Oct'],
  ['eom', 'due Sat 31 Oct'],
  ['by end of month', 'by Sat 31 Oct'],
  ['by the end of the month', 'by Sat 31 Oct'],
  ['end of next month', 'due Mon 30 Nov'],
  ['start of next month', 'due Sun 1 Nov'],
  ['beginning of next month', 'due Sun 1 Nov'],
  ['end of the year', 'due Thu 31 Dec'],
  ['by the end of the year', 'by Thu 31 Dec']
]

for (const [words, meant] of WHEN) {
  test(`"call Sam ${words}" is ${meant}`, () => {
    const read = said(`call Sam ${words}`)
    assert.equal(read.said, meant)
    assert.equal(read.title, 'call Sam')
  })
}

// Words that only look like dates: they stay in the title and set nothing.
const NOT_WHEN: string[] = [
  'read chapter 3',
  'buy 2 apples',
  'buy sun cream',
  'update the sat nav',
  'fix the second monitor',
  'read the 2nd chapter',
  'call mum about the 3 kids',
  'install version 2.30',
  'pay half the rent',
  'watch march of the penguins',
  'email may about the venue',
  'write the weekly review',
  'book a 30 min call',
  'clean 4 windows',
  'order 10 boxes',
  'review pr 1234',
  'plan the week ahead',
  'tidy up the week',
  'notes from last week',
  'the doctor note from tuesday',
  'ill since monday',
  'what I did 2 days ago',
  'call jan',
  'read the august issue',
  'learn about the second world war',
  'buy a new watch',
  'the first thing I learnt',
  'reply to the friday newsletter',
  'grab a weekend bag'
]
for (const words of NOT_WHEN) {
  test(`"${words}" sets no day and keeps its words`, () => {
    const read = said(words)
    assert.equal(read.said, 'none')
    assert.equal(read.title.toLowerCase(), words.toLowerCase())
  })
}

// Said among other words, anywhere in the line.
const IN_LINE: [string, string, string][] = [
  ['Create 2 framer websites and deploy them this week', 'Create 2 framer websites and deploy them', 'by Sun 25 Oct'],
  ['this week: finish the report', 'Finish the report', 'by Sun 25 Oct'],
  ['finish the report by the end of this week', 'finish the report', 'by Fri 23 Oct 17:00'],
  ['dentist tmrw 3', 'dentist', 'due Thu 22 Oct 15:00 ?'],
  ['dentist tomorrow at 3pm p1', 'dentist', 'due Thu 22 Oct 15:00'],
  ['pay rent on the 1st', 'pay rent', 'due Sun 1 Nov'],
  ['tomorrow: buy milk', 'Buy milk', 'due Thu 22 Oct'],
  ['buy milk tomorrow.', 'buy milk.', 'due Thu 22 Oct'],
  ['send the invoice by fri !!', 'send the invoice', 'by Fri 23 Oct'],
  ['ship v2 next week ~2h', 'ship v2', 'by Sun 1 Nov'],
  ['call the bank first thing tomorrow', 'call the bank', 'due Thu 22 Oct 09:00'],
  ['meet Ana for coffee sat 11am', 'meet Ana for coffee', 'due Sat 24 Oct 11:00'],
  ['submit the essay by 2/11', 'submit the essay', 'by Mon 2 Nov ?'],
  ['book flights in a fortnight', 'book flights', 'due Wed 4 Nov'],
  ['renew passport end of next month', 'renew passport', 'due Mon 30 Nov'],
  ['water plants every 3 days', 'water plants', 'due Wed 21 Oct'],
  ['standup every weekday at 9am', 'standup', 'due Thu 22 Oct 09:00'],
  // Found while trying to break it.
  ['gym mon wed fri', 'gym', 'due Wed 21 Oct ?'],
  ['gym on mondays', 'gym', 'due Mon 26 Oct'],
  ['dinner sat 7', 'dinner', 'due Sat 24 Oct 07:00 ?'],
  ['dinner sat 7pm', 'dinner', 'due Sat 24 Oct 19:00'],
  ['haircut thu 4.30', 'haircut', 'due Thu 22 Oct 16:30 ?'],
  ['pay bill by the 28th', 'pay bill', 'by Wed 28 Oct'],
  ['in march, plan the trip', 'Plan the trip', 'plan 2027-03'],
  ['plan trip in march', 'plan trip', 'plan 2027-03'],
  ['renew insurance before december', 'renew insurance', 'by Tue 1 Dec'],
  ['send report later today', 'send report', 'due Wed 21 Oct'],
  ['read 2 chapters a day', 'read 2 chapters a day', 'none'],
  ['meet @ 3pm', 'meet', 'due Wed 21 Oct 15:00'],
  ['submit timesheet every friday at 4pm', 'submit timesheet', 'due Fri 23 Oct 16:00'],
  ['weekly sync every monday 9am', 'weekly sync', 'due Mon 26 Oct 09:00'],
  ['tuesday dentist', 'Dentist', 'due Tue 27 Oct'],
  ['wed dentist', 'wed dentist', 'none'],
  ['check the mon-fri schedule', 'check the mon-fri schedule', 'none'],
  ['do it on the weekend', 'do it', 'due Sat 24 Oct'],
  ['do it over the weekend', 'do it', 'due Sat 24 Oct'],
  ['finish it by the weekend', 'finish it', 'by Sat 24 Oct'],
  ['grab a weekend bag', 'grab a weekend bag', 'none'],
  ['call may tomorrow', 'call may', 'due Thu 22 Oct']
]
for (const [words, title, meant] of IN_LINE) {
  test(`"${words}" is "${title}", ${meant}`, () => {
    const read = said(words)
    assert.equal(read.said, meant)
    assert.equal(read.title, title)
  })
}

test('a guess says what it guessed, in words a person reads', () => {
  assert.equal(readTask('call Sam tomorow', at).spans[0].guess, 'Read “tomorow” as tomorrow')
  assert.match(readTask('call Sam at 3', at).spans[0].guess ?? '', /afternoon/)
  assert.match(readTask('call Sam 2/11', at).spans[0].guess ?? '', /2 November/)
  assert.match(readTask('call Sam next fri', at).spans[0].guess ?? '', /this fri/)
})

test('"this week" and "next week" are said as weeks, not as their last day', () => {
  assert.equal(readTask('call Sam this week', at).spans[0].week, 'this week')
  assert.equal(readTask('call Sam next week', at).spans[0].week, 'next week')
})

test('"this week" said on a Sunday is today, and on a Monday the Sunday after', () => {
  assert.equal(dayjs(readTask('call Sam this week', new Date(2026, 9, 25, 10)).deadline).format('ddd D MMM'), 'Sun 25 Oct')
  assert.equal(dayjs(readTask('call Sam this week', new Date(2026, 9, 19, 10)).deadline).format('ddd D MMM'), 'Sun 25 Oct')
})
