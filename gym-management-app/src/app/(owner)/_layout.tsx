/**
 * Owner workspace: overview dashboard, members, everyday report, lost
 * members. Chrome moved from NativeTabs to the Fino-style floating
 * OwnerBottomNavigation rendered per screen; the routes and every screen's
 * content stay exactly as they were.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function OwnerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="members" />
      <Stack.Screen name="report" />
      <Stack.Screen name="lost" />
    </Stack>
  );
}
