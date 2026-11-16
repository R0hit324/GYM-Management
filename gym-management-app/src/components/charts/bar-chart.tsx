/**
 * Bar chart for collections by period. Sorted periods, one accent hue, every
 * bar labelled with its value so meaning never rides on colour alone.
 *
 * Readability pass (owner light panel): taller plot, larger semibold value
 * labels above the bars (₹-compact Indian format, e.g. ₹1.2K / ₹15K), larger
 * x labels, configurable label/grid colours so the chart stays high-contrast
 * on light surfaces. Exact values are preserved in the accessibility summary
 * and the caption line beneath the chart — labels are only abbreviated for
 * space.
 *
 * RENDERING ROOT-CAUSE FIX: the previous implementation drew bars as SVG
 * <Rect> whose y/height came ONLY from Reanimated animated-SVG props. That
 * channel does not reliably reach react-native-svg views on the new
 * architecture, so bars rendered with no geometry at all — invisible. The
 * bars are now plain RN Views (Reanimated Animated.View, the same channel
 * proven working across the app), laid out in a flex row over a baseline
 * rule. Same visual design, guaranteed rendering on every device.
 *
 * Motion: on mount bars grow from the baseline (~1s, ease-out, small
 * per-bar stagger); when data changes bars morph from their CURRENT height
 * to the new one — no full replay, and re-renders never re-run the
 * entrance. Reduce-motion renders the final chart immediately. Data
 * honesty: the accessibility summary always reads the real values.
 *
 * Interaction: tapping a column selects it — the bar resolves to full
 * accent and a tooltip pill fades and rises in with the period's full
 * label and EXACT value (the compact label above the bar steps aside so
 * nothing overlaps). Tapping again (or another column) re-selects; the
 * pill animates in every time it appears, never on plain re-renders.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing as ReEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { EmptyState } from '@/components/ui/feedback';
import type { TrendPoint } from '@/types/domain';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { Easing, Motion } from '@/constants/theme';
import { formatCurrency } from '@/utils/format';
import { hapticSelect } from '@/utils/haptics';

/** Compact Indian currency for tight chart labels: ₹950 → ₹950, ₹1200 → ₹1.2K, ₹15000 → ₹15K. */
function chartMoney(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `₹${v}`;
}

/** One bar: a plain View whose height animates on the UI thread. Grows
 * from the baseline on mount (staggered per index, ease-out, ~1s) and
 * morphs from its current height whenever its target changes — re-renders
 * with unchanged data never replay anything. */
function AnimBar(props: { barH: number; fill: string; delay: number; width: string }) {
  const reduce = useReduceMotion();
  const height = useSharedValue(0);
  const firstRun = useRef(true);

  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    if (reduce) {
      height.value = props.barH;
      return;
    }
    height.value = withDelay(
      first ? props.delay : 0,
      withTiming(props.barH, {
        duration: first ? 1000 : Motion.swap + 120,
        easing: ReEasing.bezier(...(first ? Easing.out : Easing.inOut)),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.barH, reduce]);

  const animated = useAnimatedStyle(() => ({
    height: Math.max(1, Math.round(height.value)),
  }));

  return (
    <Animated.View
      style={[
        {
          width: props.width,
          maxWidth: 46,
          borderRadius: 5,
          backgroundColor: props.fill,
        },
        animated,
      ]}
    />
  );
}

/** Value label that fades in with a per-index stagger once its bar has
 * mostly settled. Positioned at the bar's FINAL height, so it sits exactly
 * above the bar when the growth lands. `from` is a normalised threshold
 * (0–0.8) so every label — including the last — reaches full opacity. */
function AnimBarValue(props: { appear: SharedValue<number>; bottom: number; color: string; text: string; from: number }) {
  const animated = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, (props.appear.value - props.from) / 0.2)),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: props.bottom,
          alignSelf: 'center',
        },
        animated,
      ]}>
      <AppText variant="caption" style={{ color: props.color, fontWeight: '700' }}>
        {props.text}
      </AppText>
    </Animated.View>
  );
}

/** Tooltip pill for the selected bar: fades and rises in (Motion.short,
 * ease-out); reduce-motion renders it instantly. Shows the FULL period
 * label and the EXACT un-abbreviated value — the tooltip is the precise
 * read, the compact label above the bar is the at-a-glance read. */
function BarTooltip(props: { bottom: number; color: string; surface: string; border: string; radius: number; text: string }) {
  const reduce = useReduceMotion();
  const appear = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      appear.value = 1;
      return;
    }
    const raf = requestAnimationFrame(() => {
      appear.value = withTiming(1, { duration: Motion.short, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
  }, [reduce, appear]);

  const animated = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * 4 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', bottom: props.bottom, alignSelf: 'center' }, animated]}>
      <View
        style={{
          backgroundColor: props.surface,
          borderColor: props.border,
          borderWidth: 1,
          borderRadius: props.radius,
          paddingHorizontal: 9,
          paddingVertical: 3,
        }}>
        <AppText variant="caption" style={{ color: props.color, fontWeight: '600' }}>
          {props.text}
        </AppText>
      </View>
    </Animated.View>
  );
}

