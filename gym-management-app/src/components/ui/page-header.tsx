/**
 * PageHeader: the ONE header system across every screen (V5 Coach Board —
 * audit problem #1). Large condensed title, optional muted subtitle, demo
 * badge inline with the title, and a right-aligned contextual action row.
 * The member dashboard's greeting header adopts this composition in Stage 5
 * without changing its scroll plumbing.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { DemoBadge } from '@/components/ui/demo-badge';
import { useTokens } from '@/hooks/use-tokens';

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  demo?: boolean;
  actions?: ReactNode;
  /** Bottom rule off by default so wells/cards can sit right beneath. */
  rule?: boolean;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        borderBottomWidth: props.rule === false ? 0 : 1,
        borderBottomColor: colors.rule,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
          <AppText variant="title">{props.title}</AppText>
          {props.demo && <DemoBadge />}
        </View>
        {props.subtitle && (
          <AppText variant="label" tone="muted" style={{ marginTop: spacing['3xs'] }}>
            {props.subtitle}
          </AppText>
        )}
      </View>
      {props.actions && <View style={{ flexDirection: 'row', gap: spacing['3xs'] }}>{props.actions}</View>}
    </View>
  );
}
