/**
 * Auth group: login, joining, verification, MFA, recovery and success.
 * No headers; each screen is a full surface. Motion: screens crossfade (a
 * soft switch between auth surfaces; the Nexa design itself is untouched).
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper }, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="join" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="mfa" />
      <Stack.Screen name="mfa-enroll" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
