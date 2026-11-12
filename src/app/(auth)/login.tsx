/**
 * Screen 1 â€” Login (shared, three role choices).
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
 */
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { PressSurface } from '@/components/ui/press-surface';
import { DemoBadge } from '@/components/ui/demo-badge';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '@/hooks/use-tokens';
import { hapticSelect } from '@/utils/haptics';
import { isEmail } from '@/utils/format';
import type { Role } from '@/types/domain';

const roleOrder: Role[] = ['owner', 'receptionist', 'member'];

const roleMeta: Record<Role, { label: string; blurb: string; tone: string }> = {
  owner: { label: 'Owner', blurb: 'Full administration', tone: 'owner' },
  receptionist: { label: 'Receptionist', blurb: 'Daily operations', tone: 'reception' },
  member: { label: 'Member', blurb: 'Own membership', tone: 'member' },
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 8 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* Wordmark */}
        <View style={{ alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.rule,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.sm,
            }}>
            <Ionicons name="barbell" size={28} color={colors.accent} />
          </View>
          <AppText variant="displayXL">
            Pulse <AppText variant="displayXL" style={{ color: colors.accent }}>Gym</AppText>
          </AppText>
          <AppText variant="label" tone="muted">
            Membership and daily operations
          </AppText>
        </View>

        {/* Role selector */}
        <View accessibilityLabel="Account type. Your role is verified by the gym after sign-in.">
          <AppText variant="heading">Sign in as</AppText>
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Pick what you expect to be. The gym verifies your actual role after sign-in.
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
            {roleOrder.map((r, i) => {
              const meta = roleMeta[r];
              const selected = role === r;
              return (
                <PressSurface
                  key={r}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected ? selected : undefined }}
                  accessibilityLabel={`${meta.label}, ${meta.blurb}`}
                  onPress={() => {
                    hapticSelect();
                    setRole(r);
                    setSubmitError(null);
                  }}
                  style={[
                    {
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 2,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      minHeight: 62,
                      backgroundColor: selected ? colors.surfaceAlt : colors.surface,
                      borderColor: selected ? colors.accent : colors.rule,
                    },
                  ]}>
                  <AppText variant="label" style={{ fontWeight: '600', color: selected ? colors.ink : colors.inkMuted }}>
                    {meta.label}
                  </AppText>
                  <AppText variant="caption" tone={selected ? 'muted' : 'subtle'} style={{ fontSize: 11 }}>
                    {meta.blurb}
                  </AppText>
                  {selected && (
                    <Ionicons name="checkmark" size={12} color={colors.accent} />
                  )}
                </PressSurface>
              );
            })}
          </View>
        </View>

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
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: colors.infoOnBg }}>
                {role === 'owner'
                  ? 'Owner access needs multi-factor authentication. Accounts are created by the gym owner, not here.'
                  : 'Receptionist accounts are created by the gym owner, not here. Multi-factor authentication is required.'}
              </AppText>
            </View>
          </View>
        )}

        {/* Fields */}
        <View style={{ marginTop: spacing.lg, gap: spacing['3xs'] }}>
          <TextField
            label="Email address"
            placeholder={submittedPlaceholder(role)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            leadingIcon="mail-outline"
            accessibilityHint={roleSummary}
          />
          <TextField
            label="Password"
            secure
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            leadingIcon="lock-closed-outline"
          />
          <PressSurface accessibilityRole="button" onPress={forgot} scaleOnPress={false} style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="label" tone="accent">
              Forgot password?
            </AppText>
          </PressSurface>
        </View>

        {submitError && (
          <View
            accessibilityRole="alert"
            style={{
              marginTop: spacing.xs,
              backgroundColor: colors.dangerBg,
              borderRadius: radius.sm,
              padding: spacing.sm,
            }}>
            <AppText variant="label" style={{ color: colors.dangerOnBg }}>
              {submitError}
            </AppText>
          </View>
        )}

        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <Button
            label={submitting ? 'Checking details' : 'Sign in'}
            icon={submitting ? undefined : 'log-in-outline'}
            loading={submitting}
            disabled={submitting}
            fullWidth
            onPress={onSubmit}
            accessibilityHint="Sign-in is not connected to a server in this preview."
          />
          <Button
            label="Preview the workspaces (demo)"
            variant="secondary"
            icon="grid-outline"
            fullWidth
            onPress={() => setPreviewOpen(true)}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <DemoBadge label="No server connected" />
          </View>
          <AppText variant="caption" tone="subtle" style={{ textAlign: 'right', flex: 1 }}>
            Sign-in, OTP and payments arrive with the backend in Parts 2 to 4.
          </AppText>
        </View>

        {/* Member registration entry point */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.rule,
            paddingTop: spacing.md,
          }}>
          <AppText variant="bodyStrong">New to the gym?</AppText>
          <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
            Members join online. Staff accounts are issued by the owner.
          </AppText>
          <View style={{ marginTop: spacing.sm }}>
            <Link href="/join" asChild>
              <Button label="Join as a member" icon="add-circle-outline" variant="secondary" fullWidth />
            </Link>
          </View>
        </View>

        <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
          Sessions, password recovery and account security land in Part 2. Nothing on this screen is sent anywhere.
        </AppText>
      </ScrollView>

      {/* Demo workspace preview */}
      <ModalSheet
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview a workspace"
        subtitle="Demo navigation only. Role-based access is enforced by the backend in Part 2.">
        <AppText variant="label" tone="muted">
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
                borderColor: colors.rule,
                backgroundColor: colors.surfaceAlt,
                minHeight: 60,
              }}>
              <Ionicons name="business-outline" size={20} color={colors.inkMuted} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{roleMeta[r].label}</AppText>
                <AppText variant="caption" tone="muted">
                  {openWorkspacePath(r).replace('/(', '').replace(')', '')} Â· demo data
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={tokens.colors.inkSubtle} />
            </PressSurface>
          ))}
        </View>
        <AppText variant="caption" tone="subtle" style={{ marginTop: spacing.sm }}>
          Every workspace shows its role tag in the header and a Demo data badge on live numbers.
        </AppText>
      </ModalSheet>

      {/* Password recovery: honest placeholder */}
      <ModalSheet
        visible={recoverOpen}
        onClose={() => setRecoverOpen(false)}
        title="Forgot password"
        subtitle="Secure recovery flow arrives in Part 2">
        <AppText variant="body">
          Passwords are not reset in this preview. The real flow uses a signed email step, rate limits and account recovery with the gym&apos;s help desk.
        </AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.xs }}>
          Members: talk to the reception desk. Staff: contact the Owner.
        </AppText>
      </ModalSheet>
    </KeyboardAvoidingView>
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
