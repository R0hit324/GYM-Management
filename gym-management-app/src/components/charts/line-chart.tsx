/**
 * Line chart for attendance trend (chart research: line for time series,
 * fewer than 4 points would be a stat card, more than 6 series visual
 * noise — we hold exactly one series, always labelled, never hue-only).
 * V5 Coach Board polish: soft gradient area fill under the stroke and
 * quiet horizontal gridlines, so the series reads at a glance without
 * becoming decoration.
 *
 * Readability pass (owner light panel): taller plot, a readable semibold
 * value label above every point (accent-toned counts), larger x labels,
 * configurable colours so the chart stays high-contrast on light surfaces.
 * Exact values stay in the accessibility summary and the caption line.
 *
 * Motion pass (Vanguard style): on mount the stroke draws itself across the
 * plot (dash-reveal on the UI thread), then the gradient area, dots and
 * value labels fade in with a per-index stagger. When the data changes the
 * series re-draws quickly (a smooth update, not a full entrance replay).
 * Reduce-motion renders the finished chart immediately. The a11y summary
 * always reads the real values.
 *
 * Interaction: tapping a point (generous invisible hit target) selects it —
 * the dot enlarges and a selection ring draws around it; the caption row
 * swaps smoothly (dip-fade) to the selected period's full label and EXACT
 * value. Tapping the same point again deselects back to the latest-period
 * emphasis. Selection changes never replay the entrance animation.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Easing as ReEasing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EmptyState } from '@/components/ui/feedback';
import { Swap } from '@/components/ui/motion';
import type { TrendPoint } from '@/types/domain';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { Easing, Motion } from '@/constants/theme';
import { hapticSelect } from '@/utils/haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

/** Shared palette for the weekly-attendance LineChart (F-16): the
 * Receptionist dashboard summary, the full register and the owner report
 * render the same trend, so all three share this one configuration and can
 * never drift apart. Values are exactly what each screen used before. */
export function attendanceLineColors(colors: ReturnType<typeof useTokens>['colors']) {
  return {
    accent: colors.ownerCyanDeep,
    valueColor: colors.ownerCyanDeep,
    labelColor: colors.ownerInkMuted,
    gridColor: colors.ownerRule,
    captionColor: colors.ownerInk,
    subCaptionColor: colors.ownerInkSubtle,
    dotFill: colors.ownerPanel,
  } as const;
}

/** The stroke draws on via dash-offset; length is computed from the polyline. */
function AnimStroke(props: { progress: SharedValue<number>; d: string; stroke: string; length: number }) {
  const animated = useAnimatedProps(() => ({
    strokeDashoffset: props.length * (1 - props.progress.value),
  }));
  return (
    <Path
      d={props.d}
      stroke={props.stroke}
      strokeWidth={3}
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={props.length}
      // Static fallback FIRST: if the animated-prop channel ever fails to
      // reach the SVG view, the line still renders fully visible (the
      // animated value below overrides when it works).
      strokeDashoffset={0}
      {...animated}
    />
  );
}

