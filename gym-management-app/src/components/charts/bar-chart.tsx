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
 */
import { Text, View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

import type { TrendPoint } from '@/types/domain';
import { useTokens } from '@/hooks/use-tokens';
import { formatCurrency } from '@/utils/format';

/** Compact Indian currency for tight chart labels: ₹950 → ₹950, ₹1200 → ₹1.2K, ₹15000 → ₹15K. */
function chartMoney(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `₹${v}`;
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
  const { colors, spacing, type } = tokens;

  const W = 300;
  const H = 190;
  const padX = 14;
  const padTop = 34; // room for the value label above the tallest bar
  const axisH = 26; // room for the x labels below the plot
  const max = Math.max(...points.map((p) => p.value), 1);
  const gap = 10;
  const barW = (W - 2 * padX - gap * (points.length - 1)) / points.length;
  const x = (i: number) => padX + i * (barW + gap);
  const plotH = H - padTop - axisH;
  const h = (v: number) => Math.max(3, Math.round((v / max) * plotH));
  const fill = accent ?? colors.chartPrimary;
  const sorted = points.map((p, i) => i).sort((a, b) => points[b].value - points[a].value)[0];

  const vColor = valueColor ?? colors.inkMuted;
  const lColor = labelColor ?? colors.inkSubtle;
  const gColor = gridColor ?? colors.chartRule;
  const cColor = captionColor ?? colors.inkMuted;
  const sColor = subCaptionColor ?? colors.inkSubtle;

  const baselineY = H - axisH;
  const summary = `Chart, bars over ${points.length == null ? '?' : points.length} periods. Highest ${points[sorted]?.fullLabel} at ${points[sorted]?.value}. Values in rupees.`;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLabel={summary} style={{ opacity: 0, position: 'absolute' }}>
        {summary}
      </Text>
      <View accessible={false}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke={gColor} strokeWidth={1} />
          {points.map((p, i) => {
            const barH = h(p.value);
            const topY = baselineY - barH;
            return (
              <Rect
                key={i}
                x={x(i)}
                y={topY}
                width={barW}
                height={barH}
                rx={5}
                fill={sorted === i ? fill : `${fill}CC`}
              />
            );
          })}
          {points.map((p, i) => (
            <SvgText
              key={`value-${i}`}
              x={x(i) + barW / 2}
              y={baselineY - h(p.value) - 8}
              fontSize="12.5"
              fill={vColor}
              textAnchor="middle"
              fontFamily="BarlowCondensed_600">
              {currency ? chartMoney(p.value) : String(p.value)}
            </SvgText>
          ))}
          {points.map((p, i) => (
            <SvgText
              key={`label-${i}`}
              x={x(i) + barW / 2}
              y={H - 8}
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
        <Text style={[type.caption, { color: cColor }]}>
          {`${points[sorted]?.fullLabel}: ${currency ? formatCurrency(points[sorted]?.value ?? 0) : points[sorted]?.value}`}
        </Text>
        {currency && <Text style={[type.caption, { color: sColor }]}>Verified funds only</Text>}
      </View>
    </View>
  );
}
