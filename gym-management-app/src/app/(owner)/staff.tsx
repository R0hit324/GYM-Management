/**
 * Owner staff administration (WS-5).
 *
 * Owners manage Receptionist accounts only. There is no create-owner,
 * promote or role-change control anywhere on this screen — the server has
 * no such path. Every mutation goes through an owner + AAL2 server
 * authority and writes an audit row:
 *
 *   create      → staff-admin Edge Function → admin_register_staff
 *   deactivate  → Edge Function (DB switch first, then GoTrue ban)
 *   activate    → Edge Function (unban, then DB switch)
 *
 * Deactivation is an immediate database-level authorisation revocation:
 * `profiles.is_active = false` makes app_profile_role()/require_role() deny
 * the account on its next request. The GoTrue ban additionally blocks new
 * sign-in and refresh. GoTrue has no logout-by-user endpoint, so already
 * issued access tokens are denied by the database rather than wiped.
 *
 * Demo mode is read-only and honestly empty: the directory is produced by
 * the server, so no sample staff list is invented.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerBottomNavigation,
  OwnerEmptyState,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerScreen,
  OwnerSection,
  OwnerStatusText,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';
import { useStaffDirectory } from '@/services/data';
import {
  canActivateStaff,
  canDeactivateStaff,
  createStaffAccount,
  hasStaffDraftErrors,
  normaliseStaffDraft,
  setStaffActive,
  staffAccessLabel,
  staffRoleLabel,
  validateStaffDraft,
  type StaffDraft,
  type StaffDraftErrors,
} from '@/services/staff';
import type { StaffAccount } from '@/types/domain';
import { formatDate } from '@/utils/format';

const emptyDraft: StaffDraft = { displayName: '', email: '', phone: '', password: '' };

function accessDetail(account: StaffAccount): string {
  const last = account.lastSignInAt
    ? `Last sign-in ${formatDate(account.lastSignInAt)}`
    : 'Never signed in';
  return `${staffRoleLabel(account.role)} · ${last}`;
}

export default function OwnerStaffScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const { session } = useAuth();

  const directory = useStaffDirectory();
  const live = directory.isLive;
  const accounts = directory.data;
  const loading = directory.status === 'loading';
  const hasError = directory.status === 'error';

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<StaffDraft>(emptyDraft);
  const [draftErrors, setDraftErrors] = useState<StaffDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [selected, setSelected] = useState<StaffAccount | null>(null);
  const [managing, setManaging] = useState<{ account: StaffAccount; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const ordered = useMemo(() => {
    const rank = (role: StaffAccount['role']) => (role === 'owner' ? 0 : 1);
    return [...accounts].sort((a, b) => {
      if (rank(a.role) !== rank(b.role)) return rank(a.role) - rank(b.role);
      return a.displayName.localeCompare(b.displayName);
    });
  }, [accounts]);

  const activeCount = ordered.filter((account) => account.isActive).length;
  const receptionistCount = ordered.filter((account) => account.role === 'receptionist').length;

  const refresh = () => directory.refresh();

  const openCreate = () => {
    setDraft(emptyDraft);
    setDraftErrors({});
    setServerError(null);
    setActionError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (busy || !live) return;
    const errors = validateStaffDraft(draft);
    setDraftErrors(errors);
    if (hasStaffDraftErrors(errors)) return;

    setBusy(true);
    setServerError(null);
    const value = normaliseStaffDraft(draft);
    const outcome = await createStaffAccount(value);
    setBusy(false);

    if (!outcome.ok) {
      setServerError(outcome.error);
      return;
    }

    setCreateOpen(false);
    setNotice(
      `${value.displayName} was created as a Receptionist. Share the temporary password you set over a secure channel. On first sign-in they must enrol an authenticator before the workspace opens. The server wrote a staff.created audit entry.`,
    );
    setNoticeOpen(true);
    refresh();
  };

  const confirmManage = async () => {
    if (!managing || busy || !live) return;
    const { account, active } = managing;
    setBusy(true);
    setActionError(null);

    const outcome = await setStaffActive(account, active, session?.userId ?? null);
    setBusy(false);

    if (!outcome.ok) {
      setActionError(outcome.error);
      setManaging(null);
      return;
    }

    setManaging(null);
    setSelected(null);
    const blocked = outcome.data.sessionsBlocked === true;
    const base = active
      ? `${account.displayName}'s access is restored. A staff.activated audit entry was written by the database.`
      : blocked
        ? `${account.displayName} is deactivated. The database denies the account immediately, the auth-side ban blocks new sign-in and refresh, and a staff.deactivated audit entry was written.`
        : `${account.displayName} is deactivated and denied by the database. The auth-side session block could not be confirmed, so existing access tokens are denied by the database and expire normally. A staff.deactivated audit entry was written.`;
    setNotice(outcome.warning ? `${base}\n\n${outcome.warning}` : base);
    setNoticeOpen(true);
    refresh();
  };

  const manageLabel = (account: StaffAccount): string | null => {
    if (!live) return null;
    if (canActivateStaff(account, session?.userId ?? null)) return 'Activate access';
    if (canDeactivateStaff(account, session?.userId ?? null)) return 'Deactivate access';
    return null;
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Staff accounts"
        eyebrow="Administration"
        subtitle={
          live
            ? 'Receptionist accounts, access state and audited changes'
            : 'Demo mode — the staff directory is server-produced'
        }
        demo={!live}
        actions={<SignOut />}
        refreshControl={
          live ? <DataRefreshControl refreshing={loading} onRefresh={refresh} /> : undefined
        }>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Staff accounts could not load"
              message={directory.error ?? 'The staff directory is unavailable right now.'}
              onRetry={refresh}
            />
          </RiseIn>
        )}

        {live && loading && accounts.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Only Receptionist accounts are created here. Owner accounts are never created, promoted, modified or deactivated from this screen, and an owner cannot change their own status. Every change is an owner-only, AAL2-gated server action with an audit entry. Deactivation denies the account at the database immediately; GoTrue exposes no logout-by-user endpoint, so already-issued tokens are denied rather than wiped.'
                : 'Demo mode is read-only. The live directory is produced by the server, so no sample staff list is shown. Creation and access changes are performed only by the audited authority functions in live mode.'}
            </AppText>
          </OwnerWell>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <OwnerSection
            title={`Staff — ${ordered.length} on record · ${activeCount} active`}
            action={
              <Button
                label="Add receptionist"
                size="small"
                variant="secondary"
                icon="person-add-outline"
                disabled={!live || busy}
                onPress={openCreate}
              />
            }>
            {ordered.length === 0 ? (
              <OwnerEmptyState
                icon="people-outline"
                title={live ? 'No staff accounts returned' : 'No live staff directory in demo'}
                hint={
                  live
                    ? 'The directory is owner-only and AAL2-gated. If this is unexpected, refresh or check that your owner account has a verified authenticator.'
                    : 'Run the app in live mode with an owner account to manage staff. Nothing here is simulated.'
                }
                actionLabel={live ? 'Refresh' : undefined}
                onAction={live ? refresh : undefined}
              />
            ) : (
              <OwnerListGroup>
                {ordered.map((account, index) => (
                  <View key={account.userId}>
                    {index > 0 && <OwnerRowDivider />}
                    <OwnerListRow
                      title={account.displayName}
                      detail={`${account.email || 'No email on record'} · ${accessDetail(account)}`}
                      status={
                        <OwnerStatusText
                          label={account.isActive ? 'Active' : 'Deactivated'}
                          tone={account.isActive ? 'up' : 'warning'}
                        />
                      }
                      meta={
                        <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                          {staffAccessLabel(account)}
                        </AppText>
                      }
                      chevron
                      onPress={() => {
                        setActionError(null);
                        setSelected(account);
                      }}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}

            {actionError && (
              <AppText variant="caption" style={{ color: colors.dangerStrong, marginTop: spacing.xs }}>
                The server refused the change: {actionError}
              </AppText>
            )}
          </OwnerSection>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.md }}>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Staff authentication is mandatory MFA. A new Receptionist cannot enter the workspace
              until they enrol an authenticator and reach AAL2. Creating an account never creates an
              Owner: the database hard-codes the Receptionist role and there is no role parameter.
              There are {receptionistCount} receptionist
              {receptionistCount === 1 ? '' : 's'} on record.
            </AppText>
          </OwnerWell>
        </RiseIn>
      </OwnerScreen>

      {/* Inspect one account */}
      <ModalSheet
        visible={selected !== null}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title={selected?.displayName ?? 'Staff account'}
        subtitle={selected ? staffRoleLabel(selected.role) : undefined}>
        {selected ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ gap: spacing['3xs'] }}>
              <DetailLine label="Email" value={selected.email || 'Not on record'} />
              <DetailLine label="Phone" value={selected.phone || 'Not on record'} />
              <DetailLine label="Access" value={staffAccessLabel(selected)} />
              <DetailLine label="Created" value={formatDate(selected.createdAt)} />
              <DetailLine
                label="Last sign-in"
                value={selected.lastSignInAt ? formatDate(selected.lastSignInAt) : 'Never'}
              />
            </View>

            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {selected.role === 'owner'
                ? 'Owner accounts are provisioned outside staff administration and cannot be deactivated or modified here.'
                : selected.userId === session?.userId
                  ? 'You cannot change the status of your own account.'
                  : 'Deactivation denies every database request immediately. The auth-side ban blocks new sign-in and refresh; already-issued tokens are denied and expire normally.'}
            </AppText>

            {manageLabel(selected) ? (
              <Button
                label={manageLabel(selected)!}
                fullWidth
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  setActionError(null);
                  setManaging({ account: selected, active: !selected.isActive });
                }}
              />
            ) : null}
            <Button
              label="Close"
              fullWidth
              variant="secondary"
              disabled={busy}
              onPress={() => setSelected(null)}
            />
          </View>
        ) : null}
      </ModalSheet>

      {/* Create a receptionist */}
      <ModalSheet
        visible={createOpen}
        onClose={() => {
          if (!busy) setCreateOpen(false);
        }}
        title="New receptionist"
        subtitle="The role is fixed by the server">
        <View style={{ gap: spacing.sm }}>
          <TextField
            label="Full name"
            placeholder="Front desk name"
            value={draft.displayName}
            onChangeText={(value) => {
              setDraft((prev) => ({ ...prev, displayName: value }));
              setDraftErrors((prev) => ({ ...prev, displayName: undefined }));
            }}
            error={draftErrors.displayName}
            editable={!busy}
          />
          <TextField
            label="Email address"
            placeholder="reception@yourgym.example"
            keyboardType="email-address"
            autoCapitalize="none"
            inputMode="email"
            value={draft.email}
            onChangeText={(value) => {
              setDraft((prev) => ({ ...prev, email: value }));
              setDraftErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={draftErrors.email}
            editable={!busy}
          />
          <TextField
            label="Phone (optional)"
            placeholder="+91…"
            keyboardType="phone-pad"
            inputMode="tel"
            value={draft.phone}
            onChangeText={(value) => {
              setDraft((prev) => ({ ...prev, phone: value }));
              setDraftErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            error={draftErrors.phone}
            editable={!busy}
          />
          <TextField
            label="Temporary password"
            placeholder="At least 8 characters"
            secure
            autoComplete="new-password"
            value={draft.password}
            onChangeText={(value) => {
              setDraft((prev) => ({ ...prev, password: value }));
              setDraftErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={draftErrors.password}
            editable={!busy}
          />
          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
            Share this password securely; it is not shown again. The account is created as a
            Receptionist, never an Owner. First sign-in requires authenticator enrolment (AAL2).
          </AppText>
          {serverError && (
            <AppText variant="caption" style={{ color: colors.dangerStrong }}>
              {serverError}
            </AppText>
          )}
          <Button
            label={busy ? 'Creating…' : 'Create receptionist'}
            fullWidth
            disabled={busy}
            onPress={() => void submitCreate()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => setCreateOpen(false)}
          />
        </View>
      </ModalSheet>

      {/* Activate / deactivate confirmation */}
      <ModalSheet
        visible={managing !== null}
        onClose={() => {
          if (!busy) setManaging(null);
        }}
        title={managing?.active ? 'Restore access' : 'Deactivate access'}
        subtitle={managing?.account.displayName}>
        {managing ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="body" style={{ color: colors.ownerInk }}>
              {managing.active
                ? `${managing.account.displayName} will be unblocked at the auth server and their profile will be marked active. They must still complete MFA at sign-in.`
                : `${managing.account.displayName} will be denied by the database immediately. The auth-side ban blocks new sign-in and refresh; already-issued access tokens are denied and expire normally. The action is audited.`}
            </AppText>
            <Button
              label={
                busy
                  ? 'Saving…'
                  : managing.active
                    ? 'Restore access'
                    : 'Deactivate access'
              }
              fullWidth
              variant="secondary"
              disabled={busy}
              onPress={() => void confirmManage()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => setManaging(null)}
            />
          </View>
        ) : null}
      </ModalSheet>

      <ModalSheet
        visible={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title="Staff change recorded"
        subtitle="Applied by the server">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          {notice ?? 'The staff change was recorded.'}
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setNoticeOpen(false)} />
        </View>
      </ModalSheet>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
        {label}
      </AppText>
      <AppText variant="label" style={{ color: colors.ownerInk, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}
