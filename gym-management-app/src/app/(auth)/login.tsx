/**
 * Screen 1 — Login (shared, three role choices).
 *
 * Security stance (Part 2 implementation): the role chosen on this screen
 * is a UI expectation only. The auth provider validates the password AND
 * the account's immutable role — a member account selecting Owner fails
 * sign-in with one coarse message. Staff then pass an MFA check; members
 * may be asked to verify email/phone before the session is issued. The
 * session role — never this selection — unlocks a workspace (RBAC guards).
 *
 * Provider status: the demo auth provider (mode 'demo') implements the
 * full contract in-memory. Nothing is delivered (no SMS/email) — codes are
 * surfaced in labelled DemoCodeWells, and the preview path stays available
 * and clearly labelled. Swap the provider for the live backend when it
 * lands; this screen's flow does not change.
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
import { Link, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { DemoBadge } from '@/components/ui/demo-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  AuthHeader,
  AuthPanel,
  AuthHeading,
  AuthCard,
  CategorySelector,
  AuthErrorMessage,
  type AuthCategory,
} from '@/components/auth/auth-ui';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '@/hooks/use-tokens';
import { hapticSelect } from '@/utils/haptics';
import { isEmail } from '@/utils/format';
import { demoCredentials, useAuth } from '@/services/auth';
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
  const { provider, completeSignIn, enterPreview } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  const [role, setRole] = useState<Role>('member');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const validate = useCallback((): { email?: string; password?: string } => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!isEmail(email)) next.email = 'That does not look like a valid email.';
    if (!password) next.password = 'Enter your password.';
    else if (password.length < 8) next.password = 'Passwords are at least 8 characters. Re-check and try your account password.';
    return next;
  }, [email, password]);

  const onSubmit = useCallback(async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSubmitError('Check the highlighted fields and try again.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The provider validates the password AND the account's real role;
      // the UI selection is never trusted.
      const result = await provider.signIn(email.trim(), password, role);
      switch (result.status) {
        case 'ok': {
          const done = await completeSignIn(result.pendingAuthId);
          if (done.status === 'ok') {
            router.replace(
              `/success?mode=signin&role=${done.session.role}&name=${encodeURIComponent(done.session.displayName)}` as never,
            );
            return;
          }
          setSubmitError('This sign-in could not be completed. Please try again.');
          break;
        }
        case 'mfa_required':
          router.push(`/mfa?pending=${result.pendingAuthId}&challenge=${result.challenge.challengeId}` as never);
          return;
        case 'mfa_enrollment_required':
          // First staff sign-in: enrol a TOTP factor before any session is
          // reported as signed in. The pending aal1 session grants nothing.
          router.push(
            `/mfa-enroll?pending=${result.pendingAuthId}&email=${encodeURIComponent(result.email)}` as never,
          );
          return;
        case 'verification_required':
          router.push(
            `/verify?pending=${result.pendingAuthId}&missing=${result.missing.join(',')}&email=${encodeURIComponent(email.trim())}` as never,
          );
          return;
        case 'rate_limited':
          setSubmitError(`Too many attempts. For security, wait ${result.retryAfterSeconds}s and try again.`);
          break;
        case 'invalid':
          // One coarse message — never reveals which field was wrong or
          // whether an account exists.
          setSubmitError('Email or password is incorrect for this account. Check them and try again.');
          break;
      }
    } catch {
      setSubmitError('Sign-in is unavailable right now. Try again shortly.');
    }
    setSubmitting(false);
  }, [validate, provider, completeSignIn, role, email, password]);

  const forgot = useCallback(() => router.push('/forgot-password' as never), []);

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
            {/* Entrance: heading → subtitle → category → fields → CTA,
                staggered by the shared RiseIn (40ms steps, once per mount).
                Error banners animate themselves when they mount. */}
            <RiseIn>
              <AuthHeading muted="Welcome " emphasis="back," />
            </RiseIn>
            <RiseIn index={1}>
              <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
                Sign in to continue your fitness journey.
              </AppText>
            </RiseIn>

            {/* Account category — expectation only; the backend verifies role */}
            <RiseIn index={2}>
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
            </RiseIn>

            {/* Security note for staff roles — replays subtly when the
                selection changes (keyed remount, same 40ms rise). */}
            {role !== 'member' && (
              <RiseIn key={role} index={3}>
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
              </RiseIn>
            )}

            {/* Pill fields */}
            <RiseIn index={4}>
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
            </RiseIn>

            {submitError && (
              <View style={{ marginTop: spacing.xs }}>
                <AuthErrorMessage message={submitError} />
              </View>
            )}

            {/* White pill CTA */}
            <RiseIn index={5}>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Button
                label={submitting ? 'Checking details' : 'Sign in'}
                icon={submitting ? undefined : 'log-in-outline'}
                loading={submitting}
                disabled={submitting}
                fullWidth
                variant="primarySoft"
                onPress={() => void onSubmit()}
                accessibilityHint="Runs the full authentication flow: credentials, MFA for staff, verification for unverified accounts."
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
            </RiseIn>

            <RiseIn index={6}>
              <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <DemoBadge label="Demo auth provider" />
                </View>
                <AppText variant="caption" style={{ color: colors.authInkSubtle, textAlign: 'right', flex: 1 }}>
                  Sign-in, MFA, OTP and recovery run against the in-app demo provider.
                </AppText>
              </View>
            </RiseIn>

            {/* Demo accounts: honest, press-to-fill. The demo provider owns
                these identities; a live provider removes this block. */}
            <RiseIn index={7}>
              <AuthCard style={{ marginTop: spacing.sm }}>
                <AppText variant="label" style={{ color: colors.authInk }}>
                  Demo accounts
                </AppText>
                <AppText variant="caption" style={{ color: colors.authInkSubtle, marginTop: 1 }}>
                  Tap one to fill the form. MFA applies to staff.
                </AppText>
                <View style={{ marginTop: spacing.xs, gap: spacing.xxs }}>
                  {demoCredentials.map((cred) => (
                    <PressSurface
                      key={cred.email}
                      accessibilityRole="button"
                      accessibilityLabel={`Fill demo ${cred.role} account ${cred.email}`}
                      onPress={() => {
                        setRole(cred.role);
                        setEmail(cred.email);
                        setPassword(cred.password);
                        setSubmitError(null);
                      }}
                      scaleOnPress={false}
                      hitPadding={spacing.xxs}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.xs,
                        minHeight: 40,
                        padding: spacing.xxs,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: colors.authRule,
                        backgroundColor: colors.authField,
                      }}>
                      <Ionicons
                        name={cred.role === 'owner' ? 'shield-checkmark-outline' : cred.role === 'receptionist' ? 'people-outline' : 'person-outline'}
                        size={16}
                        color={colors.authInkSubtle}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="caption" numberOfLines={1} style={{ color: colors.authInk }}>
                          {cred.email} · {cred.password}
                        </AppText>
                      </View>
                      {cred.mfa && <StatusBadge label="MFA" tone="warning" small />}
                    </PressSurface>
                  ))}
                </View>
              </AuthCard>
            </RiseIn>

            {/* Member registration entry point — minimal text link */}
            <RiseIn index={8}>
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
            </RiseIn>

            <AppText variant="caption" align="center" style={{ color: colors.authInkSubtle, marginTop: spacing.md }}>
              The demo provider keeps everything in memory — nothing is delivered or stored anywhere while no server is connected.
            </AppText>
          </ScrollView>
        </KeyboardAvoidingView>
      </AuthPanel>

      {/* Demo workspace preview */}
      <ModalSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview a workspace"
        subtitle="Demo navigation only. Real sessions are role-gated by the workspace guards."
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
                // Demo preview: explicit, badge-labelled, no session issued.
                enterPreview(r);
                router.replace(openWorkspacePath(r) as never);
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
          Every workspace shows its role tag in the header and a Demo data badge on live numbers. Leaving a preview returns to login.
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
      return '/(owner)/dashboard';
    case 'receptionist':
      return '/(reception)/home';
    default:
      return '/(member)/attendance';
  }
}

export const loginScreenStyles = StyleSheet.create({});
