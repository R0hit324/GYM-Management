/**
 * Screen scaffold: paper background, safe area, screen title, demo badge
 * and optional action row, scrolling body with keyboard persistence.
 */
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { DemoBadge } from '@/components/ui/demo-badge';
import { useTokens } from '@/hooks/use-tokens';

export function Screen(props: {
  title: string;
  subtitle?: string;
  demo?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  roleTag?: 'member' | 'reception' | 'owner';
}) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;

  // Ember Night header: white title on the near-black ground, subtle rule
  // beneath; the role chip carries workspace identity.
  const body = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 24 }}>
      {props.children}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.paper, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm,
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderBottomColor: colors.rule,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
              <AppText variant="title">{props.title}</AppText>
              {props.demo && <DemoBadge />}
            </View>
            {props.subtitle && (
              <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
                {props.subtitle}
              </AppText>
            )}
          </View>
          {props.actions && <View style={{ flexDirection: 'row', gap: spacing['3xs'] }}>{props.actions}</View>}
        </View>
        {props.scroll === false ? (
          body
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic">
            {body}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {},
});
