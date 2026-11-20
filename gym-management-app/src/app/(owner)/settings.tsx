/**
 * Owner gym settings — the singleton configuration row (`app_settings`).
 *
 * Reads through `useGymSettings` and writes only through the owner-gated
 * `update_gym_settings` RPC, which validates the time zone name and the
 * 5–600 second attendance-token bound and writes an audit entry. The UPI ID
 * is a public payment address, never a secret; the app checks its name@bank
 * shape only and never claims the account is verified.
 *
 * The server keeps the current value when a field is left blank (it uses
 * COALESCE), so this screen says so instead of implying a blank field clears
 * anything. Demo mode shows the documented defaults and disables saving.
 */
import { useState } from 'react';
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
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerSection,
  OwnerCard,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { useGymSettings, updateGymSettings } from '@/services/data';
import { isValidUpiId } from '@/utils/upi';

const TOKEN_MIN = 5;
const TOKEN_MAX = 600;

export default function OwnerSettingsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const settingsResource = useGymSettings();
  const live = settingsResource.isLive;
  const settings = settingsResource.data;
  const loading = settingsResource.status === 'loading';
  const hasError = settingsResource.status === 'error';

  // Documented migration defaults, shown read-only in demo mode. Edits live
  // in a draft overlay so the form stays derived (no setState in an effect).
  const [draft, setDraft] = useState<{
    timezone?: string;
    upiId?: string;
    seconds?: string;
  }>({});
  const timezone =
    draft.timezone ?? (live ? (settings?.gymTimezone ?? '') : 'Asia/Kolkata');
  const upiId = draft.upiId ?? (live ? (settings?.upiId ?? '') : '');
  const tokenSeconds =
    draft.seconds ??
    (live && settings ? String(settings.attendanceTokenValiditySeconds) : '60');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const save = async () => {
    if (!live || saving) return;
    const next: Record<string, string | undefined> = {};
    const tz = timezone.trim();
    const upi = upiId.trim();
    const secondsText = tokenSeconds.trim();

    if (!tz) next.timezone = 'Enter the gym time zone, for example Asia/Kolkata.';
    if (upi && !isValidUpiId(upi)) {
      next.upiId = 'That is not a UPI ID format. Use the name@bank shape, for example gym@upi.';
    }
    let seconds: number | null = null;
    if (secondsText) {
      seconds = Number(secondsText);
      if (!Number.isInteger(seconds) || seconds < TOKEN_MIN || seconds > TOKEN_MAX) {
        next.token = `Enter a whole number of seconds between ${TOKEN_MIN} and ${TOKEN_MAX}.`;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setActionError(null);
    setNotice(null);
    setSaving(true);
    const outcome = await updateGymSettings({
      gymTimezone: tz,
      // Blank leaves the stored value untouched (server COALESCE).
      upiId: upi || null,
      attendanceTokenValiditySeconds: seconds ?? undefined,
    });
    setSaving(false);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setSavedOpen(true);
    setNotice(
      'Gym settings saved on the server. The new time zone, UPI ID and token validity apply to subsequent server decisions; the audit entry records you as the actor.',
    );
    settingsResource.refresh();
  };

  const current = settings;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Gym settings"
        eyebrow="Administration"
        subtitle={live ? 'Owner-configured, server-enforced' : 'Documented defaults'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={
          live ? (
            <DataRefreshControl refreshing={loading} onRefresh={settingsResource.refresh} />
          ) : undefined
        }>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Gym settings could not load"
              message={settingsResource.error ?? 'The settings row is unavailable right now.'}
              onRetry={settingsResource.refresh}
            />
          </RiseIn>
        )}
        {live && loading && !settings ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Only the owner may change these values. The server validates the time zone and the 5–600 second QR validity bound, then records an audit entry with you as the actor. Leave a field exactly as it is to keep the stored value.'
                : 'Demo mode has no settings row. The values below are the documented schema defaults and cannot be saved; connect the live backend to read and change the real configuration.'}
            </AppText>
          </OwnerWell>
        </RiseIn>

        {live && current && (
          <RiseIn index={1}>
            <OwnerSection title="Currently stored">
              <OwnerCard>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Time zone
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {current.gymTimezone}
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                  Gym UPI ID
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {current.upiId ?? 'Not configured'}
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                  Attendance QR validity
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {current.attendanceTokenValiditySeconds} seconds
                </AppText>
              </OwnerCard>
            </OwnerSection>
          </RiseIn>
        )}

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <OwnerSection title="Edit settings">
            <OwnerCard>
              <View style={{ gap: spacing.sm }}>
                <TextField
                  label="Gym time zone"
                  value={timezone}
                  onChangeText={(value) => {
                    setDraft((prev) => ({ ...prev, timezone: value }));
                    setErrors((prev) => ({ ...prev, timezone: undefined }));
                  }}
                  error={errors.timezone}
                  helper="An IANA time zone name, for example Asia/Kolkata. The server refuses an unknown name."
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={live && !saving}
                />
                <TextField
                  label="Gym UPI ID"
                  placeholder="name@bank"
                  value={upiId}
                  onChangeText={(value) => {
                    setDraft((prev) => ({ ...prev, upiId: value }));
                    setErrors((prev) => ({ ...prev, upiId: undefined }));
                  }}
                  error={errors.upiId}
                  helper="Public payment address shown on the Payment QR screen. A blank field keeps the current value; the app checks the format only, never the account."
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={live && !saving}
                />
                <TextField
                  label="Attendance QR validity (seconds)"
                  placeholder="60"
                  value={tokenSeconds}
                  onChangeText={(value) => {
                    setDraft((prev) => ({ ...prev, seconds: value }));
                    setErrors((prev) => ({ ...prev, token: undefined }));
                  }}
                  error={errors.token}
                  helper={`Whole seconds between ${TOKEN_MIN} and ${TOKEN_MAX}. A blank field keeps the current value.`}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  editable={live && !saving}
                />
                {current && (
                  <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                    Prices are not set here — plan prices live on Plans and prices and are changed
                    through their own audited action. Currency is fixed to INR.
                  </AppText>
                )}
                {actionError && (
                  <AppText variant="caption" style={{ color: colors.dangerStrong }}>
                    The server refused the change: {actionError}
                  </AppText>
                )}
                <Button
                  label={saving ? 'Saving…' : live ? 'Save settings' : 'Saving is disabled in demo mode'}
                  fullWidth
                  disabled={!live || saving || loading}
                  onPress={() => void save()}
                />
              </View>
            </OwnerCard>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              The UPI ID is a public payment address; no secret or provider credential is stored in
              the app. The QR image stored by an earlier phase is not editable here because no
              storage bucket is configured — that part remains BLOCKED and documented in the release
              readiness report.
            </AppText>
          </OwnerWell>
        </RiseIn>
      </OwnerScreen>

      <ModalSheet
        visible={savedOpen}
        onClose={() => setSavedOpen(false)}
        title="Settings saved"
        subtitle="Recorded by the server">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          {notice ?? 'The gym settings were saved.'}
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setSavedOpen(false)} />
        </View>
      </ModalSheet>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}
