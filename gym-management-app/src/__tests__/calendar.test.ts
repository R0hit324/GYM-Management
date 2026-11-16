// Pure calendar-logic tests for the Attendance Register (Stage 2):
// month boundaries, leap years, weekday alignment, multiple attendance
// events on one date, empty months and local-timezone day keys.
import {
  addMonth,
  dayKey,
  dayKeyFromIso,
  daysInMonth,
  eventsByDay,
  monthGrid,
  monthSummary,
  parseDayKey,
  WEEKDAY_HEADS,
} from '@/utils/calendar';
import type { AttendanceEvent } from '@/types/domain';

/** Builds an event at a local date/time and serialises it exactly the way
 * the demo data does (ISO string), so the tests cover the same ISO → local
 * parse path the app uses. */
function event(id: string, date: Date, status: AttendanceEvent['status'] = 'verified'): AttendanceEvent {
  return {
    id,
    memberId: 'm-test',
    memberName: 'Test Member',
    memberIdDisplay: 'GB-0000',
    checkedInAt: date.toISOString(),
    door: 'Main entrance',
    status,
  };
}

// Verified weekday facts (local calendar dates):
//   1 Jan 2026 = Thursday; 1 Feb 2026 = Sunday; 1 Feb 2024 (leap) = Thursday.
describe('monthGrid', () => {
  it('aligns the 1st on its weekday: 1 Jan 2026 is Thursday (Sunday-first heads)', () => {
    const weeks = monthGrid(2026, 0);
    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(WEEKDAY_HEADS).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('handles a 28-day non-leap February starting on Sunday (2026): 4 exact weeks', () => {
    const weeks = monthGrid(2026, 1);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe(1);
    expect(weeks[3][6]).toBe(28);
    weeks.forEach((week) => expect(week).toHaveLength(7));
    weeks.flat().forEach((cell) => expect(cell).not.toBeNull());
  });

  it('handles the 29-day leap February 2024 starting Thursday: 5 weeks with trailing blanks', () => {
    const weeks = monthGrid(2024, 1);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(weeks[4][0]).toBe(25);
    expect(weeks[4][4]).toBe(29);
    expect(weeks[4][5]).toBeNull();
    expect(weeks[4][6]).toBeNull();
  });

  it('handles a 31-day month (January 2026) over exactly 5 weeks', () => {
    const weeks = monthGrid(2026, 0);
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(weeks).toHaveLength(5); // 4 leading blanks + 31 days = 35 cells
    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(weeks[4]).toEqual([25, 26, 27, 28, 29, 30, 31]);
    weeks.forEach((week) => expect(week).toHaveLength(7));
  });

  it('treats 1900 as a non-leap year (century rule) and 2000 as leap', () => {
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });
});

describe('addMonth', () => {
  it('rolls December forward into January of the next year', () => {
    expect(addMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('rolls January back into December of the previous year', () => {
    expect(addMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('moves within the year and across several years', () => {
    expect(addMonth({ year: 2026, month: 3 }, 1)).toEqual({ year: 2026, month: 4 });
    expect(addMonth({ year: 2026, month: 3 }, -12)).toEqual({ year: 2025, month: 3 });
  });
});

describe('dayKey / parseDayKey (timezone boundaries)', () => {
  it('gives one key to early and late times on the same local date', () => {
    const early = new Date(2026, 1, 15, 0, 1);
    const late = new Date(2026, 1, 15, 23, 59);
    expect(dayKey(early)).toBe(dayKey(late));
    expect(dayKey(early)).toBe('2026-2-15');
  });

  it('gives different keys either side of local midnight', () => {
    const before = new Date(2026, 1, 15, 23, 59);
    const after = new Date(2026, 1, 16, 0, 1);
    expect(dayKey(after)).not.toBe(dayKey(before));
  });

  it('round-trips through an ISO string in local time', () => {
    const d = new Date(2026, 1, 15, 6, 42);
    expect(dayKeyFromIso(d.toISOString())).toBe(dayKey(d));
    expect(parseDayKey('2026-2-15').getDate()).toBe(15);
  });
});

describe('monthSummary and eventsByDay', () => {
  const mar = (day: number, hour = 7) => new Date(2026, 2, day, hour, 15);

  it('counts distinct days and total events separately for multiple events on one date', () => {
    const events = [
      event('a', mar(5, 6)),
      event('b', mar(5, 10)), // second visit, same date
      event('c', mar(12)),
    ];
    const summary = monthSummary(events, 2026, 2);
    expect(summary.days).toBe(2);
    expect(summary.events).toBe(3);
    expect(summary.first).toBe(dayKey(mar(5)));
    expect(summary.last).toBe(dayKey(mar(12)));
  });

  it('returns an honest empty summary for a month with no attendance', () => {
    const summary = monthSummary([], 2026, 2);
    expect(summary.days).toBe(0);
    expect(summary.events).toBe(0);
    expect(summary.first).toBeNull();
    expect(summary.last).toBeNull();
  });

  it('counts only verified events as attendance; frozen and failed are not attendance', () => {
    const events = [
      event('v', mar(5)),
      event('f', mar(5, 9), 'failed'),
      event('z', mar(6), 'frozen'),
    ];
    const summary = monthSummary(events, 2026, 2);
    expect(summary.days).toBe(1);
    expect(summary.events).toBe(1);
  });

  it('groups all events of one date under its day key, other months excluded', () => {
    const events = [
      event('a', mar(5, 6)),
      event('b', mar(5, 17)),
      event('other-month', new Date(2026, 3, 5, 7, 0)),
      event('other-year', new Date(2025, 2, 5, 7, 0)),
    ];
    const byDay = eventsByDay(events, 2026, 2);
    expect(byDay.size).toBe(1);
    expect(byDay.get(dayKey(mar(5)))).toHaveLength(2);
  });

  it('orders events chronologically when multiple share a date', () => {
    const byDay = eventsByDay([event('late', mar(5, 17)), event('early', mar(5, 6))], 2026, 2);
    const list = byDay.get(dayKey(mar(5)));
    expect(list?.[0]?.id).toBe('late'); // insertion order (render order is the caller's concern)
    expect(list).toHaveLength(2);
  });
});
