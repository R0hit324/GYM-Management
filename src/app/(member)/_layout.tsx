/**
 * Member workspace tabs. One place for the member in Part 1: QR attendance.
 * (Payments and profile arrive in later parts.)
 */
import { NativeTabs } from 'expo-router/native-tabs';
import { useTokens } from '@/hooks/use-tokens';

export default function MemberLayout() {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <NativeTabs
      backgroundColor={colors.paper}
      tintColor={colors.accent}
      labelStyle={{ selected: { color: colors.accent, fontWeight: '600' }, default: { color: colors.inkMuted } }}>
      <NativeTabs.Trigger name="attendance">
        <NativeTabs.Trigger.Label>Attendance</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="qrcode.viewfinder"
          md="qr_code_scanner"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
