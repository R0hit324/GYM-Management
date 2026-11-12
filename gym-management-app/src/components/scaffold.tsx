/**
 * Screen scaffold: paper background, safe area, unified PageHeader, demo
 * badge and optional action row, scrolling body with keyboard persistence.
 */
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/ui/page-header';
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

  // Coach Board header: the shared PageHeader — one composition for every
  // screen; the role chip in the body carries workspace identity.
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
        <PageHeader
          title={props.title}
          subtitle={props.subtitle}
          demo={props.demo}
          actions={props.actions}
        />
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
