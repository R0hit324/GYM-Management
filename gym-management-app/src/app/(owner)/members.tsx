/**
 * Owner members list — the Members tab destination.
 *
 * Fino owner theme: dark charcoal ground, white page title, light panel
 * with the shared dot pattern, solid white cards. A register of every
 * membership on the books: demo records in demo mode, the authorised
 * v_member_status rows in live mode. Search, status text, locked plan price
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
import { Swap } from '@/components/ui/motion';
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
import { useMembers, usePlans } from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { displayMembershipStatus } from '@/utils/membership';
import { formatDate, formatCurrency, memberDisplayId } from '@/utils/format';
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

  const membersResource = useMembers();
  const plansResource = usePlans();
  const members = membersResource.data;
  const plans = plansResource.data;
  const live = membersResource.isLive;
  const refreshAll = () => {
    membersResource.refresh();
    plansResource.refresh();
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q) || memberDisplayId(m.id).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, query]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Members"
        eyebrow="Member directory"
        subtitle="Every membership on the books"
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={membersResource.status === 'loading'} onRefresh={refreshAll} />}>
        <RiseIn style={{ marginTop: spacing.xs }}>
          <SearchBar label="Search members" value={query} onChange={setQuery} placeholder="Name or member ID" />
        </RiseIn>

        {membersResource.status === 'error' && (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <ErrorState
              title="Members could not load"
              message={membersResource.error ?? 'The member register is unavailable right now.'}
              onRetry={refreshAll}
            />
          </RiseIn>
        )}

        {membersResource.status === 'loading' && members.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={5} />
          </RiseIn>
        ) : rows.length === 0 ? (
          <Swap swapKey={query}>
            <OwnerEmptyState
              icon="people-outline"
              title="No one matches"
              hint="Try a shorter search or clear it."
              actionLabel="Clear search"
              onAction={() => setQuery('')}
            />
          </Swap>
        ) : (
          <Swap swapKey={query} style={{ marginTop: 0 }}>
            <RiseIn index={1}>
              <OwnerSection title={`${rows.length} ${rows.length === 1 ? 'member' : 'members'}`}>
              <OwnerListGroup label="All members">
                {rows.map((m, i) => {
                  const plan = plans.find((p) => p.id === m.planId);
                  const status = displayMembershipStatus(m);
                  return (
                    <View key={m.id}>
                      {i > 0 && <OwnerRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={`${memberDisplayId(m.id)} · ${plan?.name ?? m.planId} · ${m.priceLocked > 0 ? `${formatCurrency(m.priceLocked)} locked` : 'no locked price yet'} · ${m.membershipEnd ? `${status === 'expired' ? 'expired' : 'ends'} ${formatDate(m.membershipEnd)}` : 'no end date recorded'}`}
                        status={<OwnerStatusText label={statusLabel[status]} tone={statusTone[status]} />}
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
              </OwnerSection>
            </RiseIn>
          </Swap>
        )}

        <AppText variant="caption" align="center" style={{ marginTop: spacing.lg, color: colors.ownerInkSubtle }}>
          Renewals and fee records are raised at reception; this list is the owner&apos;s read-only view of the register.
        </AppText>
      </OwnerScreen>
      <OwnerBottomNavigation active="members" />
    </View>
  );
}
