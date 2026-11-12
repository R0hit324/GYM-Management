/**
 * ChartCard: the one chart presentation shell (V5 Coach Board — audit
 * problem #5). Title + optional measured delta chip in the header, the
 * polished chart in the body, consistent captioning. Charts stay plain,
 * labelled and honest: the delta must be computed by the caller.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { DeltaPill, StatDelta } from '@/components/ui/stat-tile';
import { useTokens } from '@/hooks/use-tokens';

export function ChartCard(props: {
  title: string;
  delta?: StatDelta;
  caption?: string;
  children: ReactNode;
}) {
  const tokens = useTokens();
  const { spacing } = tokens;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading">{props.title}</AppText>
        {props.delta && <DeltaPill delta={props.delta} />}
      </View>
      {props.children}
      {props.caption && (
        <AppText variant="caption" tone="subtle">
          {props.caption}
        </AppText>
      )}
    </View>
  );
}
