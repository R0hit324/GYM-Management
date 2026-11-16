/**
 * Owner workspace: overview dashboard, members, everyday report, lost
 * members. Chrome moved from NativeTabs to the Fino-style floating
 * OwnerBottomNavigation rendered per screen; the routes and every screen's
 * content stay exactly as they were.
 *
 * Motion: pushes glide with the shared arrival easing (slightly longer than
 * the platform default, exits faster) — a Vanguard-style smooth slide that
 * stays native under the hood (react-native-screens).
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function OwnerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.paper },
        // Vanguard motion: screens slide in from the right rather than the
        // stock push (platform-native timing; the forked Stack in Expo
        // Router SDK 58 does not expose custom Android transition specs).
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="members" />
      <Stack.Screen name="report" />
      <Stack.Screen name="lost" />
    </Stack>
  );
}
