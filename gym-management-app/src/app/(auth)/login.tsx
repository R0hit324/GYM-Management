/**
 * Screen 1 — Login (shared, three role choices).
 *
 * Security position (enforced in Part 2, but stated here): the role chosen
 * on this screen is a UI expectation only. Authorisation is verified by the
 * backend against the authenticated session; a member account selecting
 * Owner never receives owner permissions. Owner and Receptionist accounts
 * are created by the Owner, never through public registration.
 *
 * Part 1 restriction: no backend is connected. This screen validates
 * locally, never claims a successful sign-in, and offers an explicit demo
 * preview of the workspaces instead.
 *
 * Visual direction: pixel-referenced to the supplied Travel-App screenshot —
 * light dotted upper zone (#F3F3F3) with the centered grey Pulse Gym logo,
 * then a black panel (#050505) with large rounded top corners holding all
 * auth content: two-tone heading, compact category pills, charcoal pill
 * fields, white pill CTA, minimal text links. The workspaces keep the Coach
 * Board system.
 */
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { PressSurface } from '@/components/ui/press-surface';
import { DemoBadge } from '@/components/ui/demo-badge';
import {
  AuthHeader,
  AuthPanel,
  AuthHeading,
  CategorySelector,
  AuthErrorMessage,
  type AuthCategory,
} from '@/components/auth/auth-ui';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '@/hooks/use-tokens';
import { hapticSelect } from '@/utils/haptics';
import { isEmail } from '@/utils/format';
import type { Role } from '@/types/domain';

const roleOrder: Role[] = ['owner', 'receptionist', 'member'];

const roleMeta: Record<Role, { label: string; blurb: string }> = {
  owner: { label: 'Owner', blurb: 'Full administration' },
  receptionist: { label: 'Receptionist', blurb: 'Daily operations' },
  member: { label: 'Member', blurb: 'Own membership' },
};

