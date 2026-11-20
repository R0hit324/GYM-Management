/**
 * Member workspace: the member's fitness home (QR attendance, plan,
 * progress). A single screen in Part 1, so there is no tab bar to show —
 * the screen opens directly in the shared Fino workspace chrome (dark
 * ground, white greeting, light dot-pattern panel), matching the Owner and
 * Receptionist workspaces. Member routes stay exactly as they were.
 */
import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useWorkspaceGuard } from '@/services/auth';

export default function MemberLayout() {
  // RBAC: only a member session may render these routes.
  useWorkspaceGuard('member');
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.ownerBg },
        // Same native push as the Receptionist/Owner workspaces so every
        // in-workspace screen glides from the right, system-timed.
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="attendance" />
      <Stack.Screen name="payments" />
    </Stack>
  );
}
