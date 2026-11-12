/**
 * Screen 6 — Renewal list (receptionist).
 *
 * Expiring and expired memberships with contact and follow-up actions.
 * Freeze requests are visible here too: freezes extend validity only when
 * approved (business rule, enforced server-side in later parts).
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/scaffold';import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { SearchBar } from '@/components/ui/search-bar';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { WorkspaceMeta, SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { demoMembers } from '@/data/demo';
import { formatDate, daysBetween } from '@/utils/format';
import type { Member } from '@/types/domain';

const filters = [
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'all', label: 'All' },
];

export default function RenewalsScreen() {
  const tokens = useTokens();
  const { spacing } = tokens;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('expiring');
  const [selected, setSelected] = useState<Member | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoMembers
      .filter((m) => {
        if (filter === 'all') return true;
        if (filter === 'frozen') return m.status === 'frozen';
        // Expiring: ends within 7 days. Expired: end date in the past.
        const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
        if (filter === 'expiring') return end !== null && end >= 0 && end <= 7;
        return end !== null && end < 0;
      })
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q));
  }, [query, filter]);

  return (
    <Screen
      title="Renewals"
      subtitle="Who is running out, and who is already out"
      demo
      roleTag="reception"
      actions={<SignOut />}>
      <WorkspaceMeta role="reception" demo />

      <RiseIn style={{ marginTop: spacing.md }}>
        <SearchBar label="Search renewal members" value={query} onChange={setQuery} placeholder="Name or member ID" />
        <View style={{ marginTop: spacing.xs }}>
          <SegmentedTabs size="small" options={filters} value={filter} onChange={setFilter} />
        </View>
      </RiseIn>

      {retrying ? (
        <ErrorState message="The membership list could not refresh. Nothing was changed." onRetry={() => setRetrying(false)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar-clear-outline"
          title={query ? 'No one matches' : 'Nothing in this bucket'}
          hint={
            query
              ? 'Try a shorter name or the member number.'
              : 'No membership ends in this window. Switch the filter to review other buckets.'
          }
          actionLabel={query ? 'Clear search' : 'Show all'}
          onAction={() => {
            setQuery('');
            setFilter('all');
          }}
        />
      ) : (
        <RiseIn index={1}>
          <Section title={`${rows.length} ${rows.length === 1 ? 'membership' : 'memberships'}`}>
            <ListGroup label="Renewal list">
              {rows.map((m, i) => {
                const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
                const expired = end !== null && end < 0;
                return (
                  <View key={m.id}>
                    {i > 0 && <RowDivider />}
                    <ListRow
                      leading={<MemberAvatar name={m.name} />}
                      title={m.name}
                      detail={
                        m.membershipEnd
                          ? expired
                            ? `Expired ${formatDate(m.membershipEnd)} · ${m.id.replace('m-', 'GB-')}`
                            : `Ends ${formatDate(m.membershipEnd)} · ${end} day${end === 1 ? '' : 's'} left · ${m.id.replace('m-', 'GB-')}`
                          : `No active validity · ${m.id.replace('m-', 'GB-')}`
                      }
                      status={
                        <StatusBadge
                          label={expired ? 'Expired' : m.status === 'frozen' ? 'Frozen' : 'Expiring soon'}
                          tone={expired ? 'danger' : m.status === 'frozen' ? 'info' : 'warning'}
                          small
                        />
                      }
                      chevron
                      onPress={() => setSelected(m)}
                    />
                  </View>
                );
              })}
            </ListGroup>
          </Section>
        </RiseIn>
      )}

      <RiseIn index={2}>
        <Section title="Working the list">
          <View style={{ gap: spacing.xs }}>
            <RowLine
              tone="warning"
              title="Expiring bucket"
              body="Contact early: renewals agreed before the end date keep the member's locked price."
            />
            <RowLine
              tone="danger"
              title="Expired bucket"
              body="Membership stops; attendance shows it. A renewal reactivates after full payment verification."
            />
            <RowLine
              tone="info"
              title="Freeze requests"
              body="Receptionist approves freezes. Only approved freezes extend validity, within limits the owner sets."
            />
          </View>
          <Button label="Reload list" variant="ghost" size="small" icon="refresh-outline" onPress={() => setRetrying(true)} style={{ alignSelf: 'flex-start' }} />
        </Section>
      </RiseIn>

      {/* Member detail sheet */}
      <ModalSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? selected.id.replace('m-', 'GB-') : undefined}
        toneBadge={
          selected ? (
            <StatusBadge
              label={selected.status === 'expired' ? 'Expired' : selected.status}
              tone={selected.status === 'expired' ? 'danger' : selected.status === 'expiring' ? 'warning' : 'success'}
              small
            />
          ) : undefined
        }>
        {selected && (
          <View style={{ gap: spacing.xs }}>
            <DetailLine label="Plan" value={selected.planId.replace('plan-', '')} />
            <DetailLine label="Membership end" value={selected.membershipEnd ? formatDate(selected.membershipEnd) : 'None'} />
            <DetailLine label="Last visit" value={selected.lastAttendance ? formatDate(selected.lastAttendance) : 'None recorded'} />
            <DetailLine label="Locked price" value={`₹${selected.priceLocked.toLocaleString('en-IN')}${selected.discountPct ? ` (${selected.discountPct}% off)` : ''}`} />
            <DetailLine
              label="Follow-up"
              value={
                selected.followUp.status === 'none'
                  ? 'Not contacted yet'
                  : `${selected.followUp.status}${selected.followUp.updatedAt ? ` · ${formatDate(selected.followUp.updatedAt)}` : ''}`
              }
            />
            {selected.followUp.note && (
              <AppText variant="caption" tone="muted">
                Note: {selected.followUp.note}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
              <Button label="Call member" size="small" icon="call-outline" onPress={() => setContactOpen(true)} />
              <Button label="Open fees entry" size="small" variant="secondary" onPress={() => undefined} />
            </View>
            <AppText variant="caption" tone="subtle" style={{ marginTop: spacing.xs }}>
              Contact and follow-up writes are audited staff actions in the real backend.
            </AppText>
          </View>
        )}
      </ModalSheet>

      <ModalSheet
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Contact member"
        subtitle="Demo: no call or message is placed">
        <AppText variant="label" tone="muted">
          In production this opens the phone with the member&apos;s number prefilled and records a follow-up entry with the authenticated receptionist as actor. Clients cannot forge staff follow-ups because the actor always comes from the session.
        </AppText>
      </ModalSheet>

      <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
        A member inactive for 30 straight days without attendance is flagged on the owner&apos;s lost-member list, not silently dropped from this one.
      </AppText>
    </Screen>
  );
}

function RowLine(props: { tone: 'warning' | 'danger' | 'info'; title: string; body: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  const color = {
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  }[props.tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: tokens.spacing.sm,
        padding: tokens.spacing.sm,
        borderRadius: tokens.radius.sm,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.rule,
      }}>
      <View style={{ width: 3, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{props.title}</AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
          {props.body}
        </AppText>
      </View>
    </View>
  );
}

function DetailLine(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" tone="muted">
        {props.label}
      </AppText>
      <AppText variant="label" style={{ fontWeight: '600', textAlign: 'right', flexShrink: 1 }}>
        {props.value}
      </AppText>
    </View>
  );
}
