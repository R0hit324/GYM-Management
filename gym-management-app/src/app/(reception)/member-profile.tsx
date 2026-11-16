/**
 * Full Member Profile — the Receptionist's central place for one member.
 *
 * Every section derives from the shared demo-labelled records (Part 1 has
 * no backend); fields the data model does not carry (photo, date of
 * birth, gender, address, emergency contact, plan/renewal history,
 * freeze history) render honest "not recorded" lines — never invented.
 *
 * Section map (brief layout): Header · Contact (call/email where the
 * device supports it) · Membership · Payments & Fees · Attendance ·
 * Membership History · Quick Actions. Contact edits are the receptionist's
 * one permitted write here, staged in the session store with an explicit
 * demo caption; membership state is never edited from this screen.
 *
 * Opened with ?id=<member id> from the Members list; links hand the same
 * id to Collect Payment (?member=) and the Attendance Register (?member=).
 */
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { Button, IconButton } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceWell,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendance, demoMemberHistory, demoPlans } from '@/data/demo';
import { useSessionMembers, useSessionPayments, updateSessionMember } from '@/data/session';
import { displayMembershipStatus } from '@/utils/membership';
import { paymentStatusInfo } from '@/utils/payment';
import { formatCurrency, formatDate, formatTime, isSameLocalDay, pluralise } from '@/utils/format';
import type { Member, MembershipStatus } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const statusBadgeTone: Record<MembershipStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  active: 'success',
  expiring: 'warning',
  expired: 'danger',
  frozen: 'neutral',
  pendingPayment: 'info',
};

const statusLabel: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  frozen: 'Frozen',
  pendingPayment: 'Payment pending',
};

/** Opens a device URL where supported; failures are swallowed honestly —
 * the OS decides whether a handler exists, and this demo never fakes a
 * successful call or email. */