export function BarChart({
  points,
  accent,
  currency = true,
  valueColor,
  labelColor,
  gridColor,
  captionColor,
  subCaptionColor,
}: {
  points: TrendPoint[];
  accent?: string;
  currency?: boolean;
  valueColor?: string;
  labelColor?: string;
  gridColor?: string;
  captionColor?: string;
  subCaptionColor?: string;
}) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, type, radius } = tokens;

  const vColor = valueColor ?? colors.inkMuted;
  const lColor = labelColor ?? colors.inkSubtle;
  const gColor = gridColor ?? colors.chartRule;
  const cColor = captionColor ?? colors.inkMuted;
  const sColor = subCaptionColor ?? colors.inkSubtle;
  const fill = accent ?? colors.chartPrimary;

  // Value-label entrance: one shared progress on mount only; data changes
  // keep the labels fully visible while the bars morph beneath them.
  // (All hooks run unconditionally — the empty-data early return comes after.)
  const appear = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      appear.value = 1;
      return;
    }
    const raf = requestAnimationFrame(() => {
      appear.value = withTiming(1, { duration: Motion.chartDraw, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
  }, [reduce, appear]);

  // Tap selection state (hook order: must run before the empty guard).
  const [selected, setSelected] = useState<number | null>(null);

  // Empty data: say so plainly instead of rendering an invisible chart.
  if (points.length === 0) {
    return (
      <EmptyState
        icon="bar-chart-outline"
        title="No collections recorded yet"
        hint="Bars appear here as soon as a week has verified entries."
      />
    );
  }

  const padTop = 34; // headroom so the tallest value label never clips
  const axisH = 24; // x-label row height
  const plotH = 130;
  const max = Math.max(...points.map((p) => p.value), 1);
  const barH = (v: number) => Math.max(3, Math.round((v / max) * plotH));
  const sorted = points.map((p, i) => i).sort((a, b) => points[b].value - points[a].value)[0];
  const summary = `Chart, bars over ${points.length} periods. Highest ${points[sorted]?.fullLabel} at ${points[sorted]?.value}. Values in rupees.`;

  // Guarded against stale indexes after a filter change; the emphasis
  // follows the selection (falls back to the highest bar when nothing is
  // selected).
  const selectedIdx = selected !== null && selected < points.length ? selected : null;
  const emphasized = selectedIdx ?? sorted;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLabel={summary} style={{ opacity: 0, position: 'absolute' }}>
        {summary}
      </Text>
      <View accessible={false}>
        {/* Plot: bars anchored to the baseline, labels above final heights.
            Each column is tappable: selecting it resolves the bar to full
            accent and shows the exact-value tooltip. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: padTop + plotH }}>
          {points.map((p, i) => {
            const isSel = selectedIdx === i;
            return (
              <TouchableOpacity
                key={`${p.label}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.fullLabel ?? p.label}: ${currency ? formatCurrency(p.value) : p.value}${isSel ? ', selected' : ''}`}
                accessibilityState={{ selected: isSel }}
                activeOpacity={0.7}
                onPress={() => {
                  hapticSelect();
                  setSelected(isSel ? null : i);
                }}
                style={{ flex: 1, minWidth: 0, height: padTop + plotH, justifyContent: 'flex-end', alignItems: 'center' }}>
                {isSel ? (
                  <BarTooltip
                    bottom={Math.min(barH(p.value) + 8, padTop + plotH - 24)}
                    color={colors.ink}
                    surface={colors.surface}
                    border={colors.rule}
                    radius={radius.pill}
                    text={`${p.fullLabel ?? p.label} · ${currency ? formatCurrency(p.value) : p.value}`}
                  />
                ) : (
                  <AnimBarValue
                    appear={appear}
                    bottom={barH(p.value) + 6}
                    color={vColor}
                    from={0.55 + (i / Math.max(1, points.length - 1)) * 0.25}
                    text={currency ? chartMoney(p.value) : String(p.value)}
                  />
                )}
                <AnimBar
                  barH={barH(p.value)}
                  fill={emphasized === i ? fill : `${fill}CC`}
                  delay={i * 70}
                  width="82%"
                />
              </TouchableOpacity>
            );
          })}
        </View>
        {/* Baseline rule */}
        <View style={{ height: 1, backgroundColor: gColor }} />
        {/* X labels: one per column, centred, never overlapping */}
        <View style={{ flexDirection: 'row', gap: 10, height: axisH, marginTop: 4 }}>
          {points.map((p, i) => (
            <View key={`label-${p.label}-${i}`} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
              <Text numberOfLines={1} style={[type.caption, { color: lColor, fontSize: 12 }]}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.caption, { color: cColor }]}>
          {`${points[sorted]?.fullLabel}: ${currency ? formatCurrency(points[sorted]?.value ?? 0) : points[sorted]?.value}`}
        </Text>
        {currency && <Text style={[type.caption, { color: sColor }]}>Verified funds only</Text>}
      </View>
    </View>
  );
}
