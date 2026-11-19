/**
 * Workspace header chips + sign-out. Shared across the three role
 * workspaces so they stay one application with role variations, not three
 * products.
 */
import { View } from 'react-native';
import { router } from 'expo-router';

import { IconButton } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { DemoBadge } from '@/components/ui/demo-badge';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';

export type WorkspaceRole = 'member' | 'reception' | 'owner';

const roleTag: Record<WorkspaceRole, { label: string; tone: 'member' | 'reception' | 'owner' }> = {
  member: { label: 'Member view', tone: 'member' },
  reception: { label: 'Reception view', tone: 'reception' },
  owner: { label: 'Owner view', tone: 'owner' },
};

export function WorkspaceMeta(props: { role: WorkspaceRole; demo?: boolean }) {
  const tokens = useTokens();
  const tag = roleTag[props.role];
  return (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
      <StatusBadge label={tag.label} tone={tag.tone} small />
      {props.demo && <DemoBadge small label="Demo session" />}
    </View>
  );
}

export function SignOut() {
  const { session, previewRole, signOut, provider } = useAuth();
  return (
    <IconButton
      name="log-out-outline"
      label={previewRole ? 'Leave the demo preview' : 'Sign out'}
      tone="muted"
      onPress={() => {
        if (provider.mode === 'demo' && previewRole && !session) {
          // Demo preview path: no session to revoke — just leave.
          router.replace('/login' as never);
          return;
        }
        void signOut(); // revokes the session, clears secure storage, routes to login
      }}
    />
  );
}
