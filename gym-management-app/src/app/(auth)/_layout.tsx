/**
 * Auth group: shared login + member joining. No headers; each screen is a
 * full surface.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="join" />
    </Stack>
  );
}
