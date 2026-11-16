/**
 * Attendance month grid — the register's proper monthly calendar.
 *
 * A real grid (weekday-aligned rows, Sunday-first per app convention),
 * not the member-side heatmap: one column per weekday, chevron month
 * navigation flanking a pressable month-year label that opens the year
 * picker. Days with verified check-ins carry cyan marker dots (cyan is
 * the attendance accent; deeper meaning lives in the per-date details,
 * which the screen renders below). The selected date is ringed in the
 * ember accent; today keeps a subtle accent outline.
 *
 * The component is presentation only: it renders the counts it is given
 * and never invents records. Days keys come from utils/calendar (local
 * calendar parts, timezone-safe).
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import {
  dayKey,
  MONTH_NAMES,
  monthGrid,
  WEEKDAY_HEADS,
} from '@/utils/calendar';

export function AttendanceMonthGrid(props: {
  year: number;
  /** 0-based month. */
  month: number;
  /** Verified check-in count per local day key (attendance markers). */
  counts: Map<string, number>;
  /** Local day key of today, for the today outline. */
  todayKey: string;
  /** Local day key of the selected date, or null. */
  selectedKey: string | null;
  onSelectDay: (key: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Opens the year picker (the month-year label is the affordance). */
  onOpenYear: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  const weeks = monthGrid(props.year, props.month);
  const prev = MONTH_NAMES[(props.month + 11) % 12];
  const next = MONTH_NAMES[(props.month + 1) % 12];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${MONTH_NAMES[props.month]} ${props.year} attendance calendar`}
      style={props.style}>
      {/* Month bar: chevrons flank the pressable month-year label */}
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
          accessibilityHint={`Show ${prev} ${props.month === 0 ? props.year - 1 : props.year}`}
          onPress={props.onPrevMonth}
          hitPadding={6}
          style={{ opacity: 1 }}>
          <View accessible={false} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={20} color={colors.ownerInk} />
          </View>
        </PressSurface>
        {/* Display type is never lowercase: the heading token uppercases. */}
        <PressSurface
          accessibilityRole="button"
          accessibilityLabel={`Change year, currently ${props.year}`}
          accessibilityHint="Opens the year picker"
          onPress={props.onOpenYear}
          hitPadding={6}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing['3xs'],
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing['3xs'],
            borderRadius: radius.sm,
          }}>
          <AppText variant="heading">
            {MONTH_NAMES[props.month]} {props.year}
          </AppText>
          <Ionicons name="chevron-down" size={14} color={colors.ownerInkMuted} />
        </PressSurface>
        <PressSurface
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityHint={`Show ${next} ${props.month === 11 ? props.year + 1 : props.year}`}
          onPress={props.onNextMonth}
          hitPadding={6}
          style={{ opacity: 1 }}>
          <View accessible={false} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-forward" size={20} color={colors.ownerInk} />
          </View>
        </PressSurface>
      </View>

      <View
        style={[
          {
            backgroundColor: colors.ownerPanel,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.ownerDot,
            padding: spacing.sm,
          },
          tokens.elevation.lightCard,
        ]}>
        {/* Weekday heads */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {WEEKDAY_HEADS.map((head, i) => (
            <View key={`wd-${i}`} style={{ width: `${100 / 7}%` as never, padding: 1 }}>
              <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted }}>
                {head}
              </AppText>
            </View>
          ))}
        </View>

        {/* Day cells */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {weeks.flat().map((day, i) => {
            if (day === null) {
              return <View key={`blank-${i}`} style={{ width: `${100 / 7}%` as never, padding: 1 }} />;
            }
            const date = new Date(props.year, props.month, day);
            const key = dayKey(date);
            const count = props.counts.get(key) ?? 0;
            const isToday = key === props.todayKey;
            const isSelected = key === props.selectedKey;
            const label = `${MONTH_NAMES[props.month]} ${day}, ${props.year}: ${
              count === 0 ? 'no attendance recorded' : `${count} check-in${count === 1 ? '' : 's'} recorded`
            }${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`;
            return (
              <View key={key} style={{ width: `${100 / 7}%` as never, padding: 1 }}>
                <PressSurface
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => props.onSelectDay(key)}
                  hitPadding={2}
                  style={[
                    styles.cell,
                    {
                      borderRadius: radius.sm,
                      borderWidth: isSelected ? 2 : isToday ? 1.5 : StyleSheet.hairlineWidth,
                      borderColor: isSelected || isToday ? colors.ownerAccentDeep : colors.ownerRule,
                      backgroundColor: isSelected ? colors.ownerPanelMuted : 'transparent',
                    },
                  ]}>
                  <AppText
                    variant="label"
                    align="center"
                    style={{
                      color: isSelected ? colors.ownerAccentDeep : count > 0 ? colors.ownerInk : colors.ownerInkMuted,
                      fontWeight: isSelected || isToday ? '700' : '500',
                    }}>
                    {day}
                  </AppText>
                  {/* Marker dots: up to two, deeper meaning in the details */}
                  <View style={{ flexDirection: 'row', gap: 2, minHeight: 4 }}>
                    {count > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.ownerCyanDeep }} />}
                    {count > 1 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.ownerCyanDeep }} />}
                  </View>
                </PressSurface>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: spacing['3xs'],
            marginTop: spacing.xs,
          }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ownerCyanDeep }} />
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
            attended
          </AppText>
          <View style={{ width: 10, height: 10, borderRadius: radius.xs, borderWidth: 1.5, borderColor: colors.ownerAccentDeep }} />
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
            selected · outlined = today
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
