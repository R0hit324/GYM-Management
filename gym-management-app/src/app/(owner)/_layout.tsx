/**
 * Owner workspace tabs: everyday report, lost member list.
 */
import { NativeTabs } from 'expo-router/native-tabs';
import { useTokens } from '@/hooks/use-tokens';

export default function OwnerLayout() {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <NativeTabs
      backgroundColor={colors.paper}
      tintColor={colors.accent}
      labelStyle={{ selected: { color: colors.accent, fontWeight: '600' }, default: { color: colors.inkMuted } }}>
      <NativeTabs.Trigger name="report">
        <NativeTabs.Trigger.Label>Report</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="insights" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lost">
        <NativeTabs.Trigger.Label>Lost members</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.badge.exclamationmark" md="person_search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
