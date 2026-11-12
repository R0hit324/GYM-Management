/**
 * Receptionist workspace tabs: today's attendance, fees entry, renewals.
 */
import { NativeTabs } from 'expo-router/native-tabs';
import { useTokens } from '@/hooks/use-tokens';

export default function ReceptionLayout() {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <NativeTabs
      backgroundColor={colors.paper}
      tintColor={colors.accent}
      labelStyle={{ selected: { color: colors.accent, fontWeight: '600' }, default: { color: colors.inkMuted } }}>
      <NativeTabs.Trigger name="attendance">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.clipboard" md="fact_check" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="fees">
        <NativeTabs.Trigger.Label>Fees</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="indianrupeesign.circle" md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="renewals">
        <NativeTabs.Trigger.Label>Renewals</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="arrow.counterclockwise.circle" md="event_repeat" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