function openDeviceUrl(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

export default function MemberProfileScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const params = useLocalSearchParams<{ id?: string }>();
  const members = useSessionMembers();
  const payments = useSessionPayments();

  const member: Member | null = useMemo(
    () => members.find((m) => m.id === params.id) ?? null,
    [members, params.id],
  );

  // Contact edit (the one permitted write) stages in the session store.
  const [editOpen, setEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const plan = member ? demoPlans.find((p) => p.id === member.planId) ?? null : null;
  const memberPayments = useMemo(
    () => (member ? payments.filter((p) => p.memberId === member.id) : []),
    [member, payments],
  );
  const memberAttendance = useMemo(
    () => (member ? [...demoAttendance, ...demoMemberHistory].filter((e) => e.memberId === member.id) : []),
    [member],
  );

  if (!member) {
    return (
      <View style={{ flex: 1 }}>
        <WorkspaceScreen title="Member profile" eyebrow="Member directory" subtitle="Member not found" demo actions={<SignOut />}>
          <RiseIn>
            <OwnerEmptyState
              icon="person-outline"
              title="No member matches that link"
              hint="The member record for this profile could not be found. Return to the Members tab and search again."
              actionLabel="Back to Members"
              onAction={() => router.navigate('/(reception)/members' as never)}
            />
          </RiseIn>
        </WorkspaceScreen>
        <WorkspaceBottomNavigation active="members" items={navItems} />
      </View>
    );
  }

  const memberIdDisplay = member.id.replace('m-', 'GB-').toUpperCase();
  const status = displayMembershipStatus(member);
  const attendedToday = memberAttendance.filter((e) => isSameLocalDay(e.checkedInAt) && e.status !== 'failed');
  const verifiedPayments = memberPayments.filter((p) => p.state === 'verified');
  const pendingPayments = memberPayments.filter((p) => p.state === 'awaitingVerification');
  const verifiedTotal = verifiedPayments.reduce((s, p) => s + p.payable, 0);
  const pendingTotal = pendingPayments.reduce((s, p) => s + p.payable, 0);

  // Attendance days = unique calendar days with a recorded (non-failed)
  // check-in; events = every record. Distinct on purpose.
  const attendanceDays = new Set(
    memberAttendance.filter((e) => e.status !== 'failed').map((e) => e.checkedInAt.slice(0, 10)),
  ).size;

  const openEdit = () => {
    setEditPhone(member.phone);
    setEditEmail(member.email);
    setEditError(null);
    setEditOpen(true);
  };

  const saveEdit = () => {
    const phone = editPhone.trim();
    const email = editEmail.trim();
    if (!phone || !email) {
      setEditError('Phone and email are both required.');
      return;
    }
    updateSessionMember(member.id, { phone, email });
    setEditOpen(false);
  };

  const recentAttendance = [...memberAttendance]
    .filter((e) => e.status !== 'failed')
    .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
    .slice(0, 5);

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen title={member.name} eyebrow="Member directory" subtitle={`Member profile · ${memberIdDisplay}`} demo actions={<SignOut />}>
        {/* 1. Profile header */}
        <RiseIn>
          <WorkspaceCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <OwnerMemberAvatar name={member.name} />
              <View style={{ flex: 1 }}>
                <AppText variant="title" style={{ color: colors.ownerInk }}>
                  {member.name}
                </AppText>
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  {memberIdDisplay} · registered {formatDate(member.joinedOn)}
                </AppText>
              </View>
              <StatusBadge label={statusLabel[status]} tone={statusBadgeTone[status]} small />
            </View>
            {attendedToday.length > 0 && (
              <AppText variant="label" style={{ color: colors.ownerSuccessDeep, marginTop: spacing.xs }}>
                Attended today — {pluralise(attendedToday.length, 'check-in', 'check-ins')} recorded
              </AppText>
            )}
          </WorkspaceCard>
        </RiseIn>

        {/* 2. Contact information */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection
            title="Contact"
            action={
              <IconButton name="create-outline" label="Edit contact details" onPress={openEdit} />
            }>
            <WorkspaceCard>
              <DetailRow label="Phone" value={member.phone} />
              <DetailRow label="Email" value={member.email} />
              <DetailRow label="Profile photo" value="Not recorded in this demo" />
              <DetailRow label="Date of birth" value="Not recorded in this demo" />
              <DetailRow label="Gender" value="Not recorded in this demo" />
              <DetailRow label="Address" value="Not recorded in this demo" />
              <DetailRow label="Emergency contact" value="Not recorded in this demo" />
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                <Button
                  label="Call"
                  size="small"
                  variant="secondary"
                  icon="call-outline"
                  onPress={() => openDeviceUrl(`tel:${member.phone.replace(/[^\d+]/g, '')}`)}
                />
                <Button
                  label="Email"
                  size="small"
                  variant="secondary"
                  icon="mail-outline"
                  onPress={() => openDeviceUrl(`mailto:${member.email}`)}
                />
              </View>
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                Call and email open the device&apos;s own apps where the device supports them. Only fields that exist in the member record are shown.
              </AppText>
            </WorkspaceCard>
          </WorkspaceSection>
        </RiseIn>

        {/* 3. Membership */}
        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Membership">
            <WorkspaceCard>
              <DetailRow label="Plan" value={plan?.name ?? member.planId} />
              {plan && <DetailRow label="Plan duration" value={plan.duration === 'halfYearly' ? 'Half yearly' : plan.duration[0].toUpperCase() + plan.duration.slice(1)} />}
              <DetailRow
                label="Locked price"
                value={`${formatCurrency(member.priceLocked)}${member.discountPct ? ` · ${member.discountPct}% off` : ''}`}
              />
              <DetailRow label="Membership start" value={formatDate(member.joinedOn)} />
              <DetailRow
                label="Membership end"
                value={member.membershipEnd ? formatDate(member.membershipEnd) : 'None recorded'}
              />
              <DetailRow label="Status" value={statusLabel[status]} />
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                Membership state is never edited from this screen. Renewals and plan changes happen through their own workflows.
              </AppText>
            </WorkspaceCard>
          </WorkspaceSection>
        </RiseIn>

        {/* 4. Payments & fees */}
        <RiseIn index={3} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Payments & fees">
            <StatRow>
              <OwnerStatTile
                label="Verified payments"
                value={formatCurrency(verifiedTotal)}
                icon="shield-checkmark-outline"
                tone="mint"
              />
              <OwnerStatTile
                label="Pending"
                value={formatCurrency(pendingTotal)}
                icon="hourglass-outline"
                hint={pendingPayments.length > 0 ? `${pluralise(pendingPayments.length, 'entry', 'entries')} awaiting check` : 'Nothing pending'}
                tone="amber"
              />
            </StatRow>
            {memberPayments.length === 0 ? (
              <OwnerEmptyState
                icon="receipt-outline"
                title="No payments on record"
                hint="Payments appear here once they are recorded."
              />
            ) : (
              <OwnerListGroup label="Payment records">
                {memberPayments.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={p.memberName} />}
                      title={`${formatCurrency(p.payable)} · ${p.method.toUpperCase()}`}
                      detail={`${formatDate(p.createdAt)}${p.discountPct ? ` · ${p.discountPct}% off` : ''}${p.utr ? ` · ${p.utr}` : ''}`}
                      status={<OwnerStatusText {...paymentStatusInfo(p.state)} />}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Pending amounts are never counted as verified revenue. The complete history lives on the Transaction History screen.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* 5. Attendance */}
        <RiseIn index={4} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Attendance">
            <StatRow>
              <OwnerStatTile label="Attendance days" value={String(attendanceDays)} hint="Unique days recorded" icon="calendar-outline" tone="cyan" />
              <OwnerStatTile
                label="Attendance events"
                value={String(memberAttendance.filter((e) => e.status !== 'failed').length)}
                hint="Every check-in scan"
                icon="walk-outline"
                tone="violet"
              />
            </StatRow>
            <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
              Last visit: {member.lastAttendance ? `${formatDate(member.lastAttendance)} at ${formatTime(member.lastAttendance)}` : 'No visits recorded'}
            </AppText>
            {recentAttendance.length > 0 && (
              <OwnerListGroup label="Recent check-ins">
                {recentAttendance.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={member.name} />}
                      title={`${formatDate(e.checkedInAt)} · ${formatTime(e.checkedInAt)}`}
                      detail={e.door}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Check-out times are not recorded by the system, so none are shown. The full month-by-month calendar is on the Attendance Register.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* 6. Membership history */}
        <RiseIn index={5} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Membership history">
            <WorkspaceCard>
              <DetailRow label="Freeze status" value={member.status === 'frozen' ? 'Frozen' : 'Not frozen'} />
              <DetailRow
                label="Freeze history"
                value={member.status === 'frozen' ? 'Active freeze on record' : 'No freeze on record'}
              />
              <DetailRow label="Previous plans / renewals" value="Not recorded in this demo" />
              {member.followUp.note && (
                <DetailRow
                  label="Follow-up note"
                  value={`${member.followUp.status === 'none' ? '' : member.followUp.status + ' — '}${member.followUp.note}`}
                />
              )}
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                Renewal history, freeze records and follow-up timelines are written by audited server actions in later parts; this demo shows only what its records carry.
              </AppText>
            </WorkspaceCard>
          </WorkspaceSection>
        </RiseIn>

        {/* 7. Quick actions */}
        <RiseIn index={6} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Quick actions">
            <View style={{ gap: spacing.xs }}>
              <Button
                label="Collect payment"
                icon="cash-outline"
                onPress={() => router.push(`/(reception)/fees?member=${member.id}` as never)}
              />
              <Button
                label="Renew membership"
                variant="secondary"
                icon="calendar-clear-outline"
                onPress={() => router.push('/(reception)/renewals' as never)}
              />
              <Button
                label="Attendance history"
                variant="secondary"
                icon="walk-outline"
                onPress={() => router.push(`/(reception)/attendance?member=${member.id}` as never)}
              />
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Collect Payment opens with this member pre-selected; the Attendance Register opens on this member&apos;s calendar.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={7} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Receptionists may update contact details and collect payments. Membership state, verification and freeze approvals stay with the Owner and the backend.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      {/* Edit contact sheet (permitted details only, staged for the session) */}
      <ModalSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit contact details"
        subtitle="Receptionists may update phone and email">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
            {member.name}
          </AppText>
          <TextField label="Phone" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
          <TextField label="Email" value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
          {editError && (
            <AppText variant="caption" style={{ color: colors.ownerErrorDeep }}>
              {editError}
            </AppText>
          )}
          <Button label="Save contact details" fullWidth onPress={saveEdit} />
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
            This demo stages the edit for the session only — it is not database persistence. In production the backend validates the values and writes an audit entry with the signed-in receptionist as actor.
          </AppText>
        </View>
      </ModalSheet>

      <WorkspaceBottomNavigation active="members" items={navItems} />
    </View>
  );
}

function DetailRow(props: { label: string; value: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
        {props.label}
      </AppText>
      <AppText
        variant="label"
        numberOfLines={props.value.startsWith('Not recorded') ? 1 : undefined}
        style={{
          color: props.value.startsWith('Not recorded') ? colors.ownerInkSubtle : colors.ownerInk,
          fontWeight: props.value.startsWith('Not recorded') ? '400' : '600',
          textAlign: 'right',
          flexShrink: 1,
          marginLeft: 12,
        }}>
        {props.value}
      </AppText>
    </View>
  );
}
