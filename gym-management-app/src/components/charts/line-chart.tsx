/**
 * Line chart for attendance trend (chart research: line for time series,
 * fewer than 4 points would be a stat card, more than 6 series visual
 * noise — we hold exactly one series, always labelled, never hue-only).
 */
import { Text, View } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';

import type { TrendPoint } from '@/types/domain';
import { useTokens } from '@/hooks/use-tokens';

export function LineChart({ points, accent }: { points: TrendPoint[]; accent?: string }) {
  const tokens = useTokens();
  const { colors, spacing, type } = tokens;
  // The newest period is always emphasised; a tap-selection can arrive with Part 2 cohorts.
  const latest = points.length - 1;

  const W = 300;
  const H = 140;
  const padX = 10;
  const padY = 18;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values) - Math.round(max * 0.15);
  const x = (i: number) => padX + (i * (W - 2 * padX)) / Math.max(1, points.length - 1);
  const y = (v: number) => padY + ((max - v) * (H - 2 * padY)) / Math.max(1, max - min);

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const stroke = accent ?? colors.chartPrimary;

  const summary = `Chart, line. ${points.length} points from ${points[0]?.fullLabel} to ${points[points.length - 1]?.fullLabel}. Lowest ${Math.min(...values)}, highest ${max}. The latest point is ${points[points.length - 1]?.fullLabel}: ${points[points.length - 1]?.value}.`;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLabel={summary} style={{ opacity: 0, position: 'absolute' }}>
        {summary}
      </Text>
      <View accessible={false}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Line x1={0} y1={H - padY} x2={W} y2={H - padY} stroke={colors.chartRule} strokeWidth={1} />
          <Path d={d} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={latest === i ? 5 : 3}
              fill={latest === i ? stroke : colors.surface}
              stroke={stroke}
              strokeWidth={2}
            />
          ))}
          {points.map((p, i) => (
            <SvgText
              key={i}
              x={x(i)}
              y={H - 4}
              fontSize="10"
              fill={colors.inkSubtle}
              textAnchor="middle"
              fontFamily="Barlow_500">
              {p.label}
            </SvgText>
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          {`${points[latest]?.fullLabel}: ${points[latest]?.value}`}
        </Text>
        <Text style={[type.caption, { color: colors.inkSubtle }]}>Sessions per day</Text>
      </View>
    </View>
  );
}
