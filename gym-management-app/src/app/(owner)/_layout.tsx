/**
 * Owner workspace: overview dashboard, members, everyday report, lost
 * members, and the administration screens reached from the More hub
 * (applications, plans, settings, audit). Chrome moved from NativeTabs to the
 * Fino-style floating OwnerBottomNavigation rendered per screen; the routes
 * and every screen's content stay exactly as they were.
 *
 * Motion: all routes are bottom-nav peers, so page changes crossfade
 * (system-timed by react-native-screens) — a page change, not a drill-in,
 * the same motion language as the root workspace switch and the
 * Receptionist pages.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useWorkspaceGuard } from '@/services/auth';

export default function OwnerLayout() {
  // RBAC: only an owner session may render these routes.
  useWorkspaceGuard('owner');
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.paper },
        animation: 'fade',
      }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="members" />
      <Stack.Screen name="report" />
      <Stack.Screen name="lost" />
      <Stack.Screen name="more" />
      <Stack.Screen name="applications" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="audit" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
