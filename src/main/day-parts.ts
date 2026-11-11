/**
 * Where the night ends, one rule for the whole app: from 4 in the morning it is
 * morning (the Day page's question and caption, the day's brief, the morning
 * sort, the scenery by the clock, the parts of the day practice and focus speak
 * of, and the night list in Tomorrow). Before it, it is still the night before.
 * 11 Nov: at 4:30 the Day page asked about "whatever will not let you sleep".
 */
export const MORNING_FROM = 4

/** Still the night before: midnight until 4. */
export const smallHours = (hour: number): boolean => hour < MORNING_FROM

/** Morning: from 4 until noon. */
export const isMorning = (hour: number): boolean => hour >= MORNING_FROM && hour < 12
