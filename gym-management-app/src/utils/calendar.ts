/**
 * Calendar logic for the Attendance Register — pure, dependency-free and
 * unit-tested (src/__tests__/calendar.test.ts).
 *
 * Every key is built from LOCAL calendar date parts (never Date
 * toISOString(), which is UTC and shifts dates across timezone offsets):
 * a 23:59 check-in and a 00:01 check-in on the same local date share one
 * key, and a check-in just after local midnight gets the new day's key.
 * The grid is Sunday-first, matching the app's established weekday heads.
 */
import type { AttendanceEvent } from '@/types/domain';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Column heads, Sunday-first (app convention, matches the member heatmap). */
export const WEEKDAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Local calendar-day key `YYYY-M-D` for a Date (local parts only). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** The day key of an ISO timestamp, judged in local time. */
export function dayKeyFromIso(iso: string): string {
  return dayKey(new Date(iso));
}

/** The local Date at midnight for a day key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Number of days in a month (leap years handled by the Date constructor). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The count of check-in records that count as attendance: verified scans.
 * Frozen visits are recorded but are never attendance (register rule);
 * failed scans are not records at all. Per-date details still list them. */
export function isAttendance(e: AttendanceEvent): boolean {
  return e.status === 'verified';
}

export interface MonthPosition {
  year: number;
  /** 0-based month. */
  month: number;
}

/** Rolls a month position by `delta` months, crossing year boundaries both
 * ways (December → January of the next year, January → December before). */
export function addMonth(pos: MonthPosition, delta: number): MonthPosition {
  const total = pos.year * 12 + pos.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * The month grid: an array of weeks, each week exactly 7 cells
 * (Sunday-first), `null` for leading days before the 1st and trailing
 * days after the month's end. Handles 28/29/30/31-day months.
 */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const days = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Groups a member's events by local day key for one month. Returns every
 * recorded event (verified, frozen, failed) keyed by day — the grid's
 * markers count only attendance (verified), while the per-date details
 * list everything honestly.
 */
export function eventsByDay(events: AttendanceEvent[], year: number, month: number): Map<string, AttendanceEvent[]> {
  const map = new Map<string, AttendanceEvent[]>();
  for (const e of events) {
    const d = new Date(e.checkedInAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = dayKey(d);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

export interface MonthSummary {
  /** Distinct days with attendance (verified check-ins). */
  days: number;
  /** Total attendance events (verified) — may exceed `days`. */
  events: number;
  /** Day key of the first attendance of the month, or null. */
  first: string | null;
  /** Day key of the last attendance of the month, or null. */
  last: string | null;
}

/** Monthly attendance summary from actual records; an empty month returns
 * zero days/events and null first/last — never fabricated dates. */
export function monthSummary(events: AttendanceEvent[], year: number, month: number): MonthSummary {
  const days = new Set<string>();
  let count = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const e of events) {
    if (!isAttendance(e)) continue;
    const d = new Date(e.checkedInAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = dayKey(d);
    days.add(key);
    count++;
    if (first === null || d < parseDayKey(first)) first = key;
    if (last === null || d > parseDayKey(last)) last = key;
  }
  return { days: days.size, events: count, first, last };
}