export function LineChart({
  points,
  accent,
  valueColor,
  labelColor,
  gridColor,
  captionColor,
  subCaptionColor,
  dotFill,
}: {
  points: TrendPoint[];
  accent?: string;
  valueColor?: string;
  labelColor?: string;
  gridColor?: string;
  captionColor?: string;
  subCaptionColor?: string;
  dotFill?: string;
}) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, type } = tokens;
  // The newest period is always emphasised; a tap-selection can arrive with Part 2 cohorts.
  const latest = points.length - 1;

  // Entrance/re-data animation. First mount: the stroke draws across the
  // plot at full length. Data change (period/filter): a QUICK re-draw
  // (swap speed) — a smooth update, not a replay of the full entrance.
  // (All hooks run unconditionally — the empty-data early return comes after.)
  const progress = useSharedValue(0);
  const mountedRef = useRef(false);
  const dataKey = points.map((p) => `${p.label}:${p.value}`).join('|');
  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      mountedRef.current = true;
      return;
    }
    const duration = mountedRef.current ? Motion.swap : Motion.chartDraw;
    mountedRef.current = true;
    progress.value = 0;
    const raf = requestAnimationFrame(() => {
      progress.value = withTiming(1, { duration, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, reduce]);

  /** Area fill: appears as the line completes its draw. */
  const areaAnimated = useAnimatedProps(() => ({
    fillOpacity: Math.max(0, Math.min(1, (progress.value - 0.55) / 0.45)),
  }));

  // Tap selection: the emphasised dot follows the selection and falls back
  // to the newest period when nothing is selected. The caption row swaps
  // smoothly to the selected period's full info (animated tooltip read).
  // (Hook runs unconditionally — the empty-data early return comes after.)
  const [selected, setSelected] = useState<number | null>(null);

  // Empty data: say so plainly instead of rendering an invisible chart.
  if (points.length === 0) {
    return (
      <EmptyState
        icon="trending-up-outline"
        title="No attendance recorded yet"
        hint="The trend line appears once a day has been recorded."
      />
    );
  }

  const selectedIdx = selected !== null && selected < points.length ? selected : null;
  const emphasized = selectedIdx ?? latest;

  const W = 300;
  const H = 175;
  const padX = 16;
  const padTop = 26; // room for the value label above the highest point
  const padBottom = 20; // room for the x labels
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values) - Math.round(max * 0.15);
  const x = (i: number) => padX + (i * (W - 2 * padX)) / Math.max(1, points.length - 1);
  const y = (v: number) => padTop + ((max - v) * (H - padTop - padBottom)) / Math.max(1, max - min);

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  // Area fill closes the series down to the baseline; the gradient is the
  // chart's own token hue at low opacity, never a second colour.
  const baselineY = H - padBottom;
  const area = `${d} L${x(latest)},${baselineY} L${x(0)},${baselineY} Z`;
  const stroke = accent ?? colors.chartPrimary;
  // Quiet gridlines at the third points between baseline and plot top.
  const plot = H - padTop - padBottom;
  const grid = [1 / 3, 2 / 3].map((f) => baselineY - plot * f);

  // Polyline length for the dash-reveal (segments + small slack for caps).
  const pathLength = Math.ceil(
    points.slice(1).reduce((sum, p, i) => {
      const dx = x(i + 1) - x(i);
      const dy = y(p.value) - y(points[i].value);
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) + 6,
  );

  const vColor = valueColor ?? colors.inkMuted;
  const lColor = labelColor ?? colors.inkSubtle;
  const gColor = gridColor ?? colors.chartRule;
  const cColor = captionColor ?? colors.inkMuted;
  const sColor = subCaptionColor ?? colors.inkSubtle;
  const innerDot = dotFill ?? colors.surface;

  const summary = `Chart, line. ${points.length} points from ${points[0]?.fullLabel} to ${points[points.length - 1]?.fullLabel}. Lowest ${Math.min(...values)}, highest ${max}. The latest point is ${points[points.length - 1]?.fullLabel}: ${points[points.length - 1]?.value}.`;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLabel={summary} style={{ opacity: 0, position: 'absolute' }}>
        {summary}
      </Text>
      <View accessible={false}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {grid.map((gy) => (
            <Line
              key={gy}
              x1={0}
              y1={gy}
              x2={W}
              y2={gy}
              stroke={gColor}
              strokeWidth={1}
            />
          ))}
          <Line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke={gColor} strokeWidth={1} />
          <AnimatedPath d={area} fill="url(#lineArea)" stroke="none" {...areaAnimated} />
          <AnimStroke progress={progress} d={d} stroke={stroke} length={pathLength} />
          {points.map((p, i) => (
            <AnimDot
              key={`dot-${i}`}
              progress={progress}
              cx={x(i)}
              cy={y(p.value)}
              r={emphasized === i ? 6 : 4}
              fill={emphasized === i ? stroke : innerDot}
              strokeColor={stroke}
            />
          ))}
          {/* Selection ring + generous tap targets. The ring is a STATIC
              prop circle (state change re-renders it) — SVG animated props
              are the unreliable channel identified in the bar-chart fix. */}
          {selectedIdx !== null && points[selectedIdx] && (
            <Circle
              cx={x(selectedIdx)}
              cy={y(points[selectedIdx].value)}
              r={10.5}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
            />
          )}
          {points.map((p, i) => (
            <Circle
              key={`hit-${i}`}
              cx={x(i)}
              cy={y(p.value)}
              r={16}
              fill="transparent"
              onPress={() => {
                hapticSelect();
                setSelected(selectedIdx === i ? null : i);
              }}
            />
          ))}
          {points.map((p, i) => (
            <AnimLabel
              key={`value-${i}`}
              progress={progress}
              x={x(i)}
              y={Math.max(11, y(p.value) - 12)}
              fill={vColor}
              from={0.5 + (i / Math.max(1, points.length - 1)) * 0.3}
              text={String(p.value)}
            />
          ))}
          {points.map((p, i) => (
            <SvgText
              key={`label-${i}`}
              x={x(i)}
              y={H - 5}
              fontSize="11.5"
              fill={lColor}
              textAnchor="middle"
              fontFamily="Barlow_500">
              {p.label}
            </SvgText>
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Caption doubles as the tooltip read: swapping to the selected
            period's full label + exact value with a smooth dip-fade. */}
        <Swap swapKey={selectedIdx ?? -1}>
          <Text style={[type.caption, { color: cColor }]}>
            {selectedIdx !== null && points[selectedIdx]
              ? `${points[selectedIdx].fullLabel}: ${points[selectedIdx].value}`
              : `${points[latest]?.fullLabel}: ${points[latest]?.value}`}
          </Text>
        </Swap>
        <Text style={[type.caption, { color: sColor }]}>Sessions per day</Text>
      </View>
    </View>
  );
}

/** One data point dot that fades in as the line settles. */
function AnimDot(props: { progress: SharedValue<number>; cx: number; cy: number; r: number; fill: string; strokeColor: string }) {
  const animated = useAnimatedProps(() => ({
    fillOpacity: Math.max(0, Math.min(1, (props.progress.value - 0.55) / 0.45)),
    strokeOpacity: Math.max(0, Math.min(1, (props.progress.value - 0.55) / 0.45)),
  }));
  return (
    <AnimatedCircle
      cx={props.cx}
      cy={props.cy}
      r={props.r}
      fill={props.fill}
      stroke={props.strokeColor}
      strokeWidth={2}
      {...animated}
    />
  );
}

/** One point value label that fades in with a per-index stagger.
 * Thresholds are normalised so the LAST label still reaches full opacity. */
function AnimLabel(props: { progress: SharedValue<number>; x: number; y: number; fill: string; text: string; from: number }) {
  const animated = useAnimatedProps(() => ({
    fillOpacity: Math.max(0, Math.min(1, (props.progress.value - props.from) / 0.2)),
  }));
  return (
    <AnimatedSvgText
      x={props.x}
      y={props.y}
      fontSize="12"
      fill={props.fill}
      textAnchor="middle"
      fontFamily="BarlowCondensed_600"
      {...animated}>
      {props.text}
    </AnimatedSvgText>
  );
}
