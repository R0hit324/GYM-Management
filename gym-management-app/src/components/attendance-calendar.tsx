/**
 * Attendance calendar — a LeetCode-style training heatmap for the member.
 *
 * One month at a time, seven columns starting on Sunday. Each day is a
 * square: paper when untrained, deepening green with each verified check-in
 * that day (green is semantic state — "you trained" — the only second hue
 * the Piste theme allows). Squares carry the meaning graphically; the
 * caption and accessibility summary state the numbers in words.
 *
 * Month navigation: back through every month that has (or precedes) data,
 * forward only to the current month — no speculative future browsing.
 * The future has no squares yet, by design.
 *
 * Demo honesty: the component renders whatever events it is given; the
 * screen supplies generated demo history plus today's demo check-ins and
 * labels it as demo data.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import type { AttendanceEvent } from '@/types/domain';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Column heads, Sunday-first. */
const WEEKDAY_HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Heat level from verified check-ins that day: 0..4. */
function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

const HEAT_TOKEN_KEYS = ['heat0', 'heat1', 'heat2', 'heat3', 'heat4'] as const;

export function AttendanceCalendar(props: {
  events: AttendanceEvent[];
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  // Midnight today, stable across renders.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Verified check-ins per day (failed/frozen scans are not attendance).
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of props.events) {
      if (e.status !== 'verified') continue;
      const key = dayKey(new Date(e.checkedInAt));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [props.events]);

  // Earliest day the member could have trained — bounds "prev".
  const earliestDay = useMemo(() => {
    if (props.events.length === 0) return today;
    let min = today;
    for (const e of props.events) {
      const d = new Date(e.checkedInAt);
      d.setHours(0, 0, 0, 0);
      if (d < min) min = d;
    }
    return min;
  }, [props.events, today]);

  const [month, setMonth] = useState(() => firstOfMonth(today));
  const monthStart = firstOfMonth(month);
  const canGoPrev = monthStart > firstOfMonth(earliestDay);
  const canGoNext = monthStart < firstOfMonth(today);

  const shift = (dir: -1 | 1) => {
    if (dir === -1 && !canGoPrev) return;
    if (dir === 1 && !canGoNext) return;
    setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
  };

  // Grid: leading blanks so day 1 lands on its weekday, then 1..daysInMonth.
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const trainedDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(
    (day) => (countsByDay.get(dayKey(new Date(month.getFullYear(), month.getMonth(), day))) ?? 0) > 0,
  ).length;

  const summary = `${MONTHS[month.getMonth()]} ${month.getFullYear()}: trained on ${trainedDays} of ${daysInMonth} days. Demo data.`;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={summary}
      style={[{ marginTop: spacing.md }, props.style]}>
      {/* Month bar: chevrons flank a condensed-caps month label */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.xs,
        }}>
        <PressSurface
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityHint={`Show ${MONTHS[(month.getMonth() + 11) % 12]} ${month.getFullYear()}`}
          disabled={!canGoPrev}
          onPress={() => shift(-1)}
          hitPadding={6}
          style={{ opacity: canGoPrev ? 1 : 0.35 }}>
          <View
            accessible={false}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </View>
        </PressSurface>
        {/* Display type is never lowercase (Piste): the token uppercases. */}
        <AppText variant="heading">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </AppText>
        <PressSurface
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityHint={`Show ${MONTHS[(month.getMonth() + 1) % 12]} ${month.getFullYear()}`}
          disabled={!canGoNext}
          onPress={() => shift(1)}
          hitPadding={6}
          style={{ opacity: canGoNext ? 1 : 0.35 }}>
          <View
            accessible={false}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </View>
        </PressSurface>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: colors.rule,
          padding: spacing.sm,
        }}>
        {/* Weekday heads */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {WEEKDAY_HEADS.map((head, i) => (
            <View key={`wd-${i}`} style={{ width: `${100 / 7}%` as never, padding: 1 }}>
              <AppText variant="caption" tone="muted" align="center">
                {head}
              </AppText>
            </View>
          ))}
        </View>

        {/* Day squares */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, i) => {
            if (day === null) {
              return <View key={`blank-${i}`} style={{ width: `${100 / 7}%` as never, padding: 1 }} />;
            }
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const level = levelFor(countsByDay.get(dayKey(date)) ?? 0);
            const isFuture = date > today;
            const isToday = date.getTime() === today.getTime();
            const heatColor = tokens.colors[HEAT_TOKEN_KEYS[level]];
            return (
              <View
                key={dayKey(date)}
                style={{ width: `${100 / 7}%` as never, padding: 1 }}>
                <View
                  accessible={!isFuture}
                  accessibilityLabel={
                    isFuture
                      ? undefined
                      : (() => {
                          const count = countsByDay.get(dayKey(date)) ?? 0;
                          return `${MONTHS[month.getMonth()]} ${day}: ${count === 0 ? 'no check-ins' : `${count} check-in${count === 1 ? '' : 's'}`}`;
                        })()
                  }
                  style={{
                    aspectRatio: 1,
                    backgroundColor: isFuture ? 'transparent' : heatColor,
                    borderWidth: isFuture ? StyleSheet.hairlineWidth : 0,
                    borderColor: colors.rule,
                    // Today is outlined in ember, not coloured differently.
                    ...(isToday ? { borderWidth: 2, borderColor: colors.accent } : {}),
                  }}
                />
              </View>
            );
          })}
        </View>

        {/* Legend: the squares say less/more; the caption says demo. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: spacing['3xs'],
            marginTop: spacing.xs,
          }}>
          <AppText variant="caption" tone="subtle">
            Less
          </AppText>
          {HEAT_TOKEN_KEYS.map((key) => (
            <View
              key={key}
              style={{
                width: 10,
                height: 10,
                backgroundColor: tokens.colors[key],
              }}
            />
          ))}
          <AppText variant="caption" tone="subtle">
            More
          </AppText>
        </View>
      </View>

      <AppText variant="caption" tone="subtle" style={{ marginTop: spacing.xs }}>
        Green squares are verified check-ins — deeper green, more sessions that day. Demo data; real history arrives with the backend.
      </AppText>
    </View>
  );
}