export default function LoginScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = tokens;

  const [role, setRole] = useState<Role>('member');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);

  const validate = useCallback((): { email?: string; password?: string } => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!isEmail(email)) next.email = 'That does not look like a valid email.';
    if (!password) next.password = 'Enter your password.';
    else if (password.length < 6) next.password = 'Passwords are at least 8 characters. Re-check and try your account password.';
    return next;
  }, [email, password]);

  const onSubmit = useCallback(() => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSubmitError('Check the highlighted fields and try again.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    // No backend exists in Part 1: no navigation to a workspace happens from
    // a "successful" sign-in, because success cannot be verified. We stop
    // loading after a beat and surface the demo path explicitly.
    setTimeout(() => {
      setSubmitting(false);
      setPreviewOpen(true);
    }, 650);
  }, [validate]);

  const forgot = useCallback(() => setRecoverOpen(true), []);

  const roleSummary = useMemo(
    () => `${roleMeta[role].label}: ${roleMeta[role].blurb}`,
    [role],
  );

  const pickRole = useCallback((id: AuthCategory) => {
    hapticSelect();
    setRole(id as Role);
    setSubmitError(null);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.authTop, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {/* Light dotted upper zone + centered grey logo */}
      <AuthHeader />

      {/* Black panel — all auth content lives here */}
      <AuthPanel>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="handled">
            <AuthHeading muted="Welcome " emphasis="back," />
            <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
              Sign in to continue your fitness journey.
            </AppText>

            {/* Account category — expectation only; the backend verifies role */}
            <CategorySelector
              categories={roleOrder.map((r) => ({ id: r as AuthCategory, label: roleMeta[r].label, blurb: roleMeta[r].blurb }))}
              value={role as AuthCategory}
              onChange={pickRole}
              accessibilityHint="Pick what you expect to be. The gym verifies your actual role after sign-in."
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" style={{ color: colors.authInkSubtle, marginTop: spacing.xs }}>
              This is only what you expect to be. The gym verifies your actual role after sign-in.
            </AppText>

            {/* Security note for staff roles */}
            {role !== 'member' && (
              <View
                style={{
                  marginTop: spacing.sm,
                  backgroundColor: colors.infoBg,
                  borderRadius: radius.sm,
                  padding: spacing.sm,
                  flexDirection: 'row',
                  gap: spacing.xs,
                  alignItems: 'flex-start',
                }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} style={{ marginTop: spacing['3xs'] }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" style={{ color: colors.infoOnBg }}>
                    {role === 'owner'
                      ? 'Owner access needs multi-factor authentication. Accounts are created by the gym owner, not here.'
                      : 'Receptionist accounts are created by the gym owner, not here. Multi-factor authentication is required.'}
                  </AppText>
                </View>
              </View>
            )}

            {/* Pill fields */}
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <TextField
                label="Email address"
                appearance="auth"
                placeholder={submittedPlaceholder(role)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                leadingIcon="mail-outline"
                accentColor={colors.authAccent}
                accessibilityHint={roleSummary}
              />
              <TextField
                label="Password"
                appearance="auth"
                placeholder="Password"
                secure
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                leadingIcon="lock-closed-outline"
                accentColor={colors.authAccent}
              />
              <PressSurface
                accessibilityRole="button"
                onPress={forgot}
                scaleOnPress={false}
                hitPadding={spacing.xs}
                style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="label" style={{ color: colors.authInkMuted }}>
                  Forgot password?
                </AppText>
              </PressSurface>
            </View>

            {submitError && (
              <View style={{ marginTop: spacing.xs }}>
                <AuthErrorMessage message={submitError} />
              </View>
            )}

            {/* White pill CTA */}
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Button
                label={submitting ? 'Checking details' : 'Sign in'}
                icon={submitting ? undefined : 'log-in-outline'}
                loading={submitting}
                disabled={submitting}
                fullWidth
                variant="primarySoft"
                onPress={onSubmit}
                accessibilityHint="Sign-in is not connected to a server in this preview."
              />
              {/* Minimal text links (reference avoids outlined buttons) */}
              <PressSurface
                accessibilityRole="button"
                onPress={() => setPreviewOpen(true)}
                scaleOnPress={false}
                hitPadding={spacing.xs}
                style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="label" style={{ color: colors.authInkMuted }}>
                  Preview the workspaces (demo)
                </AppText>
              </PressSurface>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <DemoBadge label="No server connected" />
              </View>
              <AppText variant="caption" style={{ color: colors.authInkSubtle, textAlign: 'right', flex: 1 }}>
                Sign-in, OTP and payments arrive with the backend in Parts 2 to 4.
              </AppText>
            </View>

            {/* Member registration entry point — minimal text link */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.authRule,
                paddingTop: spacing.sm,
                marginTop: spacing.md,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>
                <AppText variant="label" style={{ color: colors.authInkMuted }}>
                  New to the gym?
                </AppText>
                <Link href="/join" asChild>
                  <PressSurface
                    accessibilityRole="link"
                    hitPadding={spacing.xs}
                    scaleOnPress={false}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText variant="label" style={{ color: colors.authInk, fontWeight: '600' }}>
                      Join as a member
                    </AppText>
                  </PressSurface>
                </Link>
              </View>
              <AppText variant="caption" align="center" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
                Members join online. Staff accounts are issued by the owner.
              </AppText>
            </View>

            <AppText variant="caption" align="center" style={{ color: colors.authInkSubtle, marginTop: spacing.md }}>
              Sessions, password recovery and account security land in Part 2. Nothing on this screen is sent anywhere.
            </AppText>
          </ScrollView>
        </KeyboardAvoidingView>
      </AuthPanel>

      {/* Demo workspace preview */}
      <ModalSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview a workspace"
        subtitle="Demo navigation only. Role-based access is enforced by the backend in Part 2."
        surface="auth">
        <AppText variant="label" style={{ color: colors.authInkMuted }}>
          No sign-in happened. These open read-only, sample-data versions of the role workspaces so every screen can be reviewed.
        </AppText>
        <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          {roleOrder.map((r) => (
            <PressSurface
              key={r}
              accessibilityRole="button"
              onPress={() => {
                setPreviewOpen(false);
                openWorkspace(r);
              }}
              scaleOnPress={false}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.authRule,
                backgroundColor: colors.authField,
                minHeight: 60,
              }}>
              <Ionicons name="business-outline" size={20} color={colors.authInk} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ color: colors.authInk }}>
                  {roleMeta[r].label}
                </AppText>
                <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                  {openWorkspacePath(r).replace('/(', '').replace(')', '')} · demo data
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.authInkSubtle} />
            </PressSurface>
          ))}
        </View>
        <AppText variant="caption" style={{ color: colors.authInkSubtle, marginTop: spacing.sm }}>
          Every workspace shows its role tag in the header and a Demo data badge on live numbers.
        </AppText>
      </ModalSheet>

      {/* Password recovery: honest placeholder */}
      <ModalSheet
        visible={recoverOpen}
        onClose={() => setRecoverOpen(false)}
        title="Forgot password"
        subtitle="Secure recovery flow arrives in Part 2"
        surface="auth">
        <AppText variant="body" style={{ color: colors.authInk }}>
          Passwords are not reset in this preview. The real flow uses a signed email step, rate limits and account recovery with the gym&apos;s help desk.
        </AppText>
        <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing.xs }}>
          Members: talk to the reception desk. Staff: contact the Owner.
        </AppText>
      </ModalSheet>
    </View>
  );
}

function submittedPlaceholder(role: Role) {
  return role === 'owner' ? 'owner@yourgym.example' : 'you@example.com';
}

/** Demo-only role routing paths. Explicit about being a preview. */
function openWorkspacePath(role: Role) {
  switch (role) {
    case 'owner':
      return '/(owner)/report';
    case 'receptionist':
      return '/(reception)/attendance';
    default:
      return '/(member)/attendance';
  }
}

function openWorkspace(role: Role) {
  router.replace(openWorkspacePath(role) as never);
}

export const loginScreenStyles = StyleSheet.create({});
