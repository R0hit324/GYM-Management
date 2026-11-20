/**
 * Receptionist workspace routes. Three floating bottom tabs (Home / Members
 * / More) are rendered per screen by WorkspaceBottomNavigation. Motion:
 * peer page changes (tabs and menu sections) crossfade — a page change,
 * not a drill-in — while true detail screens keep the directional push.
 * Every screen sits in the unified Fino chrome.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useWorkspaceGuard } from '@/services/auth';

export default function ReceptionLayout() {
  // RBAC: only a receptionist session (or an explicitly-labelled demo
  // preview) may render these routes; anything else goes back to login.
  useWorkspaceGuard('receptionist');
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.ownerBg },
        // Page change: peer pages crossfade (system-timed, applied to both
        // directions) — the same motion language as the root workspace
        // switch. True detail drill-ins keep the directional push.
        animation: 'fade',
      }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="members" />
      <Stack.Screen name="applications" />
      <Stack.Screen name="more" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="door-qr" />
      <Stack.Screen name="fees" />
      <Stack.Screen name="renewals" />
      <Stack.Screen name="payment-qr" />
      <Stack.Screen name="transaction-history" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="freeze" />
      {/* Detail drill-in from a member row keeps the directional push. */}
      <Stack.Screen name="member-profile" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
