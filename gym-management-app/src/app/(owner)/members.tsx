/**
 * Owner members list — the Members tab destination.
 *
 * Fino owner theme: dark charcoal ground, white page title, light panel
 * with the shared dot pattern, solid white cards. A register of every
 * membership on the books, built from the shared demo-labelled member
 * records (Part 1: no backend). Search, status text, locked plan price
 * and expiry per row — the price is shown in full because it is locked
 * per subscription. The owner's action paths stay in their existing
 * modules (renewals via reception tooling in Part 2; today the
 * lost-member list owns follow-ups).
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { SearchBar } from '@/components/ui/search-bar';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerStatusText,
  OwnerSection,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerMemberAvatar,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoMembers, demoPlans } from '@/data/demo';
import { formatDate, formatCurrency } from '@/utils/format';
import type { MembershipStatus } from '@/types/domain';

const statusTone: Record<MembershipStatus, 'up' | 'down' | 'neutral' | 'warning' | 'action'> = {
  active: 'up',
  expiring: 'warning',
  expired: 'down',
  frozen: 'neutral',
  pendingPayment: 'action',
};

const statusLabel: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  frozen: 'Frozen',
  pendingPayment: 'Payment pending',
};

export default function OwnerMembersScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoMembers
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Members"
        subtitle="Every membership on the books"
        demo
        actions={<SignOut />}>
        <RiseIn style={{ marginTop: spacing.xs }}>
          <SearchBar label="Search members" value={query} onChange={setQuery} placeholder="Name or member ID" />
        </RiseIn>

        {rows.length === 0 ? (
          <OwnerEmptyState
            icon="people-outline"
            title="No one matches"
            hint="Try a shorter search or clear it."
            actionLabel="Clear search"
            onAction={() => setQuery('')}
          />
        ) : (
          <RiseIn index={1}>
            <OwnerSection title={`${rows.length} ${rows.length === 1 ? 'member' : 'members'}`}>
              <OwnerListGroup label="All members">
                {rows.map((m, i) => {
                  const plan = demoPlans.find((p) => p.id === m.planId);
                  return (
                    <View key={m.id}>
                      {i > 0 && <OwnerRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={`${plan?.name ?? m.planId} · ${formatCurrency(plan?.price ?? 0)} locked · ${m.membershipEnd ? `${m.status === 'expired' ? 'expired' : 'ends'} ${formatDate(m.membershipEnd)}` : 'no end date recorded'}`}
                        status={<OwnerStatusText label={statusLabel[m.status]} tone={statusTone[m.status]} />}
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
            </OwnerSection>
          </RiseIn>
        )}

        <AppText variant="caption" align="center" style={{ marginTop: spacing.lg, color: colors.ownerInkSubtle }}>
          Renewals and fee records are raised at reception; this list is the owner&apos;s read-only view of the register.
        </AppText>
      </OwnerScreen>
      <OwnerBottomNavigation active="members" />
    </View>
  );
}
