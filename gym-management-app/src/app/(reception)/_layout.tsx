/**
 * Receptionist workspace routes. Three floating bottom tabs (Home / Members
 * / More) are rendered per screen by WorkspaceBottomNavigation; pushes
 * glide with the shared slide_from_right easing, matching the Owner
 * workspace. Every screen sits in the unified Fino chrome.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function ReceptionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.ownerBg },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="members" />
      <Stack.Screen name="member-profile" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="door-qr" />
      <Stack.Screen name="fees" />
      <Stack.Screen name="renewals" />
      <Stack.Screen name="payment-qr" />
      <Stack.Screen name="transaction-history" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="freeze" />
      <Stack.Screen name="more" />
    </Stack>
  );
}
