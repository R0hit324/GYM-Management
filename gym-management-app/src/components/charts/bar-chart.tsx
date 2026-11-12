/**
 * Bar chart for collections by period. Sorted periods, one accent hue, every
 * bar labelled with its value so meaning never rides on colour alone.
 */
import { Text, View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

import type { TrendPoint } from '@/types/domain';
import { useTokens } from '@/hooks/use-tokens';
import { formatCurrency } from '@/utils/format';

export function BarChart({ points, accent, currency = true }: { points: TrendPoint[]; accent?: string; currency?: boolean }) {
  const tokens = useTokens();
  const { colors, spacing, type } = tokens;

  const W = 300;
  const H = 150;
  const padX = 14;
  const padY = 30;
  const max = Math.max(...points.map((p) => p.value), 1);
  const gap = 10;
  const barW = (W - 2 * padX - gap * (points.length - 1)) / points.length;
  const x = (i: number) => padX + i * (barW + gap);
  const h = (v: number) => ((v / max) * (H - padY - 22)) | 0;
  const fill = accent ?? colors.chartPrimary;
  const sorted = points.map((p, i) => i).sort((a, b) => points[b].value - points[a].value)[0];

  const summary = `Chart, bars over ${points.length == null ? '?' : points.length} periods. Highest ${points[sorted]?.fullLabel} at ${points[sorted]?.value}. Values in rupees.`;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLabel={summary} style={{ opacity: 0, position: 'absolute' }}>
        {summary}
      </Text>
      <View accessible={false}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Line x1={0} y1={H - 22} x2={W} y2={H - 22} stroke={colors.chartRule} strokeWidth={1} />
          {points.map((p, i) => {
            const barH = Math.max(3, h(p.value));
            const topY = H - 22 - barH;
            return (
              <Rect
                key={i}
                x={x(i)}
                y={topY}
                width={barW}
                height={barH}
                rx={4}
                fill={sorted === i ? fill : `${fill}CC`}
              />
            );
          })}
          {points.map((p, i) => (
            <SvgText
              key={`value-${i}`}
              x={x(i) + barW / 2}
              y={H - 26 - Math.max(3, h(p.value))}
              fontSize="9.5"
              fill={colors.inkMuted}
              textAnchor="middle"
              fontFamily="BarlowCondensed_600">
              {p.value >= 1000 ? `${(p.value / 1000).toFixed(1)}k` : String(p.value)}
            </SvgText>
          ))}
          {points.map((p, i) => (
            <SvgText
              key={`label-${i}`}
              x={x(i) + barW / 2}
              y={H - 7}
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
          {`${points[sorted]?.fullLabel}: ${currency ? formatCurrency(points[sorted]?.value ?? 0) : points[sorted]?.value}`}
        </Text>
        {currency && <Text style={[type.caption, { color: colors.inkSubtle }]}>Verified funds only</Text>}
      </View>
    </View>
  );
}
